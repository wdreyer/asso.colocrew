"use client";

const VARIANT_CLASS = {
  success: "dash-badge dash-badge-success",
  warning: "dash-badge dash-badge-warning",
  error: "dash-badge dash-badge-error",
  info: "dash-badge dash-badge-info",
  neutral: "dash-badge dash-badge-neutral",
};

export default function Badge({ label, variant = "neutral" }) {
  return <span className={VARIANT_CLASS[variant] || VARIANT_CLASS.neutral}>{label}</span>;
}
