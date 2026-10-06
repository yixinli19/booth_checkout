import type {
  EventReconciliationReport,
  ImportBatch,
  InventoryItem,
  MarketEvent,
  Order,
  OrderAdjustment,
  OrderLine,
  Vendor,
  VendorReconciliationSummary,
} from '../types/domain.ts';
import { addCents, centsToFixedDecimal, formatCurrency } from '../lib/money.ts';
import { type SheetExportSpec, writeXlsxWorkbook } from '../lib/xlsx.ts';

/**
 * Generates the comprehensive Event Reconciliation Report and runs the mandatory
 * three-way Financial Integrity Validation:
 *   SUM(order line totals) === SUM(vendor gross sales) === event gross merchandise sales
 */
export function generateEventReconciliationReport(params: {
  event: MarketEvent;
  vendors: Vendor[];
  inventory: InventoryItem[];
  orders: Order[];
  adjustments: OrderAdjustment[];
}): EventReconciliationReport {
  const { event, vendors, inventory, orders, adjustments } = params;

  const completedOrders = orders.filter(
    (o) =>
      o.eventId === event.id &&
      (o.paymentStatus === 'COMPLETED' || o.paymentStatus === 'ADJUSTED')
  );

  const unsyncedOrdersCount = completedOrders.filter(
    (o) => o.syncStatus !== 'SYNCED'
  ).length;
  const paperRecoveryOrdersCount = completedOrders.filter(
    (o) => o.source === 'PAPER_RECOVERY'
  ).length;

  // 1. Event gross merchandise sales (sum of completed order subtotals before tax/adjustments)
  const grossMerchandiseSalesCents = addCents(
    ...completedOrders.map((o) => o.subtotalCents)
  );

  // 2. Sum of all order line totals across completed orders
  const allCompletedLines: OrderLine[] = [];
  for (const order of completedOrders) {
    for (const line of order.lines) {
      allCompletedLines.push(line);
    }
  }

  const sumOfOrderLineTotalsCents = addCents(
    ...allCompletedLines.map((l) => l.lineTotalCents)
  );

  // Group lines and adjustments by vendorId
  const linesByVendor = new Map<string, OrderLine[]>();
  for (const line of allCompletedLines) {
    const vId = line.vendorId;
    const list = linesByVendor.get(vId) ?? [];
    list.push(line);
    linesByVendor.set(vId, list);
  }

  const adjustmentsByVendor = new Map<string, number>();
  let totalAdjustmentsCents = 0;
  for (const adj of adjustments) {
    if (adj.eventId !== event.id) continue;
    totalAdjustmentsCents = addCents(totalAdjustmentsCents, adj.deltaTotalCents);
    if (adj.vendorId) {
      const prev = adjustmentsByVendor.get(adj.vendorId) ?? 0;
      adjustmentsByVendor.set(adj.vendorId, addCents(prev, adj.deltaTotalCents));
    }
  }

  // Ensure all vendors (plus any vendor referenced in order lines) are included
  const vendorMap = new Map<string, Vendor>();
  for (const v of vendors) {
    if (v.eventId === event.id) {
      vendorMap.set(v.id, v);
    }
  }

  const vendorSummaries: VendorReconciliationSummary[] = [];
  for (const vendor of vendorMap.values()) {
    const vendorItems = inventory.filter(
      (i) => i.vendorId === vendor.id && i.status !== 'REMOVED'
    );
    const totalItemsSubmitted = vendorItems.length;
    const totalUnitsSubmitted = vendorItems.reduce(
      (acc, i) => acc + (i.initialQuantity || i.quantity || 1),
      0
    );

    const soldLines = linesByVendor.get(vendor.id) ?? [];
    const itemsSoldCount = soldLines.reduce((acc, l) => acc + l.quantity, 0);
    const grossSalesCents = addCents(...soldLines.map((l) => l.lineTotalCents));
    const vendorAdjustmentsCents = adjustmentsByVendor.get(vendor.id) ?? 0;
    const netBeforeCommission = addCents(grossSalesCents, vendorAdjustmentsCents);
    const commissionCents =
      event.commissionRateBps > 0
        ? Math.round((Math.max(0, netBeforeCommission) * event.commissionRateBps) / 10000)
        : 0;
    const finalPayoutCents = netBeforeCommission - commissionCents;

    vendorSummaries.push({
      vendorId: vendor.id,
      vendorLetter: vendor.vendorLetter,
      vendorName: vendor.name,
      contactName: vendor.contactName,
      dotColor: vendor.dotColor,
      totalItemsSubmitted,
      totalUnitsSubmitted,
      itemsSoldCount,
      grossSalesCents,
      adjustmentsCents: vendorAdjustmentsCents,
      commissionCents,
      finalPayoutCents,
      soldLines,
    });
  }

  vendorSummaries.sort((a, b) => a.vendorLetter.localeCompare(b.vendorLetter));

  // 3. Sum of vendor gross sales
  const sumOfVendorGrossSalesCents = addCents(
    ...vendorSummaries.map((v) => v.grossSalesCents)
  );

  const totalOwnerCommissionCents = addCents(
    ...vendorSummaries.map((v) => v.commissionCents)
  );
  const netVendorPayoutTotalCents = addCents(
    ...vendorSummaries.map((v) => v.finalPayoutCents)
  );
  const totalUnitsSold = vendorSummaries.reduce((acc, v) => acc + v.itemsSoldCount, 0);

  // Check if any order lines belonged to a vendorId not in vendorMap
  let unmappedLineCents = 0;
  for (const [vId, lines] of linesByVendor.entries()) {
    if (!vendorMap.has(vId)) {
      unmappedLineCents += addCents(...lines.map((l) => l.lineTotalCents));
    }
  }

  const isReconciled =
    sumOfOrderLineTotalsCents === sumOfVendorGrossSalesCents &&
    sumOfOrderLineTotalsCents === grossMerchandiseSalesCents &&
    unmappedLineCents === 0;

  const discrepancyCents =
    Math.abs(grossMerchandiseSalesCents - sumOfOrderLineTotalsCents) +
    Math.abs(sumOfOrderLineTotalsCents - sumOfVendorGrossSalesCents);

  let discrepancyDetails: string | undefined;
  if (!isReconciled) {
    const reasons: string[] = [];
    if (grossMerchandiseSalesCents !== sumOfOrderLineTotalsCents) {
      reasons.push(
        `Event gross merchandise sales (${formatCurrency(grossMerchandiseSalesCents)}) != Sum of order line totals (${formatCurrency(sumOfOrderLineTotalsCents)})`
      );
    }
    if (sumOfOrderLineTotalsCents !== sumOfVendorGrossSalesCents) {
      reasons.push(
        `Sum of order line totals (${formatCurrency(sumOfOrderLineTotalsCents)}) != Sum of vendor gross sales (${formatCurrency(sumOfVendorGrossSalesCents)})`
      );
    }
    if (unmappedLineCents !== 0) {
      reasons.push(
        `Found ${formatCurrency(unmappedLineCents)} in order lines attributed to unknown/missing vendor records.`
      );
    }
    discrepancyDetails = reasons.join(' | ');
  }

  return {
    eventId: event.id,
    eventName: event.name,
    generatedAt: new Date().toISOString(),
    grossMerchandiseSalesCents,
    sumOfOrderLineTotalsCents,
    sumOfVendorGrossSalesCents,
    totalAdjustmentsCents,
    totalOwnerCommissionCents,
    netVendorPayoutTotalCents,
    completedOrdersCount: completedOrders.length,
    unsyncedOrdersCount,
    paperRecoveryOrdersCount,
    totalUnitsSold,
    isReconciled,
    discrepancyCents,
    discrepancyDetails,
    vendorSummaries,
  };
}

