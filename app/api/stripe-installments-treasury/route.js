import Stripe from "stripe";
import {
  installmentCountFromText,
  installmentCountFromSubscription,
} from "@/src/lib/stripeInstallments";
import { adminErrorResponse, requireFirebaseAdmin } from "@/src/lib/serverAdminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
const SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"];
const PRODUCT_FETCH_CONCURRENCY = 6;
const INVOICE_COUNT_CONCURRENCY = 8;

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addRecurringInterval(date, interval, intervalCount, index) {
  const next = new Date(date);
  const count = Math.max(Number(intervalCount) || 1, 1) * index;
  if (interval === "week") next.setUTCDate(next.getUTCDate() + 7 * count);
  else if (interval === "year") next.setUTCFullYear(next.getUTCFullYear() + count);
  else next.setUTCMonth(next.getUTCMonth() + count);
  return next;
}

function startOfWeek(date) {
  const day = date.getUTCDay() || 7;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - day + 1);
  return start;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(date);
}

function formatWeekLabel(weekStart) {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${formatDate(weekStart)} - ${formatDate(end)}`;
}

function productIds(subscription) {
  return subscription.items?.data
    ?.map((item) => item.price?.product)
    .filter((product) => typeof product === "string" && product)
    || [];
}

function productName(subscription, productById) {
  return subscription.items?.data
    ?.map((item) => {
      const product = item.price?.product;
      if (typeof product === "object") return product.name || "";
      return productById.get(product)?.name || item.price?.nickname || "";
    })
    .filter(Boolean)
    .join(" + ") || "Abonnement";
}

function subscriptionUnitAmount(subscription) {
  return subscription.items?.data?.reduce((total, item) => {
    const unit = amount(item.price?.unit_amount);
    const quantity = amount(item.quantity || 1);
    return total + unit * quantity;
  }, 0) || 0;
}

function customerDetails(subscription) {
  const customer = subscription.customer;
  if (!customer || typeof customer !== "object") {
    return { name: "Client Stripe", email: "", id: String(customer || "") };
  }
  return {
    name: customer.name || customer.email || "Client Stripe",
    email: customer.email || "",
    id: customer.id || "",
  };
}

function installmentCountWithProducts(subscription, productById) {
  const fromSubscription = installmentCountFromSubscription(subscription);
  if (fromSubscription > 1) return fromSubscription;

  for (const item of subscription.items?.data || []) {
    const product = item.price?.product;
    const hydratedProduct = typeof product === "string" ? productById.get(product) : product;
    const parsed = installmentCountFromText([
      item.price?.nickname || "",
      hydratedProduct?.name || "",
      hydratedProduct?.description || "",
    ].join(" "));
    if (parsed > 1) return parsed;
  }
  return 0;
}

async function fetchProductsById(stripe, subscriptions) {
  const ids = [...new Set(subscriptions.flatMap((subscription) => productIds(subscription)))];
  const products = await mapWithConcurrency(ids, PRODUCT_FETCH_CONCURRENCY, async (productId) => {
    try {
      return [productId, await stripe.products.retrieve(productId)];
    } catch (error) {
      console.warn(`[stripe-installments-treasury] produit Stripe ignore ${productId}:`, error?.message || error);
      return [productId, null];
    }
  });
  return new Map(products.filter(([, product]) => product));
}

async function listInstallmentSubscriptions(stripe) {
  const subscriptions = [];
  for (const status of SUBSCRIPTION_STATUSES) {
    for await (const subscription of stripe.subscriptions.list({
      status,
      limit: 100,
      expand: ["data.customer"],
    })) {
      subscriptions.push(subscription);
    }
  }
  const productById = await fetchProductsById(stripe, subscriptions);
  return subscriptions
    .map((subscription) => ({
      subscription,
      installments: installmentCountWithProducts(subscription, productById),
      productLabel: productName(subscription, productById),
    }))
    .filter((item) => item.installments > 1);
}

async function countPaidInvoices(stripe, subscriptionId, maxInvoices = 12) {
  const invoices = await stripe.invoices.list({
    subscription: subscriptionId,
    status: "paid",
    limit: Math.max(Math.min(maxInvoices, 100), 1),
  });
  return invoices.data.filter((invoice) => invoice.paid).length;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

function buildSchedule(subscription, remainingInvoices, invoiceAmount) {
  const firstDate = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  const firstItem = subscription.items?.data?.[0];
  const recurring = firstItem?.price?.recurring || {};
  if (!firstDate || !Number.isFinite(firstDate.getTime()) || !invoiceAmount || remainingInvoices <= 0) {
    return [];
  }

  return Array.from({ length: remainingInvoices }, (_, index) => {
    const date = addRecurringInterval(firstDate, recurring.interval, recurring.interval_count, index);
    return {
      date: dateKey(date),
      label: formatDate(date),
      amount: invoiceAmount,
      installmentNumber: subscription.paidInvoices + index + 1,
    };
  });
}

export async function GET(request) {
  try {
    await requireFirebaseAdmin(request);
  } catch (error) {
    return adminErrorResponse(error);
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json({ ok: false, error: "STRIPE_SECRET_KEY manquant" }, { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const installmentSubscriptions = await listInstallmentSubscriptions(stripe);
    const rows = await mapWithConcurrency(installmentSubscriptions, INVOICE_COUNT_CONCURRENCY, async ({ subscription, installments, productLabel }) => {
      if (!ACTIVE_STATUSES.has(subscription.status)) return null;

      const paidInvoices = await countPaidInvoices(stripe, subscription.id, installments + 3);
      const remainingInvoices = Math.max(installments - paidInvoices, 0);
      const invoiceAmount = subscriptionUnitAmount(subscription);
      const completed = paidInvoices >= installments;
      const customer = customerDetails(subscription);
      const row = {
        id: subscription.id,
        status: subscription.status,
        customerName: customer.name,
        customerEmail: customer.email,
        customerId: customer.id,
        product: productLabel,
        installments,
        paidInvoices,
        remainingInvoices,
        invoiceAmount,
        expectedAmount: remainingInvoices * invoiceAmount,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        cancelAt: subscription.cancel_at ? dateKey(new Date(subscription.cancel_at * 1000)) : null,
        currentPeriodEnd: subscription.current_period_end ? dateKey(new Date(subscription.current_period_end * 1000)) : null,
        currentPeriodEndLabel: subscription.current_period_end ? formatDate(new Date(subscription.current_period_end * 1000)) : "",
        interval: subscription.items?.data?.[0]?.price?.recurring?.interval || "month",
        intervalCount: subscription.items?.data?.[0]?.price?.recurring?.interval_count || 1,
        completed,
        nextInvoices: [],
      };
      row.nextInvoices = buildSchedule({ ...subscription, paidInvoices }, remainingInvoices, invoiceAmount);
      return row;
    });
    const filteredRows = rows.filter(Boolean);

    const weeklyMap = new Map();
    for (const row of filteredRows) {
      for (const invoice of row.nextInvoices) {
        const date = new Date(`${invoice.date}T00:00:00.000Z`);
        const weekStart = startOfWeek(date);
        const key = dateKey(weekStart);
        const current = weeklyMap.get(key) || {
          weekStart: key,
          label: formatWeekLabel(weekStart),
          amount: 0,
          invoices: 0,
          subscriptions: new Set(),
        };
        current.amount += invoice.amount;
        current.invoices += 1;
        current.subscriptions.add(row.id);
        weeklyMap.set(key, current);
      }
    }

    const weekly = [...weeklyMap.values()]
      .map((week) => ({
        ...week,
        subscriptions: week.subscriptions.size,
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    const upcomingInvoices = filteredRows
      .flatMap((row) =>
        (row.nextInvoices || []).map((invoice) => ({
          ...invoice,
          subscriptionId: row.id,
          customerName: row.customerName,
          customerEmail: row.customerEmail,
          customerId: row.customerId,
          product: row.product,
          status: row.status,
          installments: row.installments,
          paidInvoices: row.paidInvoices,
          remainingInvoices: row.remainingInvoices,
        }))
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.customerName.localeCompare(b.customerName, "fr"));

    const totals = filteredRows.reduce(
      (acc, row) => ({
        activeSubscriptions: acc.activeSubscriptions + 1,
        completedSubscriptions: acc.completedSubscriptions + (row.completed ? 1 : 0),
        remainingInvoices: acc.remainingInvoices + row.remainingInvoices,
        expectedAmount: acc.expectedAmount + row.expectedAmount,
        monthlyRunRate: acc.monthlyRunRate + (!row.completed ? row.invoiceAmount : 0),
      }),
      { activeSubscriptions: 0, completedSubscriptions: 0, remainingInvoices: 0, expectedAmount: 0, monthlyRunRate: 0 },
    );

    return Response.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      totals,
      subscriptions: filteredRows.sort((a, b) => b.expectedAmount - a.expectedAmount || a.customerName.localeCompare(b.customerName, "fr")),
      weekly,
      upcomingInvoices,
    });
  } catch (error) {
    console.error("[stripe-installments-treasury] erreur Stripe:", error);
    return Response.json(
      { ok: false, error: error?.message || "Erreur Stripe pendant le chargement des abonnements." },
      { status: Number(error?.statusCode) || 500 },
    );
  }
}
