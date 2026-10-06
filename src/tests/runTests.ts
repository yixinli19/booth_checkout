import {
  addCents,
  centsToFixedDecimal,
  formatCurrency,
  multiplyCents,
  parsePriceToCents,
} from '../lib/money.ts';
import {
  addDotItemToCart,
  addHangTagItemToCart,
  calculateCartTotals,
  createLocalOrderFromCart,
} from '../checkout/cartLogic.ts';
import { lookupItemByCode } from '../inventory/inventoryLookup.ts';
import { generatePaymentDetails } from '../payments/paymentProviders.ts';
import { generateQrMatrix, generateQrSvgString } from '../lib/qrcode.ts';
import { BoothDatabase } from '../offline/db.ts';
import {
  IdempotentServerLedger,
  synchronizePendingOrders,
} from '../sync/syncEngine.ts';
import {
  buildImportArtifacts,
  matchUploadedPhotos,
  validateWorkbookRows,
} from '../imports/importLogic.ts';
import { parseWorkbookBuffer, writeXlsxWorkbook } from '../lib/xlsx.ts';
import {
  generateEventReconciliationReport,
  generateMarketMasterXlsx,
  generateVendorReconciliationXlsx,
} from '../reports/reportLogic.ts';
import type { Order, Vendor } from '../types/domain.ts';

const assert = {
  equal<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
      throw new Error(
        message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  },
  deepEqual<T>(actual: T, expected: T, message?: string): void {
    const aStr = JSON.stringify(actual);
    const eStr = JSON.stringify(expected);
    if (aStr !== eStr) {
      throw new Error(message ?? `Deep equal failed:\nActual:   ${aStr}\nExpected: ${eStr}`);
    }
  },
  ok(value: unknown, message?: string): void {
    if (!value) {
      throw new Error(message ?? `Expected truthy value, got ${String(value)}`);
    }
  },
  match(actual: string, pattern: RegExp, message?: string): void {
    if (!pattern.test(actual)) {
      throw new Error(message ?? `Expected "${actual}" to match ${String(pattern)}`);
    }
  },
  throws(fn: () => unknown, pattern: RegExp): void {
    let threw = false;
    try {
      fn();
    } catch (err) {
      threw = true;
      const msg = err instanceof Error ? err.message : String(err);
      if (!pattern.test(msg)) {
        throw new Error(`Expected error "${msg}" to match ${String(pattern)}`);
      }
    }
    if (!threw) {
      throw new Error(`Expected function to throw matching ${String(pattern)}`);
    }
  },
  async rejects(fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
    let threw = false;
    try {
      await fn();
    } catch (err) {
      threw = true;
      const msg = err instanceof Error ? err.message : String(err);
      if (!pattern.test(msg)) {
        throw new Error(`Expected rejection "${msg}" to match ${String(pattern)}`);
      }
    }
    if (!threw) {
      throw new Error(`Expected promise to reject matching ${String(pattern)}`);
    }
  },
};

interface TestCase {
  name: string;
  fn: () => Promise<void> | void;
}

const tests: TestCase[] = [];
function test(name: string, fn: () => Promise<void> | void) {
  tests.push({ name, fn });
}

// 1. MONEY TESTS
test('1. Money: $5 + $12.50 = $17.50 using integer cents without floating-point error', () => {
  const fiveDollars = parsePriceToCents('$5');
  const twelveFifty = parsePriceToCents('12.50');
  assert.equal(fiveDollars, 500);
  assert.equal(twelveFifty, 1250);

  const sum = addCents(fiveDollars!, twelveFifty!);
  assert.equal(sum, 1750);
  assert.equal(formatCurrency(sum), '$17.50');
  assert.equal(centsToFixedDecimal(sum), '17.50');

  // Classic IEEE-754 float trap: 19.99 * 100 in float is 1998.9999999999998
  assert.equal(parsePriceToCents('19.99'), 1999);
  assert.equal(parsePriceToCents(19.99), 1999);
  assert.equal(multiplyCents(1999, 3), 5997);
});

// 2. VENDOR ATTRIBUTION TESTS
test('2. Vendor attribution: Every CartLine and OrderLine must have vendorId; rejects missing or Unknown Vendor', async () => {
  const db = new BoothDatabase();
  const snap = await db.loadFullSnapshot();
  const itemA002 = snap.inventory.find((i) => i.itemCode === 'A002')!;

  // Missing vendor must throw
  assert.throws(
    () => addHangTagItemToCart([], itemA002, undefined),
    /Vendor attribution error/
  );

  // Unknown Vendor name must throw
  const fakeUnknownVendor: Vendor = {
    ...snap.vendors[0],
    name: 'Unknown Vendor',
  };
  assert.throws(
    () => addHangTagItemToCart([], itemA002, fakeUnknownVendor),
    /Unknown Vendor/
  );

  // Valid vendor succeeds and attaches vendorId
  const anna = snap.vendors.find((v) => v.vendorLetter === 'A')!;
  const { cart } = addHangTagItemToCart([], itemA002, anna);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].vendorId, 'vendor-anna');
  assert.equal(cart[0].vendorLetter, 'A');
});

