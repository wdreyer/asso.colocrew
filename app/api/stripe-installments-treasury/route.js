import Stripe from "stripe";
import {
  installmentCountFromSubscription,
} from "@/src/lib/stripeInstallments";
import { adminErrorResponse, requireFirebaseAdmin } from "@/src/lib/serverAdminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
const SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"];
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

function productName(subscription) {
  return subscription.items?.data
    ?.map((item) => {
      const product = item.price?.product;
      return typeof product === "object" ? product.name : "";
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

async function listInstallmentSubscriptions(stripe) {
  const subscriptions = [];
  for (const status of SUBSCRIPTION_STATUSES) {
    for await (const subscription of stripe.subscriptions.list({
      status,
      limit: 100,
      expand: ["data.items.data.price.product", "data.customer"],
    })) {
      const installments = installmentCountFromSubscription(subscription);
      if (installments > 1) subscriptions.push({ subscription, installments });
    }
  }
  return subscriptions;
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
    const rows = await mapWithConcurrency(installmentSubscriptions, INVOICE_COUNT_CONCURRENCY, async ({ subscription, installments }) => {
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
        product: productName(subscription),
        installments,
        paidInvoices,
        remainingInvoices,
        invoiceAmount,
        expectedAmount: remainingInvoices * invoiceAmount,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        cancelAt: subscription.cancel_at ? dateKey(new Date(subscription.cancel_at * 1000)) : null,
        currentPeriodEnd: subscription.current_period_end ? dateKey(new Date(subscription.current_period_end * 1000)) : null,
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
    });
  } catch (error) {
    console.error("[stripe-installments-treasury] erreur Stripe:", error);
    return Response.json(
      { ok: false, error: error?.message || "Erreur Stripe pendant le chargement des abonnements." },
      { status: Number(error?.statusCode) || 500 },
    );
  }
}
