export function installmentCountFromText(value) {
  const match = String(value || "").match(/paiement\s+en\s+(\d+)\s+fois/i);
  return match ? Number(match[1]) : 0;
}

export function installmentCountFromSubscription(subscription) {
  const metadataCount = Number(
    subscription?.metadata?.installments
      || subscription?.metadata?.installmentsCount
      || subscription?.metadata?.installments_total
      || subscription?.metadata?.installments_remaining
      || 0,
  );
  if (Number.isFinite(metadataCount) && metadataCount > 1) return Math.round(metadataCount);

  for (const item of subscription?.items?.data || []) {
    const product = item?.price?.product;
    const name = typeof product === "object" ? product.name : "";
    const description = typeof product === "object" ? product.description : "";
    const parsed = installmentCountFromText(`${name} ${description}`);
    if (parsed > 1) return parsed;
  }
  return 0;
}

export async function countPaidInvoicesForSubscription(stripe, subscriptionId) {
  let count = 0;
  for await (const invoice of stripe.invoices.list({ subscription: subscriptionId, status: "paid", limit: 100 })) {
    if (invoice.paid) count += 1;
  }
  return count;
}

export async function syncInstallmentSubscriptionCancellation(stripe, subscriptionOrId) {
  const subscription = typeof subscriptionOrId === "string"
    ? await stripe.subscriptions.retrieve(subscriptionOrId, { expand: ["items.data.price.product"] })
    : subscriptionOrId;

  if (!subscription?.id || subscription.status === "canceled") {
    return { subscriptionId: subscription?.id || "", action: "skip", reason: "already_canceled" };
  }

  const installments = installmentCountFromSubscription(subscription);
  if (!installments || installments <= 1) {
    return { subscriptionId: subscription.id, action: "skip", reason: "not_installments" };
  }

  const paidInvoices = await countPaidInvoicesForSubscription(stripe, subscription.id);
  if (paidInvoices >= installments) {
    if (subscription.cancel_at_period_end) {
      return { subscriptionId: subscription.id, action: "already_scheduled", installments, paidInvoices };
    }

    if (subscription.cancel_at) {
      await stripe.subscriptions.update(subscription.id, { cancel_at: null });
    }

    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
      metadata: {
        ...subscription.metadata,
        installments: String(installments),
        paid_installment_invoices: String(paidInvoices),
        auto_cancel_reason: "installments_completed",
      },
    });
    return { subscriptionId: subscription.id, action: "scheduled_cancel_at_period_end", installments, paidInvoices };
  }

  const metadata = {
    ...subscription.metadata,
    installments: String(installments),
    paid_installment_invoices: String(paidInvoices),
    auto_cancel_reason: "installments_not_completed",
  };

  if (subscription.cancel_at) {
    await stripe.subscriptions.update(subscription.id, {
      cancel_at: null,
      metadata,
    });
  } else if (subscription.cancel_at_period_end) {
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
      metadata,
    });
  } else if (String(subscription.metadata?.installments || "") !== String(installments)) {
    await stripe.subscriptions.update(subscription.id, {
      metadata: {
        ...subscription.metadata,
        installments: String(installments),
        paid_installment_invoices: String(paidInvoices),
      },
    });
  }

  return { subscriptionId: subscription.id, action: "keep_active", installments, paidInvoices };
}
