import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Shield,
  LayoutDashboard,
} from 'lucide-react';
import { useBooth } from '../context/BoothContext.tsx';
import { formatCurrency, parsePriceToCents } from '../lib/money.ts';
import { getDotColorConfig } from './seedData.ts';

interface DraftPaperLine {
  key: string;
  vendorId: string;
  itemCode: string;
  description: string;
  priceInput: string;
  quantity: number;
  tagType: 'HANG_TAG' | 'DOT';
}

export const EmergencyPaperModeView: React.FC<{ isEmbeddedModal?: boolean; onClose?: () => void }> = ({
  isEmbeddedModal = false,
  onClose,
}) => {
  const {
    vendors,
    activeEvent,
    role,
    switchRole,
    setAppMode,
    createPaperRecoveryOrder,
  } = useBooth();

  const [paperOrderNumber, setPaperOrderNumber] = useState(
    `${activeEvent?.orderPrefix ?? 'OCT26'}-PAPER-01`
  );
  const [paperNotes, setPaperNotes] = useState(
    'Transcribed from booth paper emergency pad — Venmo payment verified.'
  );
  const [lines, setLines] = useState<DraftPaperLine[]>([
    {
      key: 'line-1',
      vendorId: vendors[0]?.id ?? '',
      itemCode: 'A004',
      description: 'Pour-Over Coffee Dripper (Paper Tally)',
      priceInput: '28.00',
      quantity: 1,
      tagType: 'HANG_TAG',
    },
  ]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdOrderNum, setCreatedOrderNum] = useState<string | null>(null);

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: `line-${Date.now()}`,
        vendorId: vendors[0]?.id ?? '',
        itemCode: '',
        description: '',
        priceInput: '',
        quantity: 1,
        tagType: 'DOT',
      },
    ]);
  };

  const handleRemoveLine = (key: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const handleUpdateLine = (
    key: string,
    patch: Partial<DraftPaperLine>
  ) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  };

  const handleSubmitPaperOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setCreatedOrderNum(null);

    const validatedLines: Array<{
      vendorId: string;
      itemCode: string;
      description: string;
      unitPriceCents: number;
      quantity: number;
      tagType: 'HANG_TAG' | 'DOT';
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.vendorId) {
        setErrorMsg(`Line ${i + 1}: Please select a vendor. Every sale line must belong to a vendor.`);
        return;
      }
      const priceCents = parsePriceToCents(l.priceInput);
      if (priceCents === null) {
        setErrorMsg(`Line ${i + 1}: Invalid price "${l.priceInput}". Enter a valid dollar amount.`);
        return;
      }
      validatedLines.push({
        vendorId: l.vendorId,
        itemCode: l.itemCode.trim().toUpperCase() || 'PAPER-ITEM',
        description: l.description.trim() || 'Paper Tally Item',
        unitPriceCents: priceCents,
        quantity: Math.max(1, l.quantity),
        tagType: l.tagType,
      });
    }

    try {
      const order = await createPaperRecoveryOrder({
        paperOrderNumber,
        notes: paperNotes,
        lines: validatedLines,
      });
      setCreatedOrderNum(order.orderNumber);
      if (onClose) {
        setTimeout(() => onClose(), 1200);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to save paper order.'
      );
    }
  };

  return (
    <div
      className={`${
        isEmbeddedModal ? '' : 'max-w-xl mx-auto px-3 sm:px-4 pt-4 pb-24'
      } space-y-4`}
    >
      {/* Emergency Paper Instructions Card (Section 13) */}
      <div className="bg-amber-50 rounded-2xl border-2 border-amber-300 p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-200 text-amber-950 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-amber-950">
              Emergency / Paper Mode Instructions
            </h1>
            <p className="text-xs text-amber-900 mt-0.5">
              If this phone runs out of battery or becomes unusable during the market, write every sale on the paper pad under the register using these exact 5 columns:
            </p>
          </div>
        </div>

        {/* Required 5-Column Paper Format Table */}
        <div className="bg-white rounded-xl border border-amber-300 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-amber-100/70 text-amber-950 font-bold border-b border-amber-200">
              <tr>
                <th className="py-2 px-2.5">Order #</th>
                <th className="py-2 px-2.5">Item / Code</th>
                <th className="py-2 px-2.5">Vendor</th>
                <th className="py-2 px-2.5">Price</th>
                <th className="py-2 px-2.5">Payment status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100 font-mono text-slate-800">
              <tr>
                <td className="py-2 px-2.5 font-bold">PAPER-01</td>
                <td className="py-2 px-2.5">A004 (Dripper)</td>
                <td className="py-2 px-2.5">A — Anna (Red)</td>
                <td className="py-2 px-2.5">$28.00</td>
                <td className="py-2 px-2.5 text-emerald-700 font-bold">PAID (Venmo)</td>
              </tr>
              <tr>
                <td className="py-2 px-2.5 font-bold">PAPER-01</td>
                <td className="py-2 px-2.5">Blue Dot</td>
                <td className="py-2 px-2.5">B — Bluebird</td>
                <td className="py-2 px-2.5">$5.00</td>
                <td className="py-2 px-2.5 text-emerald-700 font-bold">PAID (Venmo)</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Vendor Quick Reference */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {vendors.map((v) => {
            const dotCfg = getDotColorConfig(v.dotColor);
            return (
              <span
                key={v.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-xs font-semibold text-slate-800"
              >
                <span
                  className={`w-4 h-4 rounded-full ${dotCfg.bgClass} ${dotCfg.textClass} text-[10px] font-bold flex items-center justify-center`}
                >
                  {v.vendorLetter}
                </span>
                <span>
                  {v.vendorLetter}: {v.name} ({v.dotColor} Dot)
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Add / Reconstruct Paper Sale Form */}
      <form
        onSubmit={handleSubmitPaperOrder}
        className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Add Paper Sale (Reconstruct Transaction)
            </h2>
            <p className="text-xs text-slate-600">
              Recovered transactions are tagged with{' '}
              <span className="font-mono font-bold text-purple-800 bg-purple-50 px-1.5 py-0.5 rounded">
                Source: Paper Recovery
              </span>{' '}
              for full audit visibility.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Paper Order Number
            </label>
            <input
              type="text"
              value={paperOrderNumber}
              onChange={(e) => setPaperOrderNumber(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono text-sm font-bold"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Recovery Notes / Payment Proof
            </label>
            <input
              type="text"
              value={paperNotes}
              onChange={(e) => setPaperNotes(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Sale Lines (Vendor Attribution Mandatory)
            </span>
            <button
              type="button"
              onClick={handleAddLine}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Line</span>
            </button>
          </div>

          {lines.map((line, idx) => (
            <div
              key={line.key}
              className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
            >
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Vendor #{idx + 1}
                </label>
                <select
                  value={line.vendorId}
                  onChange={(e) =>
                    handleUpdateLine(line.key, { vendorId: e.target.value })
                  }
                  className="w-full min-h-[40px] px-2.5 rounded-lg border border-slate-300 text-xs bg-white font-semibold"
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vendorLetter} — {v.name} ({v.dotColor})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Item / Code
                </label>
                <input
                  type="text"
                  value={line.itemCode}
                  onChange={(e) =>
                    handleUpdateLine(line.key, { itemCode: e.target.value })
                  }
                  placeholder="A004 or DOT"
                  className="w-full min-h-[40px] px-2.5 rounded-lg border border-slate-300 font-mono text-xs"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={line.description}
                  onChange={(e) =>
                    handleUpdateLine(line.key, { description: e.target.value })
                  }
                  placeholder="Item description"
                  className="w-full min-h-[40px] px-2.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Price ($)
                </label>
                <input
                  type="text"
                  value={line.priceInput}
                  onChange={(e) =>
                    handleUpdateLine(line.key, { priceInput: e.target.value })
                  }
                  placeholder="28.00"
                  className="w-full min-h-[40px] px-2.5 rounded-lg border border-slate-300 font-mono text-xs"
                />
              </div>

              <div className="sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  disabled={lines.length <= 1}
                  onClick={() => handleRemoveLine(line.key)}
                  aria-label="Remove line"
                  className="h-10 w-10 rounded-lg bg-white hover:bg-red-50 text-red-600 border border-slate-200 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {createdOrderNum && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Paper Recovery Order <strong>{createdOrderNum}</strong> saved with{' '}
              <code>Source: Paper Recovery</code>.
            </span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
            >
              Close
            </button>
          )}
          <button
            type="submit"
            className="min-h-[44px] px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
          >
            Save Recovered Paper Sale
          </button>
        </div>
      </form>

      {/* Role & Mode Switcher inside More tab */}
      {!isEmbeddedModal && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">
                Active Role: {role === 'OWNER' ? 'Stella (Market Owner)' : 'Booth Operator'}
              </div>
              <div className="text-xs text-slate-600">
                Switch to Stella&apos;s Owner Dashboard for Excel imports, vendor payouts, and reconciliation reports.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                switchRole(role === 'OWNER' ? 'OPERATOR' : 'OWNER')
              }
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
            >
              Switch Role ({role === 'OWNER' ? 'Operator' : 'Owner'})
            </button>
            <button
              type="button"
              onClick={() => setAppMode('ADMIN')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Open Stella Admin</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
