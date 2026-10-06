import { holidayZoneColor, holidayZonesDetail } from "@/src/lib/schoolHolidays";

/** Pastilles "Zone A", "Zone C"… avec les académies en infobulle. Rien hors périodes à zones. */
export default function HolidayZoneChips({ zones, label = "Vacances", small = false, className = "" }) {
  if (!Array.isArray(zones) || !zones.length) return null;
  const size = small
    ? { fontSize: "0.68rem", padding: "1px 7px" }
    : { fontSize: "0.75rem", padding: "2px 9px" };
  return (
    <span
      className={className}
      title={holidayZonesDetail(zones)}
      style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}
    >
      {label ? (
        <span style={{ ...size, padding: 0, fontWeight: 600, color: "#6a5f86" }}>{label}</span>
      ) : null}
      {zones.map((zone) => {
        const { color, background } = holidayZoneColor(zone);
        return (
          <span
            key={zone}
            style={{ ...size, fontWeight: 800, color, background, borderRadius: 999, lineHeight: 1.6, whiteSpace: "nowrap" }}
          >
            Zone {zone}
          </span>
        );
      })}
    </span>
  );
}
