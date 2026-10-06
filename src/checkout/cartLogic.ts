import type {
  CartLine,
  InventoryItem,
  MarketEvent,
  Order,
  OrderLine,
  OrderSource,
  UserRole,
  Vendor,
} from '../types/domain.ts';
import {
  addCents,
  assertIntegerCents,
  calculateTaxCents,
  formatCurrency,
  multiplyCents,
} from '../lib/money.ts';
import { generatePaymentDetails } from '../payments/paymentProviders.ts';

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function validateVendorAttribution(
  vendorId: string | undefined | null,
  vendorName: string | undefined | null,
  vendorLetter: string | undefined | null
): void {
  if (!vendorId || typeof vendorId !== 'string' || vendorId.trim() === '') {
    throw new Error('Vendor attribution error: Every checkout line must belong to a valid vendor (missing vendorId).');
  }
  if (
    !vendorName ||
    typeof vendorName !== 'string' ||
    vendorName.trim() === '' ||
    vendorName.trim().toLowerCase() === 'unknown vendor' ||
    vendorName.trim().toLowerCase() === 'unknown'
  ) {
    throw new Error('Vendor attribution error: Never allow an "Unknown Vendor" sale line.');
  }
  if (!vendorLetter || typeof vendorLetter !== 'string' || vendorLetter.trim() === '') {
    throw new Error('Vendor attribution error: Missing vendor letter.');
  }
}

export function addHangTagItemToCart(
  currentCart: CartLine[],
  item: InventoryItem,
  vendor: Vendor | undefined,
  options: { allowAdminOverride?: boolean } = {}
): { cart: CartLine[]; addedLineId: string } {
  if (!vendor) {
    throw new Error(`Vendor attribution error: Item ${item.itemCode} is not linked to a valid vendor.`);
  }
  validateVendorAttribution(vendor.id, vendor.name, vendor.vendorLetter);
  assertIntegerCents(item.priceCents, 'item.priceCents');

  if (
    item.tagType === 'HANG_TAG' &&
    (item.status === 'SOLD' || item.quantity <= 0) &&
    !options.allowAdminOverride
  ) {
    const orderRef = item.soldInOrderNumber || 'a previous order';
    throw new Error(`⚠ ${item.itemCode} was already sold in Order ${orderRef}.`);
  }

  // Check if unique hang-tag item is already in the cart
  const existingIdx = currentCart.findIndex(
    (line) => line.itemId === item.id && line.tagType === 'HANG_TAG'
  );

  if (existingIdx !== -1) {
    const existingLine = currentCart[existingIdx];
    if (item.quantity <= existingLine.quantity && !options.allowAdminOverride) {
      throw new Error(
        `⚠ ${item.itemCode} is a unique item (Quantity ${item.quantity}) and is already in the cart.`
      );
    }
    const newQty = existingLine.quantity + 1;
    const updatedLine: CartLine = {
      ...existingLine,
      quantity: newQty,
      lineTotalCents: multiplyCents(existingLine.unitPriceCents, newQty),
    };
    const nextCart = [...currentCart];
    nextCart[existingIdx] = updatedLine;
    return { cart: nextCart, addedLineId: updatedLine.lineId };
  }

  const lineId = generateUuid();
  const newLine: CartLine = {
    lineId,
    itemId: item.id,
    itemCode: item.itemCode,
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorLetter: vendor.vendorLetter,
    dotColor: vendor.dotColor,
    itemName: item.itemName,
    description: item.description || item.itemName,
    unitPriceCents: item.priceCents,
    quantity: 1,
    lineTotalCents: item.priceCents,
    tagType: 'HANG_TAG',
    photoUrl: item.photoUrl,
  };

  return {
    cart: [...currentCart, newLine],
    addedLineId: lineId,
  };
}

export function addDotItemToCart(
  currentCart: CartLine[],
  vendor: Vendor | undefined,
  priceCents: number,
  matchingDotInventoryItem?: InventoryItem
): { cart: CartLine[]; addedLineId: string } {
  if (!vendor) {
    throw new Error('Vendor attribution error: Dot item must be attributed to a valid vendor.');
  }
  validateVendorAttribution(vendor.id, vendor.name, vendor.vendorLetter);
  assertIntegerCents(priceCents, 'dot priceCents');
  if (priceCents <= 0) {
    throw new Error('Dot item price must be greater than $0.00.');
  }

  const itemCode =
    matchingDotInventoryItem?.itemCode ??
    `DOT-${vendor.vendorLetter}-${priceCents}`;
  const itemId =
    matchingDotInventoryItem?.id ??
    `dot-${vendor.id}-${priceCents}`;
  const itemName = `${vendor.dotColor} Dot Item`;
  const description = `${vendor.dotColor} Dot (${formatCurrency(priceCents)}) — ${vendor.name}`;

  // Merge quantity if same vendor and same unit price dot item already exists in cart
  const existingIdx = currentCart.findIndex(
    (line) =>
      line.tagType === 'DOT' &&
      line.vendorId === vendor.id &&
      line.unitPriceCents === priceCents
  );

  if (existingIdx !== -1) {
    const existing = currentCart[existingIdx];
    const nextQty = existing.quantity + 1;
    const updated: CartLine = {
      ...existing,
      quantity: nextQty,
      lineTotalCents: multiplyCents(existing.unitPriceCents, nextQty),
    };
    const nextCart = [...currentCart];
    nextCart[existingIdx] = updated;
    return { cart: nextCart, addedLineId: updated.lineId };
  }

  const lineId = generateUuid();
  const newLine: CartLine = {
    lineId,
    itemId,
    itemCode,
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorLetter: vendor.vendorLetter,
    dotColor: vendor.dotColor,
    itemName,
    description,
    unitPriceCents: priceCents,
    quantity: 1,
    lineTotalCents: priceCents,
    tagType: 'DOT',
  };

  return {
    cart: [...currentCart, newLine],
    addedLineId: lineId,
  };
}

