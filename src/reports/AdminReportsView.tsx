import React, { useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  ShieldCheck,
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import { useBooth } from '../context/BoothContext.tsx';
import { formatCurrency } from '../lib/money.ts';
import {
  generateMarketMasterXlsx,
  generateVendorReconciliationXlsx,
} from './reportLogic.ts';
import { getDotColorConfig } from '../offline/seedData.ts';

function downloadXlsxBytes(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const AdminReportsView: React.FC = () => {
  const {
    activeEvent,
    reconciliationReport,
    vendors,
    inventory,
    orders,
    importBatches,
    recordAuditEvent,
  } = useBooth();

  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(
    vendors[0]?.id ?? null
  );
  const [exportToast, setExportToast] = useState<string | null>(null);

  const selectedVendor = useMemo(
    () => vendors.find((v) => v.id === selectedVendorId) ?? vendors[0] ?? null,
    [vendors, selectedVendorId]
  );

  const selectedVendorSummary = useMemo(
    () =>
      reconciliationReport?.vendorSummaries.find(
        (vs) => vs.vendorId === selectedVendor?.id
      ) ?? null,
    [reconciliationReport, selectedVendor]
  );

  const selectedVendorInventory = useMemo(
    () =>
      selectedVendor
        ? inventory
            .filter((i) => i.vendorId === selectedVendor.id)
            .sort(
              (a, b) => (a.originalRowIndex ?? 999) - (b.originalRowIndex ?? 999)
            )
        : [],
    [inventory, selectedVendor]
  );

  if (!activeEvent || !reconciliationReport) {
    return null;
  }

  const handleDownloadVendorExcel = async (vendorId: string) => {
    const v = vendors.find((x) => x.id === vendorId);
    const vs = reconciliationReport.vendorSummaries.find(
      (x) => x.vendorId === vendorId
    );
    if (!v || !vs) return;

    const vInv = inventory.filter((i) => i.vendorId === v.id);
    const bytes = generateVendorReconciliationXlsx({
      vendor: v,
      vendorSummary: vs,
      vendorInventory: vInv,
      importBatches,
      reconciliationReport,
    });

    const cleanName = v.name.replace(/[^a-zA-Z0-9]+/g, '_');
    const fileName = `${v.vendorLetter}_${cleanName}_Reconciliation_${activeEvent.orderPrefix}.xlsx`;
    downloadXlsxBytes(bytes, fileName);

    await recordAuditEvent(
      'REPORT_EXPORTED',
      v.id,
      `Exported lineage-preserved Vendor Reconciliation Excel "${fileName}" for ${v.name}.`,
      { vendorId: v.id, fileName, finalPayoutCents: vs.finalPayoutCents }
    );
    setExportToast(
      `Downloaded ${fileName} (preserved original sheet structure + Qty Sold, Sales Total, Remaining).`
    );
    setTimeout(() => setExportToast(null), 4000);
  };

  const handleDownloadMarketMasterExcel = async () => {
    const bytes = generateMarketMasterXlsx({
      event: activeEvent,
      report: reconciliationReport,
      orders,
      inventory,
      vendors,
    });

    const fileName = `${activeEvent.orderPrefix}_Market_Master_Reconciliation.xlsx`;
    downloadXlsxBytes(bytes, fileName);

    await recordAuditEvent(
      'REPORT_EXPORTED',
      activeEvent.id,
      `Exported 5-tab Market Master Excel workbook "${fileName}".`,
      { fileName, grossSalesCents: reconciliationReport.grossMerchandiseSalesCents }
    );
    setExportToast(
      `Downloaded ${fileName} (5 tabs: Summary, Orders, Order Lines, Vendor Payouts, Inventory).`
    );
    setTimeout(() => setExportToast(null), 4000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header & Market Master Export */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            End-of-Day Reconciliation &amp; Vendor Payout Reports
          </h1>
          <p className="text-xs text-slate-600">
            Verify three-way financial integrity and export vendor workbooks preserving original sheet/column lineage.
          </p>
        </div>

        <button
          type="button"
          disabled={!reconciliationReport.isReconciled}
          onClick={handleDownloadMarketMasterExcel}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-red-300 text-white text-xs font-bold inline-flex items-center gap-2 self-start shadow-xs cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Download Market Master Excel (5 Tabs)</span>
        </button>
      </div>

      {exportToast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{exportToast}</span>
        </div>
      )}

      {/* FINANCIAL INTEGRITY VALIDATION BANNER (Section 37) */}
      <div
        role="region"
        aria-label="Financial Integrity Validation"
        className={`p-4 rounded-2xl border-2 ${
          reconciliationReport.isReconciled
            ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
            : 'bg-red-50 border-red-400 text-red-950'
        }`}
      >
        <div className="flex items-start gap-3">
          {reconciliationReport.isReconciled ? (
            <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1 flex-1">
            <div className="text-sm font-extrabold">
              {reconciliationReport.isReconciled
                ? 'Three-Way Financial Integrity Check: PASSED'
                : 'Reconciliation Error — Payout Export Blocked'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
              <div className="p-2.5 rounded-xl bg-white/80 border border-emerald-200">
                <span className="text-slate-500 font-semibold block">
                  SUM(Order Line Totals)
                </span>
                <span className="font-mono font-bold text-sm text-slate-900">
                  {formatCurrency(reconciliationReport.sumOfOrderLineTotalsCents)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/80 border border-emerald-200">
                <span className="text-slate-500 font-semibold block">
                  SUM(Vendor Gross Sales)
                </span>
                <span className="font-mono font-bold text-sm text-slate-900">
                  {formatCurrency(reconciliationReport.sumOfVendorGrossSalesCents)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/80 border border-emerald-200">
                <span className="text-slate-500 font-semibold block">
                  Event Gross Merchandise Sales
                </span>
                <span className="font-mono font-bold text-sm text-slate-900">
                  {formatCurrency(reconciliationReport.grossMerchandiseSalesCents)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* End-of-Day Summary Metrics (Section 23) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'Gross Sales',
            value: formatCurrency(reconciliationReport.grossMerchandiseSalesCents),
          },
          {
            label: 'Orders',
            value: String(reconciliationReport.completedOrdersCount),
          },
          {
            label: 'Items Sold',
            value: String(reconciliationReport.totalUnitsSold),
          },
          {
            label: 'Refunds / Adjustments',
            value: formatCurrency(reconciliationReport.totalAdjustmentsCents),
          },
          {
            label: 'Owner Revenue',
            value: formatCurrency(reconciliationReport.totalOwnerCommissionCents),
          },
          {
            label: 'Vendor Payout Total',
            value: formatCurrency(reconciliationReport.netVendorPayoutTotalCents),
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {stat.label}
            </div>
            <div className="text-lg font-mono font-extrabold text-slate-900 mt-1">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Vendor Summary Table (Section 23) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Vendor Payout Schedule
            </h2>
            <p className="text-xs text-slate-600">
              Select any vendor row below to inspect itemized reconciliation and download their lineage-preserved Excel sheet.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Vendor</th>
                <th className="py-3 px-4 text-center">Items Sold</th>
                <th className="py-3 px-4 text-right">Gross Sales</th>
                <th className="py-3 px-4 text-right">Adjustments</th>
                <th className="py-3 px-4 text-right">Final Payout</th>
                <th className="py-3 px-4 text-right">Excel Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reconciliationReport.vendorSummaries.map((vs) => {
                const dotCfg = getDotColorConfig(vs.dotColor);
                const isSelected = selectedVendor?.id === vs.vendorId;

                return (
                  <tr
                    key={vs.vendorId}
                    onClick={() => setSelectedVendorId(vs.vendorId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-slate-900/5' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-7 h-7 rounded-full ${dotCfg.bgClass} ${dotCfg.textClass} font-bold text-xs flex items-center justify-center shrink-0`}
                        >
                          {vs.vendorLetter}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900">
                            {vs.vendorName}
                          </div>
                          <div className="text-xs text-slate-500">
                            Vendor {vs.vendorLetter} • {vs.dotColor} Dot
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-semibold text-slate-800">
                      {vs.itemsSoldCount} items
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(vs.grossSalesCents)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {vs.adjustmentsCents === 0
                        ? '$0.00'
                        : `${vs.adjustmentsCents > 0 ? '+' : ''}${formatCurrency(
                            vs.adjustmentsCents
                          )}`}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-700">
                      {formatCurrency(vs.finalPayoutCents)}
                    </td>
                    <td
                      className="py-3 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleDownloadVendorExcel(vs.vendorId)}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Excel</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Vendor Reconciliation Report (Section 24 & Section 19 Lineage Preview) */}
      {selectedVendor && selectedVendorSummary && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <span>Detailed Vendor Reconciliation Report</span>
                <ChevronRight className="w-3.5 h-3.5" />
                <span>{activeEvent.name}</span>
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">
                Vendor {selectedVendor.vendorLetter} — {selectedVendor.name}
              </h3>
              <p className="text-xs text-slate-600">
                Source Workbook:{' '}
                <span className="font-mono font-semibold text-slate-800">
                  {selectedVendor.sourceSpreadsheet || 'Vendor_Inventory.xlsx'}
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleDownloadVendorExcel(selectedVendor.id)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-2 self-start shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>
                Download Excel ({selectedVendor.sourceSpreadsheet || 'Preserved Sheet'})
              </span>
            </button>
          </div>

          {/* Vendor Report KPIs (Section 24) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-bold text-slate-500">
                Items Submitted
              </div>
              <div className="text-base font-mono font-extrabold text-slate-900 mt-0.5">
                {selectedVendorSummary.totalItemsSubmitted} records ({selectedVendorSummary.totalUnitsSubmitted} units)
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-bold text-slate-500">
                Total Units Sold
              </div>
              <div className="text-base font-mono font-extrabold text-slate-900 mt-0.5">
                {selectedVendorSummary.itemsSoldCount} units
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-bold text-slate-500">
                Gross Sales
              </div>
              <div className="text-base font-mono font-extrabold text-slate-900 mt-0.5">
                {formatCurrency(selectedVendorSummary.grossSalesCents)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-bold text-slate-500">
                Adjustments
              </div>
              <div className="text-base font-mono font-extrabold text-slate-900 mt-0.5">
                {formatCurrency(selectedVendorSummary.adjustmentsCents)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-[11px] font-bold text-emerald-800">
                Final Payout
              </div>
              <div className="text-base font-mono font-extrabold text-emerald-950 mt-0.5">
                {formatCurrency(selectedVendorSummary.finalPayoutCents)}
              </div>
            </div>
          </div>

          {/* Itemized Sold Inventory List */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Itemized Sold Inventory ({selectedVendorSummary.soldLines.length} sale lines)
            </h4>
            {selectedVendorSummary.soldLines.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 text-xs text-slate-500">
                No completed sales recorded for this vendor yet.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Item Code</th>
                      <th className="py-2 px-3">Description</th>
                      <th className="py-2 px-3">Tag Type</th>
                      <th className="py-2 px-3 text-center">Qty Sold</th>
                      <th className="py-2 px-3 text-right">Unit Price</th>
                      <th className="py-2 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedVendorSummary.soldLines.map((line) => (
                      <tr key={line.id}>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">
                          {line.itemCode}
                        </td>
                        <td className="py-2 px-3 text-slate-800 font-medium">
                          {line.itemDescription}
                        </td>
                        <td className="py-2 px-3 text-slate-500">
                          {line.tagType}
                        </td>
                        <td className="py-2 px-3 text-center font-mono">
                          {line.quantity}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {formatCurrency(line.unitPriceCents)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(line.lineTotalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Preserved Spreadsheet Structure Preview (Section 19) */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Preserved Vendor Workbook Preview (Original Columns + Appended Reconciliation Columns)
            </h4>
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Item #</th>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3">Material / Notes</th>
                    <th className="py-2 px-3 text-right">Price</th>
                    <th className="py-2 px-3 text-center">Quantity</th>
                    <th className="py-2 px-3 text-center bg-emerald-50 text-emerald-900 border-l border-emerald-200">
                      Qty Sold
                    </th>
                    <th className="py-2 px-3 text-right bg-emerald-50 text-emerald-900">
                      Sales Total
                    </th>
                    <th className="py-2 px-3 text-center bg-emerald-50 text-emerald-900">
                      Remaining
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {selectedVendorInventory.slice(0, 12).map((item) => {
                    const soldLinesForItem =
                      selectedVendorSummary.soldLines.filter(
                        (l) =>
                          l.itemId === item.id ||
                          l.itemCode.toUpperCase() === item.itemCode.toUpperCase()
                      );
                    const qtySold = soldLinesForItem.reduce(
                      (a, l) => a + l.quantity,
                      0
                    );
                    const salesCents = soldLinesForItem.reduce(
                      (a, l) => a + l.lineTotalCents,
                      0
                    );
                    const remaining = Math.max(0, item.initialQuantity - qtySold);

                    return (
                      <tr key={item.id}>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {item.itemCode}
                        </td>
                        <td className="py-2 px-3 font-sans text-slate-800">
                          {item.itemName}
                        </td>
                        <td className="py-2 px-3 font-sans text-slate-500 truncate max-w-[180px]">
                          {item.description}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {formatCurrency(item.priceCents)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {item.initialQuantity}
                        </td>
                        <td className="py-2 px-3 text-center font-bold bg-emerald-50/40 border-l border-emerald-100 text-emerald-900">
                          {qtySold}
                        </td>
                        <td className="py-2 px-3 text-right font-bold bg-emerald-50/40 text-emerald-900">
                          {formatCurrency(salesCents)}
                        </td>
                        <td className="py-2 px-3 text-center bg-emerald-50/40 text-slate-700">
                          {remaining}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
