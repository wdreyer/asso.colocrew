import { redirect } from "next/navigation";

export default function LegacyReservationsPage() {
  redirect("/dashboard/reservations");
}
