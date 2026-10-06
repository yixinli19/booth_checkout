import React, { useMemo, useRef, useState } from 'react';
import {
  Tag,
  CircleDot,
  Plus,
  Minus,
  Trash2,
  Undo2,
  AlertTriangle,
  Search,
  ShoppingBag,
  Check,
  X,
  Edit3,
  Sparkles,
} from 'lucide-react';
import { useBooth } from '../context/BoothContext.tsx';
import { lookupItemByCode } from '../inventory/inventoryLookup.ts';
import { formatCurrency, parsePriceToCents } from '../lib/money.ts';
import { getDotColorConfig } from '../offline/seedData.ts';
import type { InventoryItem, Vendor } from '../types/domain.ts';

export const OperatorCheckoutView: React.FC = () => {
  const {
    activeEvent,
    vendors,
    priceOptions,
    inventory,
    syncState,
    isOffline,
    role,
    cart,
    cartTotals,
    recentDotVendorIds,
    canUndoLastItem,
    addHangTagToCart,
    addDotToCart,
    changeCartQuantity,
    overrideCartPrice,
    removeFromCart,
    undoLastCartItem,
    clearCart,
    beginOrderCheckout,
    setAppMode,
    setAdminTab,
  } = useBooth();

  const [codeInput, setCodeInput] = useState('');
  const [dotDrawerOpen, setDotDrawerOpen] = useState(false);
  const [selectedDotVendorId, setSelectedDotVendorId] = useState<string | null>(
    null
  );
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
  } | null>(null);
  const [editingPriceLineId, setEditingPriceLineId] = useState<string | null>(
    null
  );
  const [editingPriceValue, setEditingPriceValue] = useState('');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  const codeInputRef = useRef<HTMLInputElement | null>(null);

  const activeVendors = useMemo(
    () => vendors.filter((v) => v.status === 'ACTIVE'),
    [vendors]
  );

  const vendorsById = useMemo(
    () => new Map(vendors.map((v) => [v.id, v])),
    [vendors]
  );

  const recentVendors = useMemo(() => {
    const list: Vendor[] = [];
    for (const id of recentDotVendorIds) {
      const v = vendorsById.get(id);
      if (v && v.status === 'ACTIVE') list.push(v);
    }
    for (const v of activeVendors) {
      if (!list.some((x) => x.id === v.id)) list.push(v);
    }
    return list;
  }, [recentDotVendorIds, vendorsById, activeVendors]);

  // Instant local lookup for hang-tag item code
  const lookupResult = useMemo(
    () => lookupItemByCode(codeInput, inventory),
    [codeInput, inventory]
  );

  const selectedDotVendor = useMemo(
    () =>
      selectedDotVendorId ? vendorsById.get(selectedDotVendorId) ?? null : null,
    [selectedDotVendorId, vendorsById]
  );

  const selectedVendorDotPrices = useMemo(() => {
    if (!selectedDotVendor) return [];
    return priceOptions
      .filter((p) => p.vendorId === selectedDotVendor.id)
      .sort((a, b) => a.priceCents - b.priceCents);
  }, [selectedDotVendor, priceOptions]);

  const showToast = (
    type: 'success' | 'error' | 'warning',
    text: string
  ) => {
    setFeedbackBanner({ type, text });
    setTimeout(() => {
      setFeedbackBanner((curr) => (curr?.text === text ? null : curr));
    }, 3200);
  };

  const handleAddHangTagItem = (
    item: InventoryItem,
    allowAdminOverride = false
  ) => {
    try {
      addHangTagToCart(item, { allowAdminOverride });
      const vendor = vendorsById.get(item.vendorId);
      showToast(
        'success',
        `Added ${item.itemCode} — ${item.itemName} (${vendor?.name ?? item.vendorLetter}) • ${formatCurrency(item.priceCents)}`
      );
      setCodeInput('');
      // Immediately return focus to item code field for rapid ring-up
      setTimeout(() => {
        codeInputRef.current?.focus();
      }, 10);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Unable to add item.'
      );
    }
  };

  const handleSelectDotPrice = (vendor: Vendor, priceCents: number) => {
    try {
      addDotToCart(vendor, priceCents);
      showToast(
        'success',
        `Added ${vendor.dotColor} Dot (${formatCurrency(priceCents)}) — ${vendor.name}`
      );
      setDotDrawerOpen(false);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Unable to add dot item.'
      );
    }
  };

  const handleCheckoutTap = async () => {
    if (cart.length === 0 || isCreatingOrder) return;
    setIsCreatingOrder(true);
    try {
      await beginOrderCheckout();
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Could not initiate checkout.'
      );
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handleSavePriceOverride = (lineId: string) => {
    const parsedCents = parsePriceToCents(editingPriceValue);
    if (parsedCents === null) {
      showToast('error', 'Enter a valid price (e.g. 18.00).');
      return;
    }
    try {
      overrideCartPrice(lineId, parsedCents);
      setEditingPriceLineId(null);
      setEditingPriceValue('');
      showToast('success', `Updated line price to ${formatCurrency(parsedCents)}.`);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Price override failed.'
      );
    }
  };

  // --- EMPTY STATES (Section 32) ---
  if (!activeEvent) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center my-8 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">
          There is no active market event.
        </h2>
        <p className="text-sm text-slate-600">
          Ask Stella to activate an event before checkout.
        </p>
        <button
          type="button"
          onClick={() => {
            setAppMode('ADMIN');
            setAdminTab('EVENT');
          }}
          className="mt-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold cursor-pointer"
        >
          Open Event Settings (Stella)
        </button>
      </div>
    );
  }

  if (isOffline && !syncState?.isCatalogReadyOffline && inventory.length === 0) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center my-8 bg-red-50 rounded-2xl border-2 border-red-300 shadow-xs space-y-3">
        <AlertTriangle className="w-12 h-12 text-red-600 mx-auto" />
        <h2 className="text-lg font-bold text-red-950">
          This device does not have a local copy of this event catalog.
        </h2>
        <p className="text-sm text-red-800">
          Connect to Wi-Fi and tap &ldquo;Prepare Register&rdquo; before operating in offline mode so vendor attribution and prices are guaranteed accurate.
        </p>
      </div>
    );
  }

  if (activeVendors.length === 0) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center my-8 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <ShoppingBag className="w-10 h-10 text-slate-400 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">
          No vendors have been added yet.
        </h2>
        <p className="text-sm text-slate-600">
          Upload vendor inventory or add vendors in Stella&apos;s Admin view to begin ringing sales.
        </p>
      </div>
    );
  }

  if (inventory.length === 0) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center my-8 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <Tag className="w-10 h-10 text-slate-400 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">
          Upload vendor inventory to prepare this event.
        </h2>
        <button
          type="button"
          onClick={() => {
            setAppMode('ADMIN');
            setAdminTab('IMPORTS');
          }}
          className="mt-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold cursor-pointer"
        >
          Open Import Wizard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto pb-36 px-3 sm:px-4 pt-3 space-y-3.5">
      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          role="status"
          className={`px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-medium flex items-center justify-between gap-2 shadow-2xs transition-all ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : feedbackBanner.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span>{feedbackBanner.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-1 rounded-md hover:bg-black/5 cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* METHOD A: ENTER ITEM CODE (HANG TAG) */}
      <section
        aria-label="Hang Tag Item Code Entry"
        className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-2xs space-y-3"
      >
        <div className="flex items-center justify-between">
          <label
            htmlFor="operator-item-code-input"
            className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5"
          >
            <Tag className="w-4 h-4 text-slate-700" />
            <span>Enter Item Code (Hang Tag)</span>
          </label>
          <span className="text-[11px] text-slate-500 font-medium">
            e.g. A002, B002, C001
          </span>
        </div>

        <div className="relative flex items-center">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 pointer-events-none" />
          <input
            ref={codeInputRef}
            id="operator-item-code-input"
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                lookupResult.exactMatch &&
                !lookupResult.alreadySoldWarning
              ) {
                e.preventDefault();
                handleAddHangTagItem(lookupResult.exactMatch);
              }
            }}
            placeholder="Enter Item Code (e.g. A002)..."
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="w-full min-h-[52px] pl-11 pr-24 rounded-xl border-2 border-slate-300 focus:border-slate-900 focus:outline-none font-mono font-bold text-lg text-slate-900 placeholder:font-sans placeholder:font-medium placeholder:text-slate-400 placeholder:text-base transition-colors"
          />
          {codeInput && (
            <button
              type="button"
              onClick={() => {
                setCodeInput('');
                codeInputRef.current?.focus();
              }}
              className="absolute right-2.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Quick Demo Tag Chips for 1-Tap Testing */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-[11px] font-semibold text-slate-400 shrink-0 mr-1">
            Quick tap:
          </span>
          {['A002', 'A004', 'B002', 'C001', 'D002', 'A005', 'A017'].map(
            (sampleCode) => (
              <button
                key={sampleCode}
                type="button"
                onClick={() => setCodeInput(sampleCode)}
                className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold border shrink-0 transition-colors cursor-pointer ${
                  codeInput.toUpperCase() === sampleCode
                    ? 'bg-slate-900 text-white border-slate-900'
                    : sampleCode === 'A005'
                    ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    : sampleCode === 'A017'
                    ? 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                {sampleCode}
                {sampleCode === 'A005'
                  ? ' (Sold)'
                  : sampleCode === 'A017'
                  ? ' (Miss)'
                  : ''}
              </button>
            )
          )}
        </div>

        {/* Exact Match Confirmation Card */}
        {lookupResult.exactMatch && !lookupResult.alreadySoldWarning && (
          <div className="p-3.5 rounded-xl bg-slate-900 text-white flex items-center justify-between gap-3 shadow-md animate-in fade-in duration-100">
            <div className="flex items-center gap-3 min-w-0">
              {lookupResult.exactMatch.photoUrl && (
                <img
                  src={lookupResult.exactMatch.photoUrl}
                  alt={lookupResult.exactMatch.itemName}
                  className="w-14 h-14 rounded-lg object-cover bg-slate-800 border border-slate-700 shrink-0"
                  loading="lazy"
                />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm px-2 py-0.5 rounded bg-white/15 text-white">
                    {lookupResult.exactMatch.itemCode}
                  </span>
                  <span className="text-xs text-slate-300 truncate">
                    Vendor {lookupResult.exactMatch.vendorLetter} —{' '}
                    {vendorsById.get(lookupResult.exactMatch.vendorId)?.name}
                  </span>
                </div>
                <div className="font-bold text-base text-white truncate mt-1">
                  {lookupResult.exactMatch.itemName}
                </div>
                <div className="font-mono font-extrabold text-lg text-emerald-400">
                  {formatCurrency(lookupResult.exactMatch.priceCents)}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleAddHangTagItem(lookupResult.exactMatch!)}
              className="min-h-[48px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold text-sm shrink-0 flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Item</span>
            </button>
          </div>
        )}

        {/* Duplicate Sale Warning for Unique Sold Item (Section 27) */}
        {lookupResult.alreadySoldWarning && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm">
                  {lookupResult.alreadySoldWarning.message}
                </div>
                <div className="text-xs text-amber-800">
                  {lookupResult.alreadySoldWarning.item.itemName} (
                  {formatCurrency(lookupResult.alreadySoldWarning.item.priceCents)}
                  ) is a unique quantity-1 item.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCodeInput('');
                  codeInputRef.current?.focus();
                }}
                className="min-h-[44px] px-4 rounded-xl bg-white border border-amber-300 hover:bg-amber-100 text-amber-950 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              {role === 'OWNER' && (
                <button
                  type="button"
                  onClick={() =>
                    handleAddHangTagItem(
                      lookupResult.alreadySoldWarning!.item,
                      true
                    )
                  }
                  className="min-h-[44px] px-3.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white font-semibold text-xs cursor-pointer"
                >
                  Admin Override: Sell Anyway
                </button>
              )}
            </div>
          </div>
        )}

        {/* Item Not Found + Closest Code Suggestions (Section 26) */}
        {lookupResult.query &&
          !lookupResult.exactMatch &&
          lookupResult.notFoundMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">
                  Item not found:{' '}
                  <span className="font-mono text-red-600">
                    {lookupResult.query}
                  </span>
                </span>
                <span className="text-xs text-slate-500">
                  {lookupResult.notFoundMessage}
                </span>
              </div>

              {lookupResult.suggestions.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1.5">
                    Did you mean:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {lookupResult.suggestions.map((sug) => (
                      <button
                        key={sug.id}
                        type="button"
                        onClick={() => setCodeInput(sug.itemCode)}
                        className="min-h-[44px] p-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-left flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-sm text-slate-900">
                            {sug.itemCode}
                          </div>
                          <div className="text-xs text-slate-600 truncate">
                            {sug.itemName}
                          </div>
                        </div>
                        <span className="font-mono font-semibold text-xs text-slate-800 shrink-0">
                          {formatCurrency(sug.priceCents)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
      </section>

      {/* METHOD B: DOT ITEM & RECENT VENDORS (Section 6 & 31) */}
      <section
        aria-label="Dot Sticker Item Entry"
        className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-2xs space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setDotDrawerOpen((prev) => !prev);
              if (!selectedDotVendorId && recentVendors[0]) {
                setSelectedDotVendorId(recentVendors[0].id);
              }
            }}
            className="w-full min-h-[50px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-base flex items-center justify-between shadow-xs transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <CircleDot className="w-5 h-5 text-amber-400" />
              <span>● Dot Item (Sticker Price Flow)</span>
            </span>
            <span className="text-xs font-medium text-slate-300">
              {dotDrawerOpen ? 'Hide Selector ▲' : 'Select Vendor & Price ▼'}
            </span>
          </button>
        </div>

        {/* Recent Dot Vendors Bar — Always visible for 2-tap checkout! */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Vendor Dots (Tap Vendor → Tap Price)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {recentVendors.map((vendor) => {
              const dotCfg = getDotColorConfig(vendor.dotColor);
              const isSelected =
                selectedDotVendorId === vendor.id && dotDrawerOpen;

              return (
                <button
                  key={vendor.id}
                  type="button"
                  onClick={() => {
                    setSelectedDotVendorId(vendor.id);
                    setDotDrawerOpen(true);
                  }}
                  aria-label={`Dot Vendor ${vendor.vendorLetter}, ${vendor.name}, ${vendor.dotColor} Dot`}
                  className={`min-h-[60px] p-2.5 rounded-xl border-2 text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900'
                  }`}
                >
                  {/* Large accessible circular color dot with vendor letter */}
                  <span
                    className={`w-10 h-10 rounded-full ${dotCfg.bgClass} ${dotCfg.textClass} font-extrabold text-base flex items-center justify-center shrink-0 shadow-xs border-2 border-white`}
                  >
                    {vendor.vendorLetter}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={`text-xs font-bold truncate ${
                        isSelected ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {vendor.vendorLetter} — {vendor.name.split(' ')[0]}
                    </div>
                    <div
                      className={`text-[11px] font-semibold truncate ${
                        isSelected ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      {vendor.dotColor} Dot
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Configured Dot Prices for Selected Vendor */}
        {dotDrawerOpen && selectedDotVendor && (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 animate-in fade-in duration-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full ${
                    getDotColorConfig(selectedDotVendor.dotColor).bgClass
                  } ${
                    getDotColorConfig(selectedDotVendor.dotColor).textClass
                  } text-xs font-bold flex items-center justify-center`}
                >
                  {selectedDotVendor.vendorLetter}
                </span>
                <span className="text-sm font-bold text-slate-900">
                  Vendor {selectedDotVendor.vendorLetter} —{' '}
                  {selectedDotVendor.name} ({selectedDotVendor.dotColor} Dot)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDotDrawerOpen(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 cursor-pointer"
              >
                Close
              </button>
            </div>

            {selectedVendorDotPrices.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">
                No dot sticker prices configured for {selectedDotVendor.name}.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {selectedVendorDotPrices.map((vp) => (
                  <button
                    key={vp.id}
                    type="button"
                    onClick={() =>
                      handleSelectDotPrice(selectedDotVendor, vp.priceCents)
                    }
                    className="min-h-[56px] rounded-xl bg-white hover:bg-emerald-50 active:bg-emerald-100 border-2 border-slate-300 hover:border-emerald-600 font-mono font-extrabold text-lg text-slate-900 shadow-2xs flex flex-col items-center justify-center transition-all cursor-pointer"
                  >
                    <span>{formatCurrency(vp.priceCents)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ACTIVE CART SECTION (Section 7 & 31) */}
      <section
        aria-label="Current Customer Cart"
        className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-2xs space-y-3"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-slate-700" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Current Cart ({cartTotals.itemCount}{' '}
              {cartTotals.itemCount === 1 ? 'item' : 'items'})
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {canUndoLastItem && (
              <button
                type="button"
                onClick={undoLastCartItem}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo Last</span>
              </button>
            )}
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="min-h-[36px] px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 font-semibold text-xs cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {cart.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm font-medium text-slate-500">
              Cart is empty. Enter a Hang Tag code or tap a Vendor Dot above.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  // One-tap helper to load the exact Section 35 Demo Scenario if desired
                  const a002 = inventory.find((i) => i.itemCode === 'A002');
                  const bluebird = vendors.find((v) => v.vendorLetter === 'B');
                  if (a002 && a002.status === 'AVAILABLE' && bluebird) {
                    setCodeInput('A002');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Try Demo: Enter A002 ($32) + Bluebird Dot ($5)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {cart.map((line) => {
              const dotCfg = getDotColorConfig(line.dotColor);
              const isEditingThisPrice = editingPriceLineId === line.lineId;

              return (
                <div
                  key={line.lineId}
                  className="py-3 first:pt-1 last:pb-1 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-full ${dotCfg.bgClass} ${dotCfg.textClass} font-bold text-xs flex items-center justify-center shrink-0 mt-0.5`}
                        title={`${line.dotColor ?? ''} • Vendor ${line.vendorLetter}`}
                      >
                        {line.vendorLetter}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            {line.itemCode}
                          </span>
                          <span className="font-bold text-sm text-slate-900">
                            {line.itemName}
                          </span>
                        </div>
                        <div className="text-xs font-medium text-slate-600 mt-0.5">
                          {line.vendorName} • Vendor {line.vendorLetter}
                          {line.tagType === 'DOT' &&
                            ` • ${line.dotColor ?? ''} Dot`}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-extrabold text-base text-slate-900">
                        {formatCurrency(line.lineTotalCents)}
                      </div>
                      {line.quantity > 1 && (
                        <div className="font-mono text-xs text-slate-500">
                          {line.quantity} × {formatCurrency(line.unitPriceCents)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quantity & Line Controls */}
                  <div className="flex items-center justify-between pl-9">
                    <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                      <button
                        type="button"
                        onClick={() => changeCartQuantity(line.lineId, -1)}
                        aria-label={`Decrease quantity of ${line.itemName}`}
                        className="w-9 h-9 rounded-lg bg-white hover:bg-slate-50 text-slate-800 flex items-center justify-center shadow-2xs cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-mono font-bold text-sm text-slate-900">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={line.tagType === 'HANG_TAG'}
                        onClick={() => changeCartQuantity(line.lineId, 1)}
                        aria-label={`Increase quantity of ${line.itemName}`}
                        className="w-9 h-9 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-800 flex items-center justify-center shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {role === 'OWNER' && !isEditingThisPrice && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPriceLineId(line.lineId);
                            setEditingPriceValue(
                              (line.unitPriceCents / 100).toFixed(2)
                            );
                          }}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit Price</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFromCart(line.lineId)}
                        aria-label={`Remove ${line.itemName} from cart`}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>

                  {/* Inline Owner Price Edit */}
                  {isEditingThisPrice && (
                    <div className="pl-9 flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={editingPriceValue}
                        onChange={(e) => setEditingPriceValue(e.target.value)}
                        placeholder="New price ($)"
                        className="w-28 px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => handleSavePriceOverride(line.lineId)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPriceLineId(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Subtotal & Total Summary */}
        {cart.length > 0 && (
          <div className="border-t border-slate-200 pt-3 space-y-1">
            <div className="flex items-center justify-between text-xs font-medium text-slate-600">
              <span>Subtotal ({cartTotals.itemCount} items)</span>
              <span className="font-mono">
                {formatCurrency(cartTotals.subtotalCents)}
              </span>
            </div>
            {activeEvent.taxEnabled && cartTotals.taxCents > 0 && (
              <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                <span>
                  Tax ({(activeEvent.taxRateBps / 100).toFixed(2)}%)
                </span>
                <span className="font-mono">
                  {formatCurrency(cartTotals.taxCents)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-base font-extrabold text-slate-900 pt-1">
              <span>TOTAL</span>
              <span className="font-mono text-xl">
                {formatCurrency(cartTotals.totalCents)}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* STICKY BOTTOM CHECKOUT BAR (Section 31) */}
      <div className="fixed bottom-16 left-0 right-0 z-30 px-3 sm:px-4 pointer-events-none">
        <div className="max-w-xl mx-auto bg-slate-900 text-white rounded-2xl p-3 shadow-xl border border-slate-700 flex items-center justify-between gap-3 pointer-events-auto">
          <div className="pl-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {cartTotals.itemCount}{' '}
              {cartTotals.itemCount === 1 ? 'item' : 'items'} • Subtotal{' '}
              {formatCurrency(cartTotals.subtotalCents)}
            </div>
            <div className="font-mono font-extrabold text-xl text-white">
              {formatCurrency(cartTotals.totalCents)}
            </div>
          </div>

          <button
            type="button"
            disabled={cart.length === 0 || isCreatingOrder}
            onClick={handleCheckoutTap}
            className="min-h-[52px] px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-extrabold text-base shadow-md transition-colors cursor-pointer"
          >
            {isCreatingOrder
              ? 'Creating Order...'
              : `CHECKOUT — ${formatCurrency(cartTotals.totalCents)}`}
          </button>
        </div>
      </div>
    </div>
  );
};