// 3. UNIQUE INVENTORY & SEARCH SUGGESTIONS TESTS
test('3. Unique inventory: Sold unique item triggers duplicate-sale warning; missing code suggests closest codes without auto-substituting', async () => {
  const db = new BoothDatabase();
  const snap = await db.loadFullSnapshot();

  // A005 was already sold in Order OCT26-1038
  const soldLookup = lookupItemByCode('A005', snap.inventory);
  assert.ok(soldLookup.exactMatch);
  assert.ok(soldLookup.alreadySoldWarning);
  assert.match(
    soldLookup.alreadySoldWarning!.message,
    /A005 was already sold in Order OCT26-1038/
  );

  const anna = snap.vendors.find((v) => v.vendorLetter === 'A')!;
  assert.throws(
    () => addHangTagItemToCart([], soldLookup.exactMatch!, anna),
    /A005 was already sold in Order OCT26-1038/
  );

  // Searching A017 (not in catalog) returns exactMatch: null and suggests A016, A018, A011
  const missLookup = lookupItemByCode('A017', snap.inventory);
  assert.equal(missLookup.exactMatch, null);
  const suggestedCodes = missLookup.suggestions.map((s) => s.itemCode);
  assert.ok(suggestedCodes.includes('A016'));
  assert.ok(suggestedCodes.includes('A018'));
  assert.ok(suggestedCodes.includes('A011'));
});

// 4. QR & PAYMENT URL TESTS
test('4. QR & Payment URL: Generated amount always contains two decimal places (5 -> 5.00, 12.5 -> 12.50) and renders offline SVG QR', () => {
  assert.equal(centsToFixedDecimal(500), '5.00');
  assert.equal(centsToFixedDecimal(1250), '12.50');
  assert.equal(centsToFixedDecimal(3700), '37.00');

  const venmoFive = generatePaymentDetails({
    provider: 'VENMO',
    recipientIdentifier: 'Stella-MakersMarket',
    amountCents: 500,
    orderNumber: 'OCT26-1048',
  });
  assert.equal(venmoFive.formattedAmount, '5.00');
  assert.ok(venmoFive.paymentUrl.includes('amount=5.00'));
  assert.ok(venmoFive.paymentUrl.includes('OCT26-1048'));

  const venmoTwelveFifty = generatePaymentDetails({
    provider: 'VENMO',
    recipientIdentifier: 'Stella-MakersMarket',
    amountCents: 1250,
    orderNumber: 'OCT26-1048',
  });
  assert.equal(venmoTwelveFifty.formattedAmount, '12.50');
  assert.ok(venmoTwelveFifty.paymentUrl.includes('amount=12.50'));

  const qrMatrix = generateQrMatrix(venmoTwelveFifty.paymentUrl);
  assert.ok(qrMatrix.size >= 21);
  const svg = generateQrSvgString(venmoTwelveFifty.paymentUrl);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('<rect'));
});

