/** "14-17 ans", "14-17" and "14 - 17" are the same age group: "14-17". */
export function normalizeAge(value) {
  return String(value || "").replace(/\s*ans\s*$/i, "").replace(/\s*-\s*/g, "-").trim();
}

/** "14-17 ans", whatever way the age group was written in the dashboard. */
export function ageLabel(value) {
  const age = normalizeAge(value);
  return age ? `${age} ans` : "";
}

/** "6-9 / 10-13 / 14-17 ans" */
export function ageGroupsLabel(groups) {
  const ages = (Array.isArray(groups) ? groups : []).map(normalizeAge).filter(Boolean);
  return ages.length ? `${ages.join(" / ")} ans` : "";
}
