"use client";

import { useEffect } from "react";

const SIZE_CLASS = {
  sm: "dash-modal-sm",
  md: "dash-modal-md",
  lg: "dash-modal-lg",
};

export default function Modal({ isOpen, onClose, title, children, size = "md", closeOnBackdrop = true, closeOnEscape = true }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (event) => {
      if (closeOnEscape && event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, closeOnEscape]);

  if (!isOpen) return null;

  return (
    <div className="dash-modal-backdrop" onClick={closeOnBackdrop ? onClose : undefined} role="presentation">
      <div className={`dash-modal-card ${SIZE_CLASS[size] || SIZE_CLASS.md}`} onClick={(e) => e.stopPropagation()}>
        <div className="dash-modal-header">
          <h3>{title}</h3>
          <button type="button" className="dash-icon-btn" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="dash-modal-body">{children}</div>
      </div>
    </div>
  );
}