// 5, 6, 7 & 35. DEMO SCENARIO + OFFLINE ORDER + IDEMPOTENCY + SYNC TESTS
test('5-7 & 35. Demo Scenario (A002 + Bluebird $5 Dot = $37.00, Order OCT26-1048), Offline Creation, Sync, and Idempotency', async () => {
  const db = new BoothDatabase();
  const initialSnap = await db.loadFullSnapshot();
  const serverLedger = new IdempotentServerLedger(initialSnap.orders);

  const anna = initialSnap.vendors.find((v) => v.vendorLetter === 'A')!;
  const bluebird = initialSnap.vendors.find((v) => v.vendorLetter === 'B')!;

  // Baseline Anna and Bluebird sales before Demo Order OCT26-1048
  const baseReport = generateEventReconciliationReport({
    event: initialSnap.events[0],
    vendors: initialSnap.vendors,
    inventory: initialSnap.inventory,
    orders: initialSnap.orders,
    adjustments: initialSnap.adjustments,
  });
  const annaBefore = baseReport.vendorSummaries.find((v) => v.vendorId === anna.id)!.grossSalesCents;
  const bluebirdBefore = baseReport.vendorSummaries.find((v) => v.vendorId === bluebird.id)!.grossSalesCents;

  // Step 1: Operator scans/enters A002 -> Ceramic Vase ($32.00)
  const lookupA002 = lookupItemByCode('A002', initialSnap.inventory);
  assert.ok(lookupA002.exactMatch);
  assert.equal(lookupA002.exactMatch!.itemName, 'Ceramic Vase');
  assert.equal(lookupA002.exactMatch!.priceCents, 3200);

  let { cart } = addHangTagItemToCart([], lookupA002.exactMatch!, anna);

  // Step 2: Customer also has a Bluebird item with a blue dot worth $5
  const dotAdd = addDotItemToCart(cart, bluebird, 500);
  cart = dotAdd.cart;

  // Step 3: Verify Cart total is $37.00 (3700 cents)
  const totals = calculateCartTotals(cart, initialSnap.events[0]);
  assert.equal(totals.totalCents, 3700);
  assert.equal(formatCurrency(totals.totalCents), '$37.00');

  // Step 4: Operator taps Checkout — $37.00 while OFFLINE
  const event = initialSnap.events[0];
  const localOrder = createLocalOrderFromCart({
    cart,
    event,
    orderSequenceNumber: event.nextOrderSeq, // 1048 -> OCT26-1048
    deviceId: 'reg-phone-01',
  });
  assert.equal(localOrder.orderNumber, 'OCT26-1048');
  assert.equal(localOrder.totalCents, 3700);
  assert.ok(localOrder.paymentUrl?.includes('amount=37.00'));
  assert.ok(localOrder.paymentUrl?.includes('Order%20OCT26-1048'));

  // Step 5: Operator presses Payment Received while offline
  const completedOrder: Order = {
    ...localOrder,
    paymentStatus: 'COMPLETED',
    completedAt: new Date().toISOString(),
    syncStatus: 'PENDING_SYNC',
  };
  await db.put('orders', completedOrder);
  await db.put('syncQueue', {
    id: completedOrder.idempotencyKey,
    orderId: completedOrder.id,
    orderNumber: completedOrder.orderNumber,
    payload: completedOrder,
    attempts: 0,
    status: 'PENDING',
    createdAt: completedOrder.completedAt!,
  });

  // Verify offline sync attempt throws informative message and preserves local order
  await assert.rejects(
    () =>
      synchronizePendingOrders({
        db,
        serverLedger,
        isOffline: true,
        useHttpApi: false,
      }),
    /Cannot synchronize while offline/
  );

  const storedOfflineOrder = await db.getById<Order>('orders', completedOrder.id);
  assert.equal(storedOfflineOrder?.syncStatus, 'PENDING_SYNC');

  // Step 6: Connectivity returns -> Sync pending orders
  const syncResult1 = await synchronizePendingOrders({
    db,
    serverLedger,
    isOffline: false,
    useHttpApi: false,
  });
  // Both OCT26-1047 (seed pending) and OCT26-1048 (demo order) sync
  assert.equal(syncResult1.syncedCount, 2);

  const syncedOrderAfter = await db.getById<Order>('orders', completedOrder.id);
  assert.equal(syncedOrderAfter?.syncStatus, 'SYNCED');

  // Step 7: Idempotency — submitting identical order UUID twice creates only ONE server order
  const serverCountBeforeDuplicate = serverLedger.getOrderCount();
  const duplicateAttempt = serverLedger.upsertOrder(completedOrder);
  assert.equal(duplicateAttempt.alreadyExisted, true);
  assert.equal(
    duplicateAttempt.message,
    'This order was already synchronized and was not duplicated.'
  );
  assert.equal(serverLedger.getOrderCount(), serverCountBeforeDuplicate);

  // Step 8: Verify Vendor Accounting: Anna +$32.00 (+3200c), Bluebird +$5.00 (+500c)
  const afterSnap = await db.loadFullSnapshot();
  const afterReport = generateEventReconciliationReport({
    event: afterSnap.events[0],
    vendors: afterSnap.vendors,
    inventory: afterSnap.inventory,
    orders: afterSnap.orders,
    adjustments: afterSnap.adjustments,
  });
  const annaAfter = afterReport.vendorSummaries.find((v) => v.vendorId === anna.id)!.grossSalesCents;
  const bluebirdAfter = afterReport.vendorSummaries.find((v) => v.vendorId === bluebird.id)!.grossSalesCents;

  assert.equal(annaAfter - annaBefore, 3200);
  assert.equal(bluebirdAfter - bluebirdBefore, 500);
  assert.equal(afterReport.isReconciled, true);
});

