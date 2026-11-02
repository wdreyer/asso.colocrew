/**
 * Convoy helpers for the team space, taken from the former public /convoyages page and reduced to
 * what one team member needs: their portions, their passengers, their tickets.
 */

export const CONSIGNES_ITEMS = [
  "Mettre son tee-shirt ColoCrew et son Hydroflamme si vous en avez un",
  "Être à l’heure au lieu de RDV",
  "Être souriant, répondre aux questions des parents (n’inventez rien : si vous ne savez pas, demandez-nous)",
  "Faire l’appel des enfants et les cocher au fur et à mesure",
  "Demander uniquement régime alimentaire et traitement — notez-les, mais ne récupérez ni ordonnance ni médicaments (l’AS s’en chargera). Vérifier le pique-nique si départ avant 12 h",
  "Si vous êtes 2 ou plus, répartissez-vous les tâches",
  "Dès que les parents partent, vous êtes entièrement responsable des enfants (toilettes, faire connaissance)",
  "Attitude exemplaire et professionnelle (téléphone, messages, vocabulaire)",
  "Parler de Kidizz et de la communication avec les familles",
  "Commencer à appeler les familles en retard 30 min avant le départ du train",
  "Partir sur le quai au moins 20 min avant le départ du train — passé ce délai, les familles en retard vous rejoignent directement sur le quai",
  "À l’entrée du train, compter les enfants avant, pendant et après — les faire monter en premier et rester en dernier",
  "Sur le parcours, s’il manque des pique-niques, de l’eau ou autre, vous pouvez acheter et nous vous remboursons (gardez les tickets)",
];

export const COMMUNICATION_ITEMS = [
  "Envoyez-nous un message quand vous avez tous les enfants, quand vous êtes partis, en cas de retard ou de problème non urgent",
  "S’il manque un enfant, si les numéros des parents ne répondent pas, ou pour tout problème urgent : appelez-nous",
];

export const EMERGENCY_PHONES = [
  { label: "William", number: "0687916897", display: "06 87 91 68 97" },
  { label: "ColoCrew", number: "0611913764", display: "06 11 91 37 64" },
];

