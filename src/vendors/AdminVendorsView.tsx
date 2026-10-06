import React, { useMemo, useState } from 'react';
import {
  Plus,
  Edit3,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import { useBooth } from '../context/BoothContext.tsx';
import { DOT_COLOR_PALETTE, getDotColorConfig } from '../offline/seedData.ts';
import { formatCurrency, parsePriceToCents } from '../lib/money.ts';
import { generateUuid } from '../checkout/cartLogic.ts';
import type { Vendor } from '../types/domain.ts';

export const AdminVendorsView: React.FC = () => {
  const { activeEvent, vendors, priceOptions, inventory, saveVendor } =
    useBooth();

  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [dotPricesInput, setDotPricesInput] = useState<string>('5, 8, 12');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Detect duplicate dot colors across active vendors in the event (Section 16)
  const duplicateColorWarnings = useMemo(() => {
    const colorMap = new Map<string, string[]>();
    for (const v of vendors) {
      if (v.status !== 'ACTIVE') continue;
      const list = colorMap.get(v.dotColor) ?? [];
      list.push(`${v.vendorLetter} (${v.name})`);
      colorMap.set(v.dotColor, list);
    }
    const warnings: string[] = [];
    for (const [color, names] of colorMap.entries()) {
      if (names.length > 1) {
        warnings.push(
          `Duplicate dot color "${color}" assigned to multiple vendors: ${names.join(', ')}. Consider assigning unique dot colors to prevent checkout mistakes.`
        );
      }
    }
    return warnings;
  }, [vendors]);

  const handleOpenNewVendor = () => {
    if (!activeEvent) return;
    const usedLetters = new Set(
      vendors.map((v) => v.vendorLetter.toUpperCase())
    );
    let nextLetter = 'E';
    for (let code = 65; code <= 90; code++) {
      const ch = String.fromCharCode(code);
      if (!usedLetters.has(ch)) {
        nextLetter = ch;
        break;
      }
    }

    setEditingVendor({
      id: `vendor-${nextLetter.toLowerCase()}-${generateUuid().slice(0, 5)}`,
      eventId: activeEvent.id,
      vendorLetter: nextLetter,
      name: '',
      contactName: '',
      email: '',
      phone: '',
      dotColor: 'Purple',
      status: 'ACTIVE',
      sourceSpreadsheet: '',
      notes: '',
      updatedAt: new Date().toISOString(),
    });
    setDotPricesInput('5, 10, 15');
    setErrorMsg(null);
  };

  const handleOpenEditVendor = (vendor: Vendor) => {
    const vDots = priceOptions
      .filter((p) => p.vendorId === vendor.id)
      .sort((a, b) => a.priceCents - b.priceCents)
      .map((p) => (p.priceCents / 100).toString());

    setEditingVendor({ ...vendor });
    setDotPricesInput(vDots.join(', '));
    setErrorMsg(null);
  };

  const handleSubmitVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor) return;
    setErrorMsg(null);

    if (!editingVendor.vendorLetter.trim()) {
      setErrorMsg('Vendor letter is required (e.g. A, B, C).');
      return;
    }
    if (
      !editingVendor.name.trim() ||
      editingVendor.name.trim().toLowerCase() === 'unknown vendor'
    ) {
      setErrorMsg('Valid vendor name is required.');
      return;
    }

    // Parse comma-separated dot prices
    const rawTokens = dotPricesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedCentsList: number[] = [];
    for (const tok of rawTokens) {
      const cents = parsePriceToCents(tok);
      if (cents === null) {
        setErrorMsg(`Invalid dot price "${tok}". Use numbers like 5, 8, 12.50.`);
        return;
      }
      parsedCentsList.push(cents);
    }

    try {
      await saveVendor(editingVendor, parsedCentsList);
      setEditingVendor(null);
      setSavedMsg(`Saved Vendor ${editingVendor.vendorLetter} — ${editingVendor.name}.`);
      setTimeout(() => setSavedMsg(null), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save vendor.');
    }
  };

  // Check if currently editing vendor picks a dot color already used by another vendor
  const modalDuplicateColorVendor = useMemo(() => {
    if (!editingVendor) return null;
    return (
      vendors.find(
        (v) =>
          v.id !== editingVendor.id &&
          v.status === 'ACTIVE' &&
          v.dotColor.toLowerCase() === editingVendor.dotColor.toLowerCase()
      ) ?? null
    );
  }, [editingVendor, vendors]);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Vendors &amp; Dot Sticker Configuration ({vendors.length})
          </h1>
          <p className="text-xs text-slate-600">
            Manage vendor letters, contact info, dot sticker colors, and configured dot price buttons.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenNewVendor}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 self-start cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Vendor</span>
        </button>
      </div>

      {/* Duplicate Color Warning Banner (Section 16) */}
      {duplicateColorWarnings.map((warn) => (
        <div
          key={warn}
          role="alert"
          className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs font-semibold text-amber-950 flex items-center gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>{warn}</span>
        </div>
      ))}

      {savedMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedMsg}</span>
        </div>
      )}

      {/* Vendor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {vendors.map((vendor) => {
          const dotCfg = getDotColorConfig(vendor.dotColor);
          const vDots = priceOptions
            .filter((p) => p.vendorId === vendor.id)
            .sort((a, b) => a.priceCents - b.priceCents);
          const vItemsCount = inventory.filter(
            (i) => i.vendorId === vendor.id && i.tagType === 'HANG_TAG'
          ).length;

          return (
            <div
              key={vendor.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-12 h-12 rounded-full ${dotCfg.bgClass} ${dotCfg.textClass} font-extrabold text-lg flex items-center justify-center shrink-0 shadow-xs`}
                    >
                      {vendor.vendorLetter}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                          Vendor {vendor.vendorLetter}
                        </span>
                        <span className="text-xs font-semibold text-slate-600">
                          {vendor.dotColor} Dot
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                        {vendor.name}
                      </h2>
                      <div className="text-xs text-slate-500">
                        {vendor.contactName} • {vendor.email}
                        {vendor.phone ? ` • ${vendor.phone}` : ''}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEditVendor(vendor)}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                </div>

                {/* Configured Dot Prices */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Configured Dot Sticker Prices
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {vDots.map((vp) => (
                      <span
                        key={vp.id}
                        className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-900 border border-slate-200"
                      >
                        {formatCurrency(vp.priceCents)}
                      </span>
                    ))}
                  </div>
                </div>

                {vendor.notes && (
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {vendor.notes}
                  </p>
                )}
              </div>

              <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                  <span>{vendor.sourceSpreadsheet || 'Manual entry'}</span>
                </span>
                <span className="font-semibold text-slate-700">
                  {vItemsCount} unique tagged items
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Vendor Modal */}
      {editingVendor && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSubmitVendor}
            className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4 my-auto"
          >
            <h3 className="text-lg font-bold text-slate-900">
              {vendors.some((v) => v.id === editingVendor.id)
                ? `Edit Vendor ${editingVendor.vendorLetter}`
                : 'Add New Vendor'}
            </h3>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Vendor Letter
                </label>
                <input
                  type="text"
                  maxLength={3}
                  value={editingVendor.vendorLetter}
                  onChange={(e) =>
                    setEditingVendor({
                      ...editingVendor,
                      vendorLetter: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 font-mono text-sm font-bold"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Vendor Business Name
                </label>
                <input
                  type="text"
                  value={editingVendor.name}
                  onChange={(e) =>
                    setEditingVendor({ ...editingVendor, name: e.target.value })
                  }
                  placeholder="e.g. Anna Ceramics"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={editingVendor.contactName}
                  onChange={(e) =>
                    setEditingVendor({
                      ...editingVendor,
                      contactName: e.target.value,
                    })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editingVendor.email}
                  onChange={(e) =>
                    setEditingVendor({ ...editingVendor, email: e.target.value })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Assigned Dot Color
                </label>
                <select
                  value={editingVendor.dotColor}
                  onChange={(e) =>
                    setEditingVendor({
                      ...editingVendor,
                      dotColor: e.target.value,
                    })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm bg-white font-semibold"
                >
                  {DOT_COLOR_PALETTE.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name} ({c.patternLabel})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Configured Dot Prices ($, comma-separated)
                </label>
                <input
                  type="text"
                  value={dotPricesInput}
                  onChange={(e) => setDotPricesInput(e.target.value)}
                  placeholder="5, 8, 12"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 font-mono text-sm"
                />
              </div>
            </div>

            {modalDuplicateColorVendor && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  Warning: {editingVendor.dotColor} is already assigned to Vendor{' '}
                  {modalDuplicateColorVendor.vendorLetter} ({modalDuplicateColorVendor.name}).
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Notes
              </label>
              <input
                type="text"
                value={editingVendor.notes ?? ''}
                onChange={(e) =>
                  setEditingVendor({ ...editingVendor, notes: e.target.value })
                }
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                {errorMsg}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingVendor(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                Save Vendor
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
