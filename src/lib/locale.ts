const FR = 'fr-FR';

export const formatEUR = (value: number): string =>
  new Intl.NumberFormat(FR, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

/** No-decimal EUR formatter for round amounts (MPR primes, plafonds, etc.). */
export const formatEUR0 = (value: number): string =>
  new Intl.NumberFormat(FR, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

export const formatNumber = (value: number, fractionDigits = 2): string =>
  new Intl.NumberFormat(FR, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);

export const formatPercent = (value: number, fractionDigits = 2): string =>
  new Intl.NumberFormat(FR, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / 100);

// Short date format for compact UI surfaces (guide cards, list items): "15/05/2026".
export const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(FR, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
};

// Long date format for prose / freshness signals: "15 mai 2026".
// Required form for body copy per FR content audit ([[feedback-fr-content-audit]]).
export const formatDateLong = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(FR, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
};

/**
 * Parse a FR-formatted number string. Accepts:
 *   "5000"           -> 5000
 *   "5000.50"        -> 5000.5   (en-US fallback)
 *   "5000,50"        -> 5000.5   (FR)
 *   "12 345,67"      -> 12345.67 (FR with espace insécable or regular space)
 *   "12 345,67 €"    -> 12345.67 (currency-stripped)
 *   ""               -> 0
 *
 * Used by simulator inputs so users can type values with or without the
 * espace insécable thousand separator that formatEUR emits.
 */
export function parseFR(value: string): number {
  if (!value) return 0;
  const stripped = value.replace(/[^\d,.\-]/g, '');
  let normalized: string;
  if (stripped.includes(',')) {
    // FR format: comma is decimal sep, dot (if present) is thousand sep.
    normalized = stripped.replace(/\./g, '').replace(',', '.');
  } else {
    // No comma: assume en-US (dot decimal) or pure integer.
    normalized = stripped;
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
