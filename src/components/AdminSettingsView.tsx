import React, { useState } from 'react';
import {
  Shield,
  RotateCcw,
  ClipboardList,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useBooth } from '../context/BoothContext.tsx';

export const AdminSettingsView: React.FC = () => {
  const { auditLogs, role, switchRole, resetDemoDataset } = useBooth();
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleResetDemo = async () => {
    await resetDemoDataset();
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 3500);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Role & Permissions Matrix (Section 29) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Security Roles, Demo Reset &amp; Audit Log
              </h1>
              <p className="text-xs text-slate-600">
                Current Authenticated Role:{' '}
                <strong className="text-slate-900">
                  {role === 'OWNER' ? 'OWNER (Stella)' : 'OPERATOR (Booth Register)'}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                switchRole(role === 'OWNER' ? 'OPERATOR' : 'OWNER')
              }
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                Switch Role to {role === 'OWNER' ? 'OPERATOR' : 'OWNER'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleResetDemo}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demo Seed Data</span>
            </button>
          </div>
        </div>

        {resetSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              Demo dataset reset! Item A002 ($32.00) is Available and Next Order is OCT26-1048.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="font-bold text-slate-900">
              OPERATOR Role Permissions
            </div>
            <ul className="text-slate-600 space-y-1 list-disc list-inside">
              <li>Ring up Hang Tag &amp; Dot Sticker items at checkout</li>
              <li>Generate offline QR codes &amp; confirm customer payments</li>
              <li>View today&apos;s orders, sync status, and enter Paper Recovery sales</li>
              <li className="text-red-700 font-medium">
                Cannot delete vendors, upload spreadsheets, alter payouts, or edit historical reports
              </li>
            </ul>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="font-bold text-slate-900">
              OWNER Role Permissions (Stella)
            </div>
            <ul className="text-slate-600 space-y-1 list-disc list-inside">
              <li>Full access to Event settings, Payment Provider adapters, and Prepare Register</li>
              <li>6-Step Vendor Excel Import Wizard &amp; Bulk Photo Matcher</li>
              <li>Record auditable Order Adjustments &amp; override unique sold item locks</li>
              <li>Export lineage-preserved Vendor Excel reports &amp; 5-tab Market Master workbook</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Immutable Audit Log (Section 38) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-slate-700" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              System Audit Log ({auditLogs.length} events)
            </h2>
            <p className="text-xs text-slate-600">
              Tracks INVENTORY_IMPORTED, ORDER_CREATED, ORDER_COMPLETED, ORDER_SYNCED, ORDER_ADJUSTED, VENDOR_UPDATED, REPORT_EXPORTED, and PAPER_ORDER_CREATED.
            </p>
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">User / Role</th>
                <th className="py-2.5 px-3">Record ID</th>
                <th className="py-2.5 px-3">Summary &amp; Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap">
                    {log.user}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">
                    {log.recordId}
                  </td>
                  <td className="py-2.5 px-3 text-slate-800">
                    {log.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
