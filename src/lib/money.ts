/**
 * Money calculation module for Booth Checkout.
 * All financial calculations use exact integer cents ($12.50 = 1250 cents)
 * to eliminate IEEE-754 floating-point precision errors.
 */

export function assertIntegerCents(cents: number, label = 'amount'): void {
  if (typeof cents !== 'number' || !Number.isFinite(cents) || !Number.isInteger(cents)) {
    throw new Error(`Invalid integer cents for ${label}: ${String(cents)}`);
  }
}

export function addCents(...amounts: number[]): number {
  let sum = 0;
  for (const amount of amounts) {
    assertIntegerCents(amount, 'addCents operand');
    sum += amount;
  }
  return sum;
}

export function subtractCents(a: number, b: number): number {
  assertIntegerCents(a, 'minuend');
  assertIntegerCents(b, 'subtrahend');
  return a - b;
}

export function multiplyCents(unitPriceCents: number, quantity: number): number {
  assertIntegerCents(unitPriceCents, 'unitPriceCents');
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0) {
    throw new Error(`Invalid quantity: ${String(quantity)}`);
  }
  return unitPriceCents * quantity;
}

export function calculateTaxCents(
  subtotalCents: number,
  taxRateBps: number,
  taxEnabled: boolean
): number {
  assertIntegerCents(subtotalCents, 'subtotalCents');
  if (!taxEnabled || taxRateBps <= 0) {
    return 0;
  }
  return Math.round((subtotalCents * taxRateBps) / 10000);
}

/**
 * Converts integer cents into an exact two-decimal string without currency symbol.
 * Examples:
 *  500 -> "5.00"
 *  1250 -> "12.50"
 *  3700 -> "37.00"
 */
export function centsToFixedDecimal(cents: number): string {
  assertIntegerCents(cents, 'centsToFixedDecimal');
  const isNegative = cents < 0;
  const absCents = Math.abs(cents);
  const wholeDollars = Math.floor(absCents / 100);
  const remainderCents = absCents % 100;
  const paddedCents = remainderCents.toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${wholeDollars}.${paddedCents}`;
}

/**
 * Formats integer cents as human-readable currency string.
 * Examples:
 *  2400 -> "$24.00"
 *  -500 -> "-$5.00"
 */
export function formatCurrency(cents: number, currency = 'USD'): string {
  assertIntegerCents(cents, 'formatCurrency');
  const isNegative = cents < 0;
  const absCents = Math.abs(cents);
  const wholeDollars = Math.floor(absCents / 100);
  const remainderCents = absCents % 100;
  const formattedWhole = wholeDollars.toLocaleString('en-US');
  const paddedCents = remainderCents.toString().padStart(2, '0');
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  return `${isNegative ? '-' : ''}${symbol}${formattedWhole}.${paddedCents}`;
}

/**
 * Strictly parses a user/spreadsheet price value (in dollars) into integer cents.
 * Returns null if the price is empty, negative, zero (when disallowZero=true), or malformed.
 * Never uses floating-point multiplication (e.g. parseFloat(x) * 100) to avoid 19.99 * 100 = 1998.9999999999998.
 */
export function parsePriceToCents(
  rawInput: string | number | null | undefined,
  options: { allowZero?: boolean } = {}
): number | null {
  if (rawInput === null || rawInput === undefined) {
    return null;
  }

  let normalized: string;
  if (typeof rawInput === 'number') {
    if (!Number.isFinite(rawInput) || rawInput < 0) {
      return null;
    }
    normalized = rawInput.toString();
  } else if (typeof rawInput === 'string') {
    normalized = rawInput.trim();
  } else {
    return null;
  }

  if (!normalized) {
    return null;
  }

  // Strip optional leading currency symbol ($) and thousands commas if properly formatted
  if (normalized.startsWith('$')) {
    normalized = normalized.slice(1).trim();
  }

  // Reject if commas are misplaced; allow valid thousands commas e.g. 1,250.00
  if (normalized.includes(',')) {
    if (!/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(normalized)) {
      return null;
    }
    normalized = normalized.replace(/,/g, '');
  }

  // Match strict non-negative decimal with at most 2 decimal places
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) {
    return null;
  }

  const dollarsPart = parseInt(match[1], 10);
  const centsStr = (match[2] ?? '').padEnd(2, '0');
  const centsPart = parseInt(centsStr, 10);

  const totalCents = dollarsPart * 100 + centsPart;
  if (!options.allowZero && totalCents <= 0) {
    return null;
  }

  return totalCents;
}
