// Vacances scolaires par zone (calendrier officiel de l'Éducation nationale).
// endDate = dernier jour de vacances, returnDate = jour de la reprise des cours.
export const WINTER_SCHOOL_HOLIDAYS_2027 = [
  {
    zone: "C",
    startDate: "2027-02-06",
    endDate: "2027-02-21",
    returnDate: "2027-02-22",
    color: "#b4234b",
    background: "#fce8ee",
    academies: "Créteil, Montpellier, Paris, Toulouse et Versailles",
    cities: "Créteil, Montpellier, Paris, Toulouse et Versailles",
  },
  {
    zone: "A",
    startDate: "2027-02-13",
    endDate: "2027-02-28",
    returnDate: "2027-03-01",
    color: "#0f766e",
    background: "#dff6f1",
    academies: "Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon et Poitiers",
    cities: "Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon et Poitiers",
  },
  {
    zone: "B",
    startDate: "2027-02-20",
    endDate: "2027-03-07",
    returnDate: "2027-03-08",
    color: "#9a6700",
    background: "#fff1c2",
    academies: "Aix-Marseille, Amiens, Lille, Nancy-Metz, Nantes, Nice, Normandie, Orléans-Tours, Reims, Rennes et Strasbourg",
    cities: "Aix-en-Provence, Marseille, Amiens, Lille, Nancy, Metz, Nantes, Nice, Caen, Rouen, Orléans, Tours, Reims, Rennes et Strasbourg",
  },
];

const SCHOOL_HOLIDAYS = [...WINTER_SCHOOL_HOLIDAYS_2027];

export const HOLIDAY_ZONES = ["A", "B", "C"];

const dayKey = (value) => String(value || "").slice(0, 10);

/** Zones dont les vacances couvrent toute la session, ex. ["A", "C"]. Vide hors périodes à zones (été). */
export function sessionHolidayZones(session) {
  const start = dayKey(session?.startDate);
  const end = dayKey(session?.endDate);
  if (!start || !end) return [];
  return SCHOOL_HOLIDAYS
    .filter((holiday) => start >= holiday.startDate && end <= holiday.endDate)
    .map((holiday) => holiday.zone)
    .sort();
}

/** Zones couvertes par au moins une des sessions. */
export function sessionsHolidayZones(sessions) {
  const zones = new Set((Array.isArray(sessions) ? sessions : []).flatMap(sessionHolidayZones));
  return HOLIDAY_ZONES.filter((zone) => zones.has(zone));
}

/** "Zone A", "Zones A et C", "Zones A, B et C" */
export function formatHolidayZones(zones) {
  const list = Array.isArray(zones) ? zones : [];
  if (!list.length) return "";
  if (list.length === 1) return `Zone ${list[0]}`;
  return `Zones ${list.slice(0, -1).join(", ")} et ${list[list.length - 1]}`;
}

/** Académies de chaque zone, pour une infobulle. */
export function holidayZonesDetail(zones) {
  return (Array.isArray(zones) ? zones : [])
    .map((zone) => {
      const holiday = SCHOOL_HOLIDAYS.find((entry) => entry.zone === zone);
      return holiday ? `Zone ${zone} : ${holiday.academies}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function holidayZoneColor(zone) {
  return SCHOOL_HOLIDAYS.find((entry) => entry.zone === zone) || { color: "#5b4b6f", background: "#f5edf9" };
}
