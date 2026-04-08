"use client";

import { useToast } from "@/src/contexts/ToastContext";

export default function Toast() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="dash-toast-stack">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`dash-toast dash-toast-${toast.variant}`}
          onClick={() => removeToast(toast.id)}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