export function normalizePlace(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

export function directionLabel(transport) {
  return transport?.direction === "retour" ? "Retour" : "Aller";
}

export function segmentPathLabel(segment) {
  return [segment?.from, ...(segment?.stops || []).map((stop) => stop.city), segment?.to]
    .filter(Boolean)
    .filter((city, index, items) => index === 0 || normalizePlace(city) !== normalizePlace(items[index - 1]))
    .join(" → ");
}

function scheduleMinutes(portion) {
  const match = String(portion?.departureTime || portion?.arrivalTime || "").match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Main segments and branches in travel order. */
export function orderedPortions(transport) {
  const portions = [
    ...(transport?.segments || []).map((segment, index) => ({ ...segment, _type: "segment", _order: index * 2 })),
    ...(transport?.branches || []).map((branch, index) => ({ ...branch, _type: "branch", _order: index * 2 + 1 })),
  ];
  return portions.sort((left, right) => {
    const a = scheduleMinutes(left);
    const b = scheduleMinutes(right);
    if (a !== null && b !== null && a !== b) return a - b;
    if (a !== null && b === null) return -1;
    if (a === null && b !== null) return 1;
    return left._order - right._order;
  });
}

/** Ids under which this member appears in the convoy (staff entry ids and the member id). */
export function myStaffIds(transport, memberId) {
  const ids = new Set([memberId]);
  (transport?.staff || []).forEach((entry) => {
    if (entry.memberId === memberId || entry.id === memberId) ids.add(entry.id);
  });
  ids.delete(undefined);
  ids.delete("");
  return ids;
}

export function myStaffEntry(transport, memberId) {
  return (transport?.staff || []).find((entry) => entry.memberId === memberId || entry.id === memberId) || null;
}

function intersects(values, set) {
  return (values || []).some((value) => set.has(value));
}

export function myPortions(transport, memberId) {
  const ids = myStaffIds(transport, memberId);
  return orderedPortions(transport).filter((portion) => intersects(portion.assignedStaffIds, ids));
}

export function myVehicleGroups(transport, memberId) {
  const ids = myStaffIds(transport, memberId);
  return (transport?.vehicleGroups || []).filter((group) => intersects(group.staffIds, ids));
}

function portionCities(portion) {
  return [portion?.from, ...(portion?.stops || []).map((stop) => stop.city), portion?.to].map(normalizePlace).filter(Boolean);
}

/**
 * Passengers of the convoy this member is in charge of: explicit lists of their portions or
 * vehicles first, then a city match on their portions; the whole convoy when nothing is assigned.
 */
export function passengersInMyScope(transport, memberId) {
  const passengers = transport?.passengers || [];
  const portions = myPortions(transport, memberId);
  const groups = myVehicleGroups(transport, memberId);
  if (!portions.length && !groups.length) return { passengers, scoped: false };

  const explicit = new Set([
    ...portions.flatMap((portion) => portion.passengerReservationIds || portion.coveredReservationIds || []),
    ...groups.flatMap((group) => group.passengerReservationIds || []),
    ...(transport?.tickets || [])
      .filter((ticket) => portions.some((portion) => portion.id && portion.id === ticket.segmentId))
      .flatMap((ticket) => ticket.coveredReservationIds || []),
  ].filter(Boolean));
  const cities = new Set(portions.flatMap(portionCities));
  const finalCity = normalizePlace(transport?.direction === "retour" ? transport?.arrivalCity : transport?.departureCity);
  const matched = passengers.filter((passenger) => {
    if (explicit.size) return explicit.has(passenger.reservationId);
    const city = normalizePlace(passenger.pickupCity);
    return city && city !== finalCity && cities.has(city);
  });
  return matched.length ? { passengers: matched, scoped: true } : { passengers, scoped: false };
}

function ticketForMe(ticket, portionIds, staffIds) {
  if (!ticket?.purchased) return false;
  if (ticket.segmentId && portionIds.has(ticket.segmentId)) return true;
  if (intersects(ticket.coveredStaffIds, staffIds) || intersects(ticket.assignedStaffIds, staffIds)) return true;
  return !ticket.segmentId;
}

function attachmentForMe(attachment, portionIds, staffIds) {
  if (!attachment || attachment.visibleInRoutes === false) return false;
  if (attachment.segmentId && !portionIds.has(attachment.segmentId)) return false;
  const owners = [attachment.staffId, ...(attachment.coveredStaffIds || []), ...(attachment.assignedStaffIds || [])].filter(Boolean);
  if (owners.length && !intersects(owners, staffIds)) return false;
  return Boolean(attachment.url || attachment.bookingReference || attachment.notes || attachment.name);
}

/** Tickets and staff attachments (hotel, booking…) concerning this member. */
export function myTickets(transport, memberId) {
  const staffIds = myStaffIds(transport, memberId);
  const portions = myPortions(transport, memberId);
  const portionIds = new Set((portions.length ? portions : orderedPortions(transport)).map((portion) => portion.id).filter(Boolean));
  const labelOf = (segmentId) => {
    const portion = orderedPortions(transport).find((item) => item.id === segmentId);
    return portion ? segmentPathLabel(portion) : "";
  };
  const documents = [
    ...(transport?.tickets || []).filter((ticket) => ticketForMe(ticket, portionIds, staffIds)),
    ...(transport?.staffTicketAttachments || []).filter((attachment) => attachmentForMe(attachment, portionIds, staffIds)),
  ].map((item, index) => ({
    ...item,
    key: item.id || `${item.segmentId || "all"}-${item.bookingReference || item.name || index}`,
    title: item.name || item.title || "Billet",
    route: item.segmentLabel || labelOf(item.segmentId) || [item.from, item.to].filter(Boolean).join(" → "),
  }));
  const seen = new Set();
  return documents.filter((item) => (seen.has(item.key) ? false : seen.add(item.key)));
}

/** Where and when this member meets the group. */
export function myMeeting(transport, memberId) {
  const first = [...myVehicleGroups(transport, memberId), ...myPortions(transport, memberId)]
    .find((item) => item.meetingPoint || item.meetingTime || item.departureTime);
  return {
    city: first?.from || transport?.departureCity || "",
    point: first?.meetingPoint || transport?.meetingPoint || first?.from || transport?.departureCity || "À confirmer",
    time: first?.meetingTime || transport?.meetingTime || first?.departureTime || "",
  };
}

export function childCount(passengers) {
  return (passengers || []).reduce((total, passenger) => total + Math.max(passenger.children?.length || 0, 1), 0);
}

function splitValues(value) {
  if (Array.isArray(value)) return value.flatMap(splitValues);
  return String(value || "").split(/[,\n;]+/).map((item) => item.trim()).filter(Boolean);
}

function stayCode(name) {
  const value = normalizePlace(name);
  if (value.includes("eaux vives")) return "EVCC";
  if (value.includes("surf") || value.includes("my creative")) return "MCSC";
  return String(name || "").trim();
}

/** Reservation fields useful for the roll call. */
export function reservationForRollCall(id, data) {
  const legal = data?.legal || {};
  const phones = [...new Set(splitValues([legal.phone, legal.phones, legal.telephone]))];
  return {
    id,
    status: String(data?.status || "").toLowerCase(),
    numeroDeReservation: data?.numeroDeReservation || "",
    parentName: `${legal.firstName || legal.prenom || ""} ${legal.lastName || legal.nom || ""}`.trim(),
    phones,
    children: Array.isArray(data?.minor?.children) ? data.minor.children : [],
    sejourName: data?.sejour?.name || "",
    stayCode: stayCode(data?.sejour?.name),
    departureCity: data?.transport?.departureCity || "",
    returnCity: data?.transport?.returnCity || "",
  };
}

export function isChecked(passenger) {
  return Boolean(passenger?.checkedIn || passenger?.attendance?.checkedIn);
}

export function childAge(birthDate, onDate) {
  const birth = Date.parse(birthDate || "");
  const at = Date.parse(onDate || "") || Date.now();
  if (!Number.isFinite(birth)) return null;
  const age = Math.floor((at - birth) / (365.25 * 86400000));
  return age > 0 && age < 30 ? age : null;
}