// 8 & 9. EXCEL IMPORT VALIDATION & LINEAGE PRESERVATION TESTS
test('8 & 9. Import & Excel Lineage: Malformed prices are rejected; imported items retain workbook/sheet/row lineage and export back with preserved structure', async () => {
  // Reject malformed prices
  assert.equal(parsePriceToCents(''), null);
  assert.equal(parsePriceToCents('$12..50'), null);
  assert.equal(parsePriceToCents('abc'), null);
  assert.equal(parsePriceToCents('-15.00'), null);
  assert.equal(parsePriceToCents('12.345'), null);
  assert.equal(parsePriceToCents(0), null);

  // Create a vendor .xlsx workbook with custom tab name and custom column order
  const rawWorkbookBytes = writeXlsxWorkbook([
    {
      sheetName: 'Anna Fall Studio Sheet',
      headers: ['Studio SKU', 'Piece Title', 'Glaze Notes', 'Retail Price', 'Booth Qty'],
      rows: [
        ['A091', 'Porcelain Tea Pitcher', 'Celadon Ash', 44, 1],
        ['A092', 'Broken Price Mug', 'Matte Black', '18..50', 1], // Malformed price!
        ['A093', 'Espresso Cup', 'Speckled Buff', 16.5, 1],
      ],
    },
  ]);

  const parsedWb = await parseWorkbookBuffer('Anna_Custom_Upload.xlsx', rawWorkbookBytes);
  assert.equal(parsedWb.sheets.length, 1);
  assert.equal(parsedWb.sheets[0].sheetName, 'Anna Fall Studio Sheet');
  assert.deepEqual(parsedWb.sheets[0].headers, [
    'Studio SKU',
    'Piece Title',
    'Glaze Notes',
    'Retail Price',
    'Booth Qty',
  ]);

  const mapping = {
    itemCode: 'Studio SKU',
    itemName: 'Piece Title',
    description: 'Glaze Notes',
    price: 'Retail Price',
    quantity: 'Booth Qty',
  };

  const db = new BoothDatabase();
  const snap = await db.loadFullSnapshot();
  const anna = snap.vendors.find((v) => v.vendorLetter === 'A')!;

  // Step 4 validation must flag row A092 with malformed price '18..50'
  const validationWithError = validateWorkbookRows({
    workbook: parsedWb,
    mapping,
    defaultVendor: anna,
    existingVendors: snap.vendors,
    existingInventory: snap.inventory,
  });
  assert.equal(validationWithError.errorCount, 1);
  assert.equal(validationWithError.validRowCount, 2);
  assert.equal(validationWithError.canProceed, false);

  // Fix row A092 price inline -> validation passes
  const validationFixed = validateWorkbookRows({
    workbook: parsedWb,
    mapping,
    defaultVendor: anna,
    existingVendors: snap.vendors,
    existingInventory: snap.inventory,
    rowOverrides: {
      'Anna Fall Studio Sheet:3': { rawPrice: '18.50' },
    },
  });
  assert.equal(validationFixed.errorCount, 0);
  assert.equal(validationFixed.validRowCount, 3);
  assert.equal(validationFixed.canProceed, true);

  const artifacts = buildImportArtifacts({
    eventId: snap.events[0].id,
    workbook: parsedWb,
    validationSummary: validationFixed,
    mapping,
    existingVendors: snap.vendors,
    importedBy: 'Stella (Owner)',
  });

  assert.equal(artifacts.inventoryItems.length, 3);
  const itemA091 = artifacts.inventoryItems.find((i) => i.itemCode === 'A091')!;
  assert.equal(itemA091.originalWorkbookName, 'Anna_Custom_Upload.xlsx');
  assert.equal(itemA091.originalSheetName, 'Anna Fall Studio Sheet');
  assert.equal(itemA091.originalRowIndex, 2);
  assert.equal(itemA091.originalRowData?.['Glaze Notes'], 'Celadon Ash');

  // Verify exported Vendor Reconciliation .xlsx preserves original tab name, columns, and row order + appends Qty Sold, Sales Total, Remaining
  const report = generateEventReconciliationReport({
    event: snap.events[0],
    vendors: snap.vendors,
    inventory: [...snap.inventory, ...artifacts.inventoryItems],
    orders: snap.orders,
    adjustments: snap.adjustments,
  });
  const annaSummary = report.vendorSummaries.find((v) => v.vendorId === anna.id)!;

  const exportedBytes = generateVendorReconciliationXlsx({
    vendor: anna,
    vendorSummary: annaSummary,
    vendorInventory: artifacts.inventoryItems,
    importBatches: [artifacts.importBatch],
    reconciliationReport: report,
  });

  const reparsedExport = await parseWorkbookBuffer('Anna_Reconciliation.xlsx', exportedBytes);
  assert.equal(reparsedExport.sheets[0].sheetName, 'Anna Fall Studio Sheet');
  assert.deepEqual(reparsedExport.sheets[0].headers, [
    'Studio SKU',
    'Piece Title',
    'Glaze Notes',
    'Retail Price',
    'Booth Qty',
    'Qty Sold',
    'Sales Total',
    'Remaining',
  ]);
  assert.equal(reparsedExport.sheets[0].rows[0].valuesByHeader['Studio SKU'], 'A091');
  assert.equal(reparsedExport.sheets[0].rows[0].valuesByHeader['Glaze Notes'], 'Celadon Ash');
});

