import React from 'react';
import {
  DollarSign,
  ShoppingBag,
  PackageCheck,
  Users,
  CloudUpload,
  FileSpreadsheet,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  ShieldCheck,
} from 'lucide-react';
import { useBooth } from '../context/BoothContext.tsx';
import { formatCurrency } from '../lib/money.ts';
import { getDotColorConfig } from '../offline/seedData.ts';

export const AdminOverviewView: React.FC<{
  onOpenPaperModal: () => void;
}> = ({ onOpenPaperModal }) => {
  const {
    activeEvent,
    reconciliationReport,
    unsyncedOrderCount,
    vendors,
    setAdminTab,
    setAppMode,
  } = useBooth();

  if (!activeEvent || !reconciliationReport) {
    return (
      <div className="p-6 bg-white rounded-2xl border border-slate-200 text-center">
        No active event selected.
      </div>
    );
  }

  const activeVendorCount = vendors.filter((v) => v.status === 'ACTIVE').length;
  const maxVendorGross = Math.max(
    100,
    ...reconciliationReport.vendorSummaries.map((v) => v.grossSalesCents)
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
              Today&apos;s Live Market
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {activeEvent.date} • {activeEvent.location}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
            {activeEvent.name} — Stella&apos;s Dashboard
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenPaperModal}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Paper Sale</span>
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('IMPORTS')}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Import Vendor Excel</span>
          </button>
          <button
            type="button"
            onClick={() => setAppMode('OPERATOR')}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>Open Register Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 5 Key Metrics Cards (Section 14) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Revenue</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-mono font-extrabold text-slate-900 mt-2">
            {formatCurrency(reconciliationReport.grossMerchandiseSalesCents)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Net Payout: {formatCurrency(reconciliationReport.netVendorPayoutTotalCents)}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Orders</span>
            <ShoppingBag className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-mono font-extrabold text-slate-900 mt-2">
            {reconciliationReport.completedOrdersCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Completed today
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Items Sold</span>
            <PackageCheck className="w-4 h-4 text-violet-600" />
          </div>
          <div className="text-2xl font-mono font-extrabold text-slate-900 mt-2">
            {reconciliationReport.totalUnitsSold}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Attributed units
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Vendors</span>
            <Users className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-mono font-extrabold text-slate-900 mt-2">
            {activeVendorCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Participating makers
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Pending Sync</span>
            <CloudUpload
              className={`w-4 h-4 ${
                unsyncedOrderCount > 0 ? 'text-amber-600' : 'text-emerald-600'
              }`}
            />
          </div>
          <div className="text-2xl font-mono font-extrabold text-slate-900 mt-2">
            {unsyncedOrderCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {unsyncedOrderCount === 0 ? 'All orders synced' : 'Waiting on device'}
          </div>
        </div>
      </div>

      {/* Financial Integrity Verification Banner */}
      <div
        className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
          reconciliationReport.isReconciled
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            : 'bg-red-50 border-red-300 text-red-950'
        }`}
      >
        <div className="flex items-center gap-3">
          {reconciliationReport.isReconciled ? (
            <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
          )}
          <div>
            <div className="text-sm font-bold">
              {reconciliationReport.isReconciled
                ? 'Financial Integrity Verified: Order Lines = Vendor Sales = Event Gross Sales'
                : 'Reconciliation Error Detected'}
            </div>
            <div className="text-xs opacity-85">
              Sum of Order Lines:{' '}
              <span className="font-mono font-bold">
                {formatCurrency(reconciliationReport.sumOfOrderLineTotalsCents)}
              </span>{' '}
              • Sum of Vendor Gross Sales:{' '}
              <span className="font-mono font-bold">
                {formatCurrency(reconciliationReport.sumOfVendorGrossSalesCents)}
              </span>{' '}
              • Adjustments:{' '}
              <span className="font-mono font-bold">
                {formatCurrency(reconciliationReport.totalAdjustmentsCents)}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAdminTab('REPORTS')}
          className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 hover:bg-slate-50 shrink-0 cursor-pointer"
        >
          View End-of-Day Reports
        </button>
      </div>

      {/* Sales Distribution by Vendor & Payout Preview (Section 14) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Sales Distribution &amp; Vendor Payout Preview
            </h2>
            <p className="text-xs text-slate-600">
              Every checkout line is attributed at ring-up time to its exact vendor.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdminTab('REPORTS')}
            className="text-xs font-bold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Export Reconciliation Sheets</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-3.5">
          {reconciliationReport.vendorSummaries.map((vs) => {
            const dotCfg = getDotColorConfig(vs.dotColor);
            const widthPct = Math.max(
              4,
              Math.round((vs.grossSalesCents / maxVendorGross) * 100)
            );

            return (
              <div
                key={vs.vendorId}
                className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-8 h-8 rounded-full ${dotCfg.bgClass} ${dotCfg.textClass} font-extrabold text-sm flex items-center justify-center shrink-0`}
                    >
                      {vs.vendorLetter}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        Vendor {vs.vendorLetter} — {vs.vendorName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {vs.dotColor} Dot • {vs.itemsSoldCount} items sold (of{' '}
                        {vs.totalUnitsSubmitted} submitted units)
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-base font-extrabold text-slate-900">
                      {formatCurrency(vs.finalPayoutCents)}
                    </div>
                    {vs.adjustmentsCents !== 0 && (
                      <div className="text-[11px] text-blue-700">
                        Gross {formatCurrency(vs.grossSalesCents)} ({vs.adjustmentsCents >= 0 ? '+' : ''}
                        {formatCurrency(vs.adjustmentsCents)} adj)
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${dotCfg.bgClass} rounded-full transition-all duration-300`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
