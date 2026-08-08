// Resolve the currently-applicable €/kWh ENERGY price for a connector from its
// OCPI tariffs. NDW publishes the raw OCPI tariff structure (elements with
// price_components + restrictions). We pick, per the connector's power and the
// generation moment (Europe/Amsterdam local time), the cheapest applicable
// ENERGY price — that becomes the "current price" baked into the static data.
import type { OCPITariff, OCPITariffElement, OCPITariffRestrictions } from './types.js';

export interface ResolvedPrice {
  price: number; // raw OCPI ENERGY price (the value operators advertise, ex-VAT per spec)
  vat?: number; // VAT percentage, informational
}

// Sanity window: NDW carries placeholder values (0.01, 2.95, …). Anything
// outside a plausible public-charging band is treated as "no price".
const MIN_PLAUSIBLE = 0.05;
const MAX_PLAUSIBLE = 5.0;

interface NowParts {
  date: string; // YYYY-MM-DD
  hhmm: string; // HH:MM
  weekday: string; // MONDAY … SUNDAY
}

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// Break a Date into Europe/Amsterdam local parts for restriction matching.
export function nowParts(now: Date): NowParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  let hour = parts.hour ?? '00';
  if (hour === '24') hour = '00';
  return { date, hhmm: `${hour}:${parts.minute}`, weekday: (parts.weekday ?? '').toUpperCase() };
}

function matchesRestrictions(r: OCPITariffRestrictions | undefined, powerKw: number, t: NowParts): boolean {
  if (!r) return true;

  // Power band — only enforce when we actually know the connector's power
  // (NDW omits max_electric_power for the majority of connectors).
  if (powerKw > 0) {
    if (r.min_power != null && powerKw < r.min_power) return false;
    if (r.max_power != null && powerKw > r.max_power) return false;
  }

  // Day of week.
  if (r.day_of_week && r.day_of_week.length && !r.day_of_week.includes(t.weekday)) return false;

  // Date validity window.
  if (r.start_date && t.date < r.start_date) return false;
  if (r.end_date && t.date > r.end_date) return false;

  // Time-of-day window (supports overnight ranges where start > end, and
  // one-sided windows where only one bound is given).
  const s = r.start_time ?? null;
  const e = r.end_time ?? null;
  if (s && e) {
    const within = s <= e ? t.hhmm >= s && t.hhmm <= e : t.hhmm >= s || t.hhmm <= e;
    if (!within) return false;
  } else if (s) {
    if (t.hhmm < s) return false;
  } else if (e) {
    if (t.hhmm > e) return false;
  }
  return true;
}

function energyPriceFromElement(el: OCPITariffElement): ResolvedPrice | null {
  const ec = el.price_components?.find((pc) => pc.type === 'ENERGY');
  if (!ec || typeof ec.price !== 'number') return null;
  if (ec.price < MIN_PLAUSIBLE || ec.price > MAX_PLAUSIBLE) return null;
  return { price: ec.price, vat: ec.vat };
}

// Cheapest currently-applicable ENERGY price across all of a connector's tariffs.
export function resolveConnectorPrice(tariffs: OCPITariff[], powerKw: number, now: Date): ResolvedPrice | null {
  const t = nowParts(now);
  let best: ResolvedPrice | null = null;
  for (const tariff of tariffs) {
    for (const el of tariff.elements ?? []) {
      if (!matchesRestrictions(el.restrictions, powerKw, t)) continue;
      const p = energyPriceFromElement(el as OCPITariffElement);
      if (p && (!best || p.price < best.price)) best = p;
    }
  }
  return best;
}