// 10 & 11. REPORTS, FINANCIAL INTEGRITY & PHOTO MATCHING TESTS
test('10 & 11. Reports & Financial Integrity: Vendor totals equal sum of order lines; Sum of all vendor sales equals event gross merchandise sales; corrupted order triggers Reconciliation Error', async () => {
  const db = new BoothDatabase();
  const snap = await db.loadFullSnapshot();

  const report = generateEventReconciliationReport({
    event: snap.events[0],
    vendors: snap.vendors,
    inventory: snap.inventory,
    orders: snap.orders,
    adjustments: snap.adjustments,
  });

  assert.equal(report.isReconciled, true);
  assert.equal(report.discrepancyCents, 0);
  assert.equal(report.sumOfOrderLineTotalsCents, report.sumOfVendorGrossSalesCents);
  assert.equal(report.sumOfVendorGrossSalesCents, report.grossMerchandiseSalesCents);

  // Verify each vendor's grossSalesCents equals exact sum of that vendor's soldLines
  for (const vs of report.vendorSummaries) {
    const lineSum = addCents(...vs.soldLines.map((l) => l.lineTotalCents));
    assert.equal(vs.grossSalesCents, lineSum);
  }

  // Verify Market Master 5-tab Excel workbook contains Summary, Orders, Order Lines, Vendor Payouts, Inventory
  const masterXlsx = generateMarketMasterXlsx({
    event: snap.events[0],
    report,
    orders: snap.orders,
    inventory: snap.inventory,
    vendors: snap.vendors,
  });
  const parsedMaster = await parseWorkbookBuffer('Market_Master.xlsx', masterXlsx);
  assert.deepEqual(
    parsedMaster.sheets.map((s) => s.sheetName),
    ['Summary', 'Orders', 'Order Lines', 'Vendor Payouts', 'Inventory']
  );

  // Inject a financial discrepancy (corrupted subtotalCents != order lines sum) and verify Reconciliation Error blocks payout export
  const corruptedOrder: Order = {
    ...snap.orders[0],
    subtotalCents: snap.orders[0].subtotalCents + 500, // $5.00 mismatch!
  };
  const badReport = generateEventReconciliationReport({
    event: snap.events[0],
    vendors: snap.vendors,
    inventory: snap.inventory,
    orders: [corruptedOrder, ...snap.orders.slice(1)],
    adjustments: snap.adjustments,
  });
  assert.equal(badReport.isReconciled, false);
  assert.equal(badReport.discrepancyCents, 500);
  assert.throws(
    () =>
      generateMarketMasterXlsx({
        event: snap.events[0],
        report: badReport,
        orders: [corruptedOrder, ...snap.orders.slice(1)],
        inventory: snap.inventory,
        vendors: snap.vendors,
      }),
    /Reconciliation Error/
  );

  // Bulk photo matching test
  const photoMatchRes = matchUploadedPhotos({
    eventId: snap.events[0].id,
    uploadedFiles: [
      { fileName: 'A002.jpg', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }, // Duplicate of seed photo
      { fileName: 'Z999.jpg', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }, // Unmatched
    ],
    inventory: snap.inventory,
    existingPhotos: snap.photos,
  });
  assert.equal(photoMatchRes.duplicateCount, 1);
  assert.equal(photoMatchRes.unmatchedCount, 1);
});

async function run() {
  console.log('====================================================');
  console.log('  BOOTH CHECKOUT — AUTOMATED BUSINESS LOGIC SUITE');
  console.log('====================================================\n');

  let passed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  ✓ PASS: ${t.name}`);
    } catch (err) {
      console.error(`  ✗ FAIL: ${t.name}`);
      console.error(err);
      throw err;
    }
  }

  console.log(`\n====================================================`);
  console.log(`  ALL ${passed}/${tests.length} TEST SUITES PASSED SUCCESSFULLY`);
  console.log(`====================================================`);
}

run();
