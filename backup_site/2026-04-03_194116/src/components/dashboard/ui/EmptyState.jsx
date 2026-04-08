"use client";

export default function EmptyState({ title, description, ctaLabel, onCta }) {
  return (
    <div className="dash-empty-state">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16M6 11h12M9 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <h3>{title}</h3>
      <p>{description}</p>
      {ctaLabel ? (
        <button type="button" className="dash-btn dash-btn-primary" onClick={onCta}>
          {ctaLabel}
        </button>
      ) : null}
    </div>
  );
}
