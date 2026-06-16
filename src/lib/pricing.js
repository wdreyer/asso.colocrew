function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function clampRange(min, max) {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  if (safeMin <= safeMax) return { min: safeMin, max: safeMax };
  return { min: safeMax, max: safeMin };
}

function parseRangeFromString(value) {
  const matches = String(value || "").match(/\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length === 0) return null;
  const numeric = matches
    .map((item) => toNumber(item))
    .filter((item) => item !== null);
  if (numeric.length === 0) return null;
  if (numeric.length === 1) return { min: numeric[0], max: numeric[0] };
  return clampRange(Math.min(...numeric), Math.max(...numeric));
}

function pickFirstNumeric(obj, keys) {
  for (const key of keys) {
    const value = toNumber(obj?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function rangeFromPrimitive(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return { min: value, max: value };
  if (typeof value === "string") return parseRangeFromString(value);
  return null;
}

function dateKey(value) {
  if (!value) return "";
  const raw = typeof value === "object" ? value.startDate : value;
  return String(raw || "").trim().slice(0, 10);
}

export function extractPriceRange(source) {
  if (source === null || source === undefined) return { min: 0, max: 0 };

  const primitiveRange = rangeFromPrimitive(source);
  if (primitiveRange) return clampRange(primitiveRange.min, primitiveRange.max);

  if (typeof source !== "object") return { min: 0, max: 0 };

  const minKeys = ["priceMin", "minPrice", "prixMin", "tarifMin", "min"];
  const maxKeys = ["priceMax", "maxPrice", "prixMax", "tarifMax", "max"];
  const singleValueKeys = ["basePrice", "price", "tarif", "prix", "priceRange", "tarifRange"];

  let min = pickFirstNumeric(source, minKeys);
  let max = pickFirstNumeric(source, maxKeys);

  if (min !== null && max !== null) return clampRange(min, max);
  if (min !== null && max === null) return clampRange(min, min);
  if (min === null && max !== null) return clampRange(max, max);

  for (const key of singleValueKeys) {
    const range = rangeFromPrimitive(source?.[key]);
    if (range) return clampRange(range.min, range.max);
  }

  return { min: 0, max: 0 };
}

export function resolveSejourPriceRange(sejour, selectedStartDate = "") {
  const fallback = extractPriceRange(sejour);
  const selectedKey = dateKey(selectedStartDate);

  const promotion = sejour?.promotion && typeof sejour.promotion === "object"
    ? sejour.promotion
    : null;
  const promoKey = promotion?.active ? dateKey(promotion.startDate) : "";

  if (selectedKey && promoKey && selectedKey === promoKey) {
    const promotionRange = extractPriceRange(promotion);
    if (promotionRange.min > 0 || promotionRange.max > 0) {
      return promotionRange;
    }
  }

  if (!selectedKey || !Array.isArray(sejour?.dates)) {
    return fallback;
  }

  const entry = sejour.dates.find((item) => {
    if (!item || typeof item !== "object") return false;
    return dateKey(item) === selectedKey;
  });

  if (!entry) return fallback;

  const entryRange = extractPriceRange(entry);
  if (entryRange.min === 0 && entryRange.max === 0) return fallback;
  return entryRange;
}

export function resolveLowestSejourPriceRange(sejour) {
  const fallback = extractPriceRange(sejour);
  const ranges = Array.isArray(sejour?.dates)
    ? sejour.dates
        .map((entry) => extractPriceRange(entry))
        .filter((range) => range.min > 0 || range.max > 0)
    : [];
  const promotion = sejour?.promotion && typeof sejour.promotion === "object" && sejour.promotion.active
    ? extractPriceRange(sejour.promotion)
    : null;
  if (promotion && (promotion.min > 0 || promotion.max > 0)) {
    ranges.push(promotion);
  }

  if (!ranges.length) return fallback;

  return ranges.reduce((lowest, current) => {
    if (!lowest) return current;
    return current.min < lowest.min ? current : lowest;
  }, null);
}

export function applyPriceRangeAdjustments(
  range,
  { discountFactor = 1, transportFee = 0, insuranceFee = 0, flatDiscount = 0 } = {},
) {
  const safeRange = extractPriceRange(range);
  const safeFactor = Number.isFinite(discountFactor) ? discountFactor : 1;
  const safeTransport = Number(transportFee) || 0;
  const safeInsurance = Number(insuranceFee) || 0;
  const safeFlatDiscount = Number(flatDiscount) || 0;

  const min = Math.max(
    0,
    safeRange.min * safeFactor + safeTransport + safeInsurance - safeFlatDiscount,
  );
  const max = Math.max(
    0,
    safeRange.max * safeFactor + safeTransport + safeInsurance - safeFlatDiscount,
  );

  return clampRange(min, max);
}

export function normalizeChildCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function siblingDiscountFactor(childCount) {
  const safeChildCount = normalizeChildCount(childCount);
  if (safeChildCount === 2) return 0.95;
  if (safeChildCount >= 3) return 0.9;
  return 1;
}

export function calculateReservationPriceRange(
  range,
  {
    childCount = 1,
    discountFactor = siblingDiscountFactor(childCount),
    transportFee = 0,
    insuranceFee = 0,
    flatDiscount = 0,
  } = {},
) {
  const safeRange = extractPriceRange(range);
  const safeChildCount = normalizeChildCount(childCount);
  const safeFactor = Number.isFinite(discountFactor) ? discountFactor : 1;
  const safeTransport = Number(transportFee) || 0;
  const safeInsurance = Number(insuranceFee) || 0;
  const safeFlatDiscount = Number(flatDiscount) || 0;

  const perChildMin = safeRange.min * safeFactor + safeTransport + safeInsurance;
  const perChildMax = safeRange.max * safeFactor + safeTransport + safeInsurance;

  return clampRange(
    Math.max(0, perChildMin * safeChildCount - safeFlatDiscount),
    Math.max(0, perChildMax * safeChildCount - safeFlatDiscount),
  );
}

export function formatPriceNumber(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return rounded.toLocaleString("fr-FR", {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatPriceRange(range, suffix = "€") {
  const safe = extractPriceRange(range);
  if (safe.min === safe.max) return `${formatPriceNumber(safe.min)} ${suffix}`.trim();
  return `${formatPriceNumber(safe.min)} - ${formatPriceNumber(safe.max)} ${suffix}`.trim();
}