/**
 * Generates the Vendor Reconciliation Excel (.xlsx) workbook for a specific vendor.
 * CRITICAL REQUIREMENT (Section 19):
 * Mirrors the vendor's original inventory workbook structure as closely as possible:
 * - Preserves original sheet/tab names
 * - Preserves original columns and column order
 * - Preserves original row ordering
 * - Appends: | Qty Sold | Sales Total | Remaining |
 */
export function generateVendorReconciliationXlsx(params: {
  vendor: Vendor;
  vendorSummary: VendorReconciliationSummary;
  vendorInventory: InventoryItem[];
  importBatches: ImportBatch[];
  reconciliationReport: EventReconciliationReport;
}): Uint8Array {
  const { vendor, vendorSummary, vendorInventory, importBatches, reconciliationReport } =
    params;

  if (!reconciliationReport.isReconciled) {
    throw new Error(
      `Reconciliation Error: Cannot export vendor payout report while financial integrity check is failing (${reconciliationReport.discrepancyDetails}).`
    );
  }

  // Aggregate sold quantity and sales total by itemId and itemCode
  const soldByItemId = new Map<string, { qtySold: number; salesCents: number }>();
  const soldByItemCode = new Map<string, { qtySold: number; salesCents: number }>();
  const matchedLineIds = new Set<string>();

  for (const line of vendorSummary.soldLines) {
    const prevId = soldByItemId.get(line.itemId) ?? { qtySold: 0, salesCents: 0 };
    soldByItemId.set(line.itemId, {
      qtySold: prevId.qtySold + line.quantity,
      salesCents: addCents(prevId.salesCents, line.lineTotalCents),
    });

    const codeKey = line.itemCode.toUpperCase();
    const prevCode = soldByItemCode.get(codeKey) ?? { qtySold: 0, salesCents: 0 };
    soldByItemCode.set(codeKey, {
      qtySold: prevCode.qtySold + line.quantity,
      salesCents: addCents(prevCode.salesCents, line.lineTotalCents),
    });
  }

  const itemById = new Map<string, InventoryItem>();
  const itemByCode = new Map<string, InventoryItem>();
  for (const item of vendorInventory) {
    itemById.set(item.id, item);
    itemByCode.set(item.itemCode.toUpperCase(), item);
  }

  // Find import batch(es) associated with this vendor's inventory
  const vendorBatchIds = new Set(
    vendorInventory.map((i) => i.importBatchId).filter((id): id is string => Boolean(id))
  );
  const matchingBatches = importBatches.filter(
    (b) => b.vendorId === vendor.id || vendorBatchIds.has(b.id)
  );

  const exportSheets: SheetExportSpec[] = [];
  const accountedItemCodes = new Set<string>();

  if (matchingBatches.length > 0) {
    for (const batch of matchingBatches) {
      for (const origSheet of batch.sheets) {
        const preservedHeaders = [
          ...origSheet.headers,
          'Qty Sold',
          'Sales Total',
          'Remaining',
        ];
        const sortedOrigRows = [...origSheet.rows].sort(
          (a, b) => a.rowIndex - b.rowIndex
        );

        const rows: Array<Array<string | number>> = [];
        for (const origRow of sortedOrigRows) {
          const item =
            (origRow.linkedItemId ? itemById.get(origRow.linkedItemId) : undefined) ??
            (origRow.linkedItemCode
              ? itemByCode.get(origRow.linkedItemCode.toUpperCase())
              : undefined);

          // Skip if this row belonged to a different vendor in a multi-vendor sheet
          if (item && item.vendorId !== vendor.id) {
            continue;
          }

          const codeKey = (item?.itemCode ?? origRow.linkedItemCode ?? '').toUpperCase();
          if (codeKey) accountedItemCodes.add(codeKey);

          const soldStats =
            (item ? soldByItemId.get(item.id) : undefined) ??
            (codeKey ? soldByItemCode.get(codeKey) : undefined) ?? {
              qtySold: 0,
              salesCents: 0,
            };

          const initialQty = item?.initialQuantity ?? 1;
          const remainingQty = Math.max(0, initialQty - soldStats.qtySold);

          const originalCellValues = origSheet.headers.map(
            (h) => origRow.cells[h] ?? ''
          );

          rows.push([
            ...originalCellValues,
            soldStats.qtySold,
            Number(centsToFixedDecimal(soldStats.salesCents)),
            remainingQty,
          ]);
        }

        // Also include any Dot Sticker sales or un-sheeted sales for this vendor
        const dotLines = vendorSummary.soldLines.filter(
          (l) => !accountedItemCodes.has(l.itemCode.toUpperCase())
        );

        if (dotLines.length > 0) {
          // Group dot lines by itemCode / unitPriceCents
          const groupedDot = new Map<
            string,
            { code: string; desc: string; unitCents: number; qty: number; totalCents: number }
          >();
          for (const dl of dotLines) {
            const k = `${dl.itemCode}-${dl.unitPriceCents}`;
            const prev = groupedDot.get(k) ?? {
              code: dl.itemCode,
              desc: dl.itemDescription,
              unitCents: dl.unitPriceCents,
              qty: 0,
              totalCents: 0,
            };
            groupedDot.set(k, {
              ...prev,
              qty: prev.qty + dl.quantity,
              totalCents: addCents(prev.totalCents, dl.lineTotalCents),
            });
            matchedLineIds.add(dl.id);
          }

          for (const g of groupedDot.values()) {
            const filler = origSheet.headers.map((_, idx) => {
              if (idx === 0) return g.code;
              if (idx === 1) return g.desc;
              if (idx === 2) return Number(centsToFixedDecimal(g.unitCents));
              return '';
            });
            rows.push([
              ...filler,
              g.qty,
              Number(centsToFixedDecimal(g.totalCents)),
              0,
            ]);
          }
        }

        exportSheets.push({
          sheetName: origSheet.sheetName,
          headers: preservedHeaders,
          rows,
        });
      }
    }
  } else {
    // Reconstruct original sheets from item-level originalSheetName + originalRowData + originalRowIndex
    const itemsBySheet = new Map<string, InventoryItem[]>();
    for (const item of vendorInventory) {
      const sName = item.originalSheetName || `${vendor.vendorLetter} - Inventory`;
      const list = itemsBySheet.get(sName) ?? [];
      list.push(item);
      itemsBySheet.set(sName, list);
    }

    if (itemsBySheet.size === 0) {
      itemsBySheet.set(`${vendor.vendorLetter} - Inventory`, []);
    }

    let firstSheet = true;
    for (const [sheetName, sheetItems] of itemsBySheet.entries()) {
      sheetItems.sort(
        (a, b) => (a.originalRowIndex ?? 9999) - (b.originalRowIndex ?? 9999)
      );

      // Determine original headers from originalRowData if present, else standard columns
      let origHeaders: string[] = ['Item #', 'Description', 'Price', 'Quantity'];
      const firstWithData = sheetItems.find(
        (i) => i.originalRowData && Object.keys(i.originalRowData).length > 0
      );
      if (firstWithData?.originalRowData) {
        origHeaders = Object.keys(firstWithData.originalRowData);
      }

      const headers = [...origHeaders, 'Qty Sold', 'Sales Total', 'Remaining'];
      const rows: Array<Array<string | number>> = [];

      for (const item of sheetItems) {
        accountedItemCodes.add(item.itemCode.toUpperCase());
        const soldStats =
          soldByItemId.get(item.id) ??
          soldByItemCode.get(item.itemCode.toUpperCase()) ?? {
            qtySold: 0,
            salesCents: 0,
          };
        const initialQty = item.initialQuantity ?? 1;
        const remainingQty = Math.max(0, initialQty - soldStats.qtySold);

        const baseCells = item.originalRowData
          ? origHeaders.map((h) => item.originalRowData![h] ?? '')
          : [
              item.itemCode,
              item.itemName,
              Number(centsToFixedDecimal(item.priceCents)),
              initialQty,
            ];

        rows.push([
          ...baseCells,
          soldStats.qtySold,
          Number(centsToFixedDecimal(soldStats.salesCents)),
          remainingQty,
        ]);
      }

      if (firstSheet) {
        firstSheet = false;
        const unlinkedLines = vendorSummary.soldLines.filter(
          (l) => !accountedItemCodes.has(l.itemCode.toUpperCase())
        );
        const groupedDot = new Map<
          string,
          { code: string; desc: string; unitCents: number; qty: number; totalCents: number }
        >();
        for (const dl of unlinkedLines) {
          const k = `${dl.itemCode}-${dl.unitPriceCents}`;
          const prev = groupedDot.get(k) ?? {
            code: dl.itemCode,
            desc: dl.itemDescription,
            unitCents: dl.unitPriceCents,
            qty: 0,
            totalCents: 0,
          };
          groupedDot.set(k, {
            ...prev,
            qty: prev.qty + dl.quantity,
            totalCents: addCents(prev.totalCents, dl.lineTotalCents),
          });
        }
        for (const g of groupedDot.values()) {
          const filler = origHeaders.map((_, idx) => {
            if (idx === 0) return g.code;
            if (idx === 1) return g.desc;
            if (idx === 2) return Number(centsToFixedDecimal(g.unitCents));
            if (idx === 3) return g.qty;
            return '';
          });
          rows.push([
            ...filler,
            g.qty,
            Number(centsToFixedDecimal(g.totalCents)),
            0,
          ]);
        }
      }

      exportSheets.push({
        sheetName,
        headers,
        rows,
      });
    }
  }

  return writeXlsxWorkbook(exportSheets);
}

