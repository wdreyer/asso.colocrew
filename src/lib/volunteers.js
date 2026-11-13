/**
 * Bénévoles : réponses au formulaire de /edito-2026, gérées dans /dashboard/benevoles.
 *
 * Plain JavaScript (no React, no Firebase) so the API route, the public form and the dashboard
 * share the same lists and checks.
 *
 * Document `benevoles/{id}`:
 *   firstName, lastName, phone, email            text
 *   interests: ["conception", "direction", …]    keys of VOLUNTEER_INTERESTS
 *   availability: "half-day-week" | …            key of VOLUNTEER_AVAILABILITY
 *   message                                      optional free text
 *   status: "new" | "contacted" | "active" | "archived"
 *   notes                                        admin notes
 *   source: "edito-2026", createdAt, updatedAt
 */

export const VOLUNTEER_INTEREST_GROUPS = [
  {
    key: "sejours",
    label: "Séjours",
    hint: "Plusieurs choix possibles",
    options: [
      { key: "conception", label: "Conception", short: "Conception" },
      { key: "direction", label: "Direction", short: "Direction" },
      { key: "animation", label: "Animation", short: "Animation" },
    ],
  },
  {
    key: "inscriptions",
    label: "Inscriptions",
    hint: "Prospection, réponses aux familles, suivi des dossiers",
    options: [{ key: "inscriptions", label: "Inscriptions", short: "Inscriptions" }],
  },
  {
    key: "administratif",
    label: "Administratif",
    hint: "Subventions, documents, process",
    options: [{ key: "administratif", label: "Administratif", short: "Administratif" }],
  },
  {
    key: "ca",
    label: "Conseil d'administration",
    hint: "Décisions et suivi de l'association",
    options: [{ key: "ca", label: "Conseil d'administration", short: "CA" }],
  },
];

export const VOLUNTEER_INTERESTS = VOLUNTEER_INTEREST_GROUPS.flatMap((group) =>
  group.options.map((option) => ({
    ...option,
    group: group.key,
    fullLabel: group.options.length > 1 ? `${option.label} de séjour` : option.label,
  })),
);

export const VOLUNTEER_AVAILABILITY = [
  { key: "half-day-week", label: "½ journée par semaine" },
  { key: "day-week", label: "1 journée par semaine et +" },
  { key: "day-month", label: "1 journée par mois" },
];

export const VOLUNTEER_STATUSES = [
  { key: "new", label: "Nouveau", variant: "warning" },
  { key: "contacted", label: "Contacté·e", variant: "info" },
  { key: "active", label: "Dans l'équipe", variant: "success" },
  { key: "archived", label: "Archivé", variant: "neutral" },
];

export const HELLOASSO_MEMBERSHIP_URL = "https://www.helloasso.com/associations/colocrew/adhesions/adhesion-a-colocrew-1";

const interestKeys = new Set(VOLUNTEER_INTERESTS.map((interest) => interest.key));
const availabilityKeys = new Set(VOLUNTEER_AVAILABILITY.map((option) => option.key));

export function interestLabel(key) {
  return VOLUNTEER_INTERESTS.find((interest) => interest.key === key)?.fullLabel || key;
}

export function interestShort(key) {
  return VOLUNTEER_INTERESTS.find((interest) => interest.key === key)?.short || key;
}

export function availabilityLabel(key) {
  return VOLUNTEER_AVAILABILITY.find((option) => option.key === key)?.label || "";
}

export function volunteerStatus(key) {
  return VOLUNTEER_STATUSES.find((status) => status.key === key) || VOLUNTEER_STATUSES[0];
}

function clean(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Checks and normalises a form submission.
 * Returns `{ value }` ready to store, or `{ errors: { field: message } }`.
 */
export function validateVolunteer(input = {}) {
  const value = {
    firstName: clean(input.firstName, 80),
    lastName: clean(input.lastName, 80),
    phone: clean(input.phone, 30),
    email: clean(input.email, 160).toLowerCase(),
    interests: [...new Set((Array.isArray(input.interests) ? input.interests : []).filter((key) => interestKeys.has(key)))],
    availability: availabilityKeys.has(input.availability) ? input.availability : "",
    message: String(input.message ?? "").trim().slice(0, 1500),
  };
  const errors = {};
  if (!value.firstName) errors.firstName = "Ton prénom";
  if (!value.lastName) errors.lastName = "Ton nom";
  if (value.phone.replace(/\D/g, "").length < 9) errors.phone = "Un numéro où te joindre";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) errors.email = "Une adresse email valide";
  if (!value.interests.length) errors.interests = "Choisis au moins une mission";
  if (!value.availability) errors.availability = "Choisis une disponibilité";
  return Object.keys(errors).length ? { errors } : { value };
}