export function updateCartLineQuantity(
  currentCart: CartLine[],
  lineId: string,
  delta: number
): CartLine[] {
  const result: CartLine[] = [];
  for (const line of currentCart) {
    if (line.lineId !== lineId) {
      result.push(line);
      continue;
    }
    const nextQty = line.quantity + delta;
    if (nextQty <= 0) {
      // Remove line if quantity drops to 0
      continue;
    }
    result.push({
      ...line,
      quantity: nextQty,
      lineTotalCents: multiplyCents(line.unitPriceCents, nextQty),
    });
  }
  return result;
}

export function updateCartLinePrice(
  currentCart: CartLine[],
  lineId: string,
  newUnitPriceCents: number,
  role: UserRole
): CartLine[] {
  if (role !== 'OWNER') {
    throw new Error('Permission denied: Only the Owner (Stella) can override item prices.');
  }
  assertIntegerCents(newUnitPriceCents, 'newUnitPriceCents');
  if (newUnitPriceCents <= 0) {
    throw new Error('Unit price must be greater than $0.00.');
  }
  return currentCart.map((line) =>
    line.lineId === lineId
      ? {
          ...line,
          unitPriceCents: newUnitPriceCents,
          lineTotalCents: multiplyCents(newUnitPriceCents, line.quantity),
          priceOverridden: true,
        }
      : line
  );
}

export function removeCartLine(currentCart: CartLine[], lineId: string): CartLine[] {
  return currentCart.filter((line) => line.lineId !== lineId);
}

export function calculateCartTotals(
  cart: CartLine[],
  event?: Pick<MarketEvent, 'taxEnabled' | 'taxRateBps'>
): {
  itemCount: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
} {
  let itemCount = 0;
  const lineTotals: number[] = [];

  for (const line of cart) {
    validateVendorAttribution(line.vendorId, line.vendorName, line.vendorLetter);
    const expectedLineTotal = multiplyCents(line.unitPriceCents, line.quantity);
    lineTotals.push(expectedLineTotal);
    itemCount += line.quantity;
  }

  const subtotalCents = addCents(...lineTotals);
  const taxCents = calculateTaxCents(
    subtotalCents,
    event?.taxRateBps ?? 0,
    event?.taxEnabled ?? false
  );
  const totalCents = addCents(subtotalCents, taxCents);

  return {
    itemCount,
    subtotalCents,
    taxCents,
    totalCents,
  };
}

export function createLocalOrderFromCart(params: {
  cart: CartLine[];
  event: MarketEvent;
  orderSequenceNumber: number;
  deviceId: string;
  source?: OrderSource;
  customOrderNumber?: string;
  notes?: string;
  existingOrderId?: string;
  existingIdempotencyKey?: string;
}): Order {
  const { cart, event, orderSequenceNumber, deviceId } = params;
  if (cart.length === 0) {
    throw new Error('Cannot create an order with an empty cart.');
  }

  // Strictly verify every single cart line has vendor attribution
  for (const line of cart) {
    validateVendorAttribution(line.vendorId, line.vendorName, line.vendorLetter);
  }

  const orderId = params.existingOrderId ?? generateUuid();
  const idempotencyKey = params.existingIdempotencyKey ?? orderId;
  const prefix = (event.orderPrefix || 'MKT').trim().toUpperCase();
  const orderNumber =
    params.customOrderNumber?.trim() || `${prefix}-${orderSequenceNumber}`;

  const totals = calculateCartTotals(cart, event);

  const orderLines: OrderLine[] = cart.map((line) => ({
    id: generateUuid(),
    orderId,
    itemId: line.itemId,
    itemCode: line.itemCode,
    vendorId: line.vendorId,
    vendorName: line.vendorName,
    vendorLetter: line.vendorLetter,
    itemDescription: line.itemName,
    unitPriceCents: line.unitPriceCents,
    quantity: line.quantity,
    lineTotalCents: multiplyCents(line.unitPriceCents, line.quantity),
    tagType: line.tagType,
  }));

  const paymentDetails = generatePaymentDetails({
    provider: event.paymentProvider,
    recipientIdentifier: event.paymentIdentifier,
    amountCents: totals.totalCents,
    orderNumber,
    eventName: event.name,
    customTemplate: event.customPaymentTemplate,
  });

  return {
    id: orderId,
    orderNumber,
    eventId: event.id,
    createdAt: new Date().toISOString(),
    paymentStatus: 'PENDING',
    paymentProvider: event.paymentProvider,
    paymentUrl: paymentDetails.paymentUrl,
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    source: params.source ?? 'REGISTER',
    deviceId,
    syncStatus: 'PENDING_SYNC',
    idempotencyKey,
    notes: params.notes,
    lines: orderLines,
  };
}
