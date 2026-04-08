"use client";

export default function SkeletonLoader({ variant = "line" }) {
  if (variant === "card") {
    return (
      <div className="dash-skeleton dash-skeleton-card">
        <div className="dash-skeleton-line" />
        <div className="dash-skeleton-line short" />
      </div>
    );
  }

  if (variant === "table-row") {
    return (
      <div className="dash-skeleton-row">
        <div className="dash-skeleton-line" />
        <div className="dash-skeleton-line" />
        <div className="dash-skeleton-line" />
      </div>
    );
  }

  return <div className="dash-skeleton-line" />;
}
