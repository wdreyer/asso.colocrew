"use client";

import ProtectedRoute from "@/src/components/auth/ProtectedRoute";
import DashboardLayout from "@/src/layouts/DashboardLayout";

export default function ProtectedDashboardLayout({ children }) {
  return (
    <ProtectedRoute>
      <DashboardLayout>{children}</DashboardLayout>
    </ProtectedRoute>
  );
}
