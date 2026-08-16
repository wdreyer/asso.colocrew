import fs from "node:fs";
import Stripe from "stripe";
import {
  countPaidInvoicesForSubscription,
  installmentCountFromSubscription,
  syncInstallmentSubscriptionCancellation,
} from "../src/lib/stripeInstallments.js";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const rows = [];

for await (const listedSubscription of stripe.subscriptions.list({ status: "all", limit: 100 })) {
  if (listedSubscription.status === "canceled") continue;
  const subscription = await stripe.subscriptions.retrieve(listedSubscription.id, {
    expand: ["items.data.price.product"],
  });
  const installments = installmentCountFromSubscription(subscription);
  if (!installments || installments <= 1) continue;

  const paidInvoices = await countPaidInvoicesForSubscription(stripe, subscription.id);
  const currentCancelAt = subscription.cancel_at
    ? new Date(subscription.cancel_at * 1000).toISOString().slice(0, 10)
    : "";
  const shouldCancelAtPeriodEnd = paidInvoices >= installments;
  const action = shouldCancelAtPeriodEnd
    ? subscription.cancel_at_period_end
      ? "already_scheduled"
      : "schedule_cancel_at_period_end"
    : (subscription.cancel_at || subscription.cancel_at_period_end)
      ? "clear_early_cancel"
      : "keep_active";

  let applied = null;
  if (shouldApply && action !== "already_scheduled" && action !== "keep_active") {
    applied = await syncInstallmentSubscriptionCancellation(stripe, subscription);
  }

  rows.push({
    id: subscription.id,
    status: subscription.status,
    customer: subscription.customer,
    product: subscription.items?.data?.[0]?.price?.product?.name || "",
    installments,
    paidInvoices,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    cancelAt: currentCancelAt,
    action,
    applied,
  });
}

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  totalInstallmentSubscriptions: rows.length,
  summary: rows.reduce((acc, row) => {
    acc[row.action] = (acc[row.action] || 0) + 1;
    return acc;
  }, {}),
  rows,
}, null, 2));

process.exit(0);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