/**
 * Generates the Market-Level 5-tab Excel workbook required in Section 24:
 * - Summary tab
 * - Orders tab
 * - Order Lines tab
 * - Vendor Payouts tab
 * - Inventory tab
 */
export function generateMarketMasterXlsx(params: {
  event: MarketEvent;
  report: EventReconciliationReport;
  orders: Order[];
  inventory: InventoryItem[];
  vendors: Vendor[];
}): Uint8Array {
  const { event, report, orders, inventory, vendors } = params;

  if (!report.isReconciled) {
    throw new Error(
      `Reconciliation Error: Cannot export market payout report while financial integrity check is failing (${report.discrepancyDetails}).`
    );
  }

  const vendorById = new Map(vendors.map((v) => [v.id, v]));

  // Tab 1: Summary
  const summarySheet: SheetExportSpec = {
    sheetName: 'Summary',
    headers: ['Metric', 'Value'],
    rows: [
      ['Event Name', event.name],
      ['Event Date', event.date],
      ['Location', event.location],
      ['Order Prefix', event.orderPrefix],
      ['Payment Provider', event.paymentProvider],
      ['Completed Orders', report.completedOrdersCount],
      ['Total Units Sold', report.totalUnitsSold],
      ['Gross Merchandise Sales', Number(centsToFixedDecimal(report.grossMerchandiseSalesCents))],
      ['Sum of Order Line Totals', Number(centsToFixedDecimal(report.sumOfOrderLineTotalsCents))],
      ['Sum of Vendor Gross Sales', Number(centsToFixedDecimal(report.sumOfVendorGrossSalesCents))],
      ['Adjustments Total', Number(centsToFixedDecimal(report.totalAdjustmentsCents))],
      ['Owner Commission Total', Number(centsToFixedDecimal(report.totalOwnerCommissionCents))],
      ['Net Vendor Payout Total', Number(centsToFixedDecimal(report.netVendorPayoutTotalCents))],
      ['Reconciliation Status', report.isReconciled ? 'VERIFIED OK' : 'RECONCILIATION ERROR'],
    ],
  };

  // Tab 2: Orders
  const eventOrders = orders.filter((o) => o.eventId === event.id);
  const ordersSheet: SheetExportSpec = {
    sheetName: 'Orders',
    headers: [
      'Order Number',
      'Order UUID',
      'Status',
      'Source',
      'Created At',
      'Completed At',
      'Payment Provider',
      'Line Count',
      'Subtotal',
      'Tax',
      'Total',
      'Sync Status',
    ],
    rows: eventOrders.map((o) => [
      o.orderNumber,
      o.id,
      o.paymentStatus,
      o.source,
      o.createdAt,
      o.completedAt ?? '',
      o.paymentProvider,
      o.lines.reduce((acc, l) => acc + l.quantity, 0),
      Number(centsToFixedDecimal(o.subtotalCents)),
      Number(centsToFixedDecimal(o.taxCents)),
      Number(centsToFixedDecimal(o.totalCents)),
      o.syncStatus,
    ]),
  };

  // Tab 3: Order Lines
  const orderLinesRows: Array<Array<string | number>> = [];
  for (const o of eventOrders) {
    for (const l of o.lines) {
      orderLinesRows.push([
        o.orderNumber,
        o.paymentStatus,
        o.source,
        l.vendorLetter,
        l.vendorName,
        l.itemCode,
        l.itemDescription,
        l.tagType,
        l.quantity,
        Number(centsToFixedDecimal(l.unitPriceCents)),
        Number(centsToFixedDecimal(l.lineTotalCents)),
      ]);
    }
  }
  const orderLinesSheet: SheetExportSpec = {
    sheetName: 'Order Lines',
    headers: [
      'Order Number',
      'Order Status',
      'Source',
      'Vendor Letter',
      'Vendor Name',
      'Item Code',
      'Description',
      'Tag Type',
      'Quantity',
      'Unit Price',
      'Line Total',
    ],
    rows: orderLinesRows,
  };

  // Tab 4: Vendor Payouts
  const vendorPayoutsSheet: SheetExportSpec = {
    sheetName: 'Vendor Payouts',
    headers: [
      'Vendor Letter',
      'Vendor Name',
      'Dot Color',
      'Items Submitted',
      'Units Sold',
      'Gross Sales',
      'Adjustments',
      'Owner Commission',
      'Final Payout',
    ],
    rows: report.vendorSummaries.map((vs) => [
      vs.vendorLetter,
      vs.vendorName,
      vs.dotColor,
      vs.totalItemsSubmitted,
      vs.itemsSoldCount,
      Number(centsToFixedDecimal(vs.grossSalesCents)),
      Number(centsToFixedDecimal(vs.adjustmentsCents)),
      Number(centsToFixedDecimal(vs.commissionCents)),
      Number(centsToFixedDecimal(vs.finalPayoutCents)),
    ]),
  };

  // Tab 5: Inventory
  const inventorySheet: SheetExportSpec = {
    sheetName: 'Inventory',
    headers: [
      'Item Code',
      'Item Name',
      'Vendor Letter',
      'Vendor Name',
      'Tag Type',
      'Price',
      'Initial Qty',
      'Remaining Qty',
      'Status',
      'Original Workbook',
      'Original Sheet',
      'Original Row',
    ],
    rows: inventory
      .filter((i) => i.eventId === event.id)
      .map((i) => [
        i.itemCode,
        i.itemName,
        i.vendorLetter,
        vendorById.get(i.vendorId)?.name ?? i.vendorLetter,
        i.tagType,
        Number(centsToFixedDecimal(i.priceCents)),
        i.initialQuantity,
        i.quantity,
        i.status,
        i.originalWorkbookName ?? '',
        i.originalSheetName ?? '',
        i.originalRowIndex ?? '',
      ]),
  };

  return writeXlsxWorkbook([
    summarySheet,
    ordersSheet,
    orderLinesSheet,
    vendorPayoutsSheet,
    inventorySheet,
  ]);
}
