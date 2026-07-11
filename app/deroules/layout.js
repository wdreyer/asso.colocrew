"use client";

import "@/src/styles/dashboard.css";
import { ToastProvider } from "@/src/contexts/ToastContext";
import Toast from "@/src/components/dashboard/ui/Toast";

export default function DayPlansLayout({ children }) {
  return <ToastProvider>{children}<Toast /></ToastProvider>;
}
