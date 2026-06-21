"use client";

import "@/src/styles/dashboard.css";
import "@/src/styles/transport-additions.css";
import { AuthProvider } from "@/src/contexts/AuthContext";
import { ToastProvider } from "@/src/contexts/ToastContext";
import Toast from "@/src/components/dashboard/ui/Toast";

export default function DashboardRootLayout({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        {children}
        <Toast />
      </ToastProvider>
    </AuthProvider>
  );
}
