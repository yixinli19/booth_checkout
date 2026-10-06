import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  DownloadCloud,
  Plus,
  Save,
  QrCode,
} from 'lucide-react';
import { useBooth } from '../context/BoothContext.tsx';
import { generatePaymentDetails } from '../payments/paymentProviders.ts';
import type { MarketEvent, PaymentProviderType } from '../types/domain.ts';

export const AdminEventView: React.FC = () => {
  const {
    events,
    activeEvent,
    vendors,
    inventory,
    priceOptions,
    syncState,
    saveEventSettings,
    createNewEvent,
    setActiveEventById,
    prepareRegister,
  } = useBooth();

  const [formState, setFormState] = useState<MarketEvent | null>(activeEvent);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [showNewEventModal, setShowNewEventModal] = useState(false);

  // New event draft
  const [newEvtName, setNewEvtName] = useState('Holiday Artisans Popup');
  const [newEvtDate, setNewEvtDate] = useState('2026-11-14');
  const [newEvtLocation, setNewEvtLocation] = useState('Civic Center Atrium');
  const [newEvtPrefix, setNewEvtPrefix] = useState('HOL26');

  useEffect(() => {
    if (activeEvent) {
      setFormState(activeEvent);
    }
  }, [activeEvent]);

  if (!formState) return null;

  const samplePaymentPreview = generatePaymentDetails({
    provider: formState.paymentProvider,
    recipientIdentifier: formState.paymentIdentifier || 'Stella-MakersMarket',
    amountCents: 4250,
    orderNumber: `${formState.orderPrefix}-1048`,
    eventName: formState.name,
    customTemplate: formState.customPaymentTemplate,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveEventSettings(formState);
    setSavedBanner('Event settings saved and updated in local database.');
    setTimeout(() => setSavedBanner(null), 3000);
  };

  const handlePrepareRegister = async () => {
    setIsPreparing(true);
    try {
      await prepareRegister();
      setSavedBanner(
        'Register prepared! Full vendor catalog, inventory, and dot pricing cached for offline operation.'
      );
      setTimeout(() => setSavedBanner(null), 4000);
    } finally {
      setIsPreparing(false);
    }
  };

  const handleCreateNewEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvtName.trim()) return;
    await createNewEvent({
      name: newEvtName.trim(),
      date: newEvtDate,
      startTime: '09:00',
      endTime: '17:00',
      location: newEvtLocation.trim() || 'Main Booth',
      currency: 'USD',
      taxRateBps: 0,
      taxEnabled: false,
      commissionRateBps: 0,
      paymentProvider: formState.paymentProvider,
      paymentIdentifier: formState.paymentIdentifier,
      customPaymentTemplate: formState.customPaymentTemplate,
      orderPrefix: newEvtPrefix.trim().toUpperCase() || 'MKT',
      nextOrderSeq: 1001,
      isActive: true,
    });
    setShowNewEventModal(false);
  };

  const vendorReady = vendors.length > 0;
  const inventoryReady = inventory.length > 0;
  const dotReady = priceOptions.length > 0;
  const settingsReady = Boolean(formState.paymentIdentifier && formState.orderPrefix);
  const offlineReady =
    Boolean(syncState?.isCatalogReadyOffline) &&
    vendorReady &&
    inventoryReady &&
    settingsReady;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Event Selector Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Event Configuration &amp; Offline Register Prep
          </h1>
          <p className="text-xs text-slate-600">
            Configure payment provider adapters, order prefixes, and pre-event offline storage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={formState.id}
            onChange={(e) => setActiveEventById(e.target.value)}
            aria-label="Select Active Market Event"
            className="min-h-[40px] px-3 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} ({ev.orderPrefix})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowNewEventModal(true)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Event</span>
          </button>
        </div>
      </div>

      {savedBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      {/* PREPARE REGISTER CARD (Section 15) */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Pre-Market Readiness Check
            </span>
            <h2 className="text-lg font-extrabold mt-0.5">
              Prepare Register for Offline Operation
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Downloads and verifies the complete event catalog in local IndexedDB so checkout works in Airplane Mode.
            </p>
          </div>

          <button
            type="button"
            disabled={isPreparing}
            onClick={handlePrepareRegister}
            className="min-h-[48px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm inline-flex items-center justify-center gap-2 shrink-0 shadow-xs cursor-pointer"
          >
            <DownloadCloud className="w-5 h-5" />
            <span>{isPreparing ? 'Preparing...' : 'Prepare Register'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
          {[
            {
              ok: vendorReady,
              label: 'Vendor catalog downloaded',
              detail: `${vendors.length} vendors`,
            },
            {
              ok: inventoryReady,
              label: 'Inventory downloaded',
              detail: `${inventory.length} items`,
            },
            {
              ok: dotReady,
              label: 'Dot pricing downloaded',
              detail: `${priceOptions.length} price tiers`,
            },
            {
              ok: settingsReady,
              label: 'Event settings downloaded',
              detail: `${formState.paymentProvider} • ${formState.orderPrefix}`,
            },
            {
              ok: offlineReady,
              label: 'Checkout ready offline',
              detail: offlineReady ? 'Verified Ready' : 'Needs catalog',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="p-3 rounded-xl bg-white/10 border border-white/15 flex items-start gap-2.5"
            >
              <span
                className={`font-bold text-sm ${
                  item.ok ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {item.ok ? '✓' : '⚠'}
              </span>
              <div>
                <div className="text-xs font-bold text-white leading-snug">
                  {item.label}
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  {item.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Event & Payment Configuration Form */}
      <form
        onSubmit={handleSave}
        className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-5"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Calendar className="w-5 h-5 text-slate-700" />
          <h2 className="text-base font-bold text-slate-900">
            Event Details &amp; Schedule
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Event Name
            </label>
            <input
              type="text"
              value={formState.name}
              onChange={(e) =>
                setFormState({ ...formState, name: e.target.value })
              }
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Location
            </label>
            <input
              type="text"
              value={formState.location}
              onChange={(e) =>
                setFormState({ ...formState, location: e.target.value })
              }
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Event Date
              </label>
              <input
                type="date"
                value={formState.date}
                onChange={(e) =>
                  setFormState({ ...formState, date: e.target.value })
                }
                className="w-full min-h-[42px] px-2.5 rounded-xl border border-slate-300 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={formState.startTime}
                onChange={(e) =>
                  setFormState({ ...formState, startTime: e.target.value })
                }
                className="w-full min-h-[42px] px-2.5 rounded-xl border border-slate-300 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                End Time
              </label>
              <input
                type="time"
                value={formState.endTime}
                onChange={(e) =>
                  setFormState({ ...formState, endTime: e.target.value })
                }
                className="w-full min-h-[42px] px-2.5 rounded-xl border border-slate-300 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Order Number Prefix
              </label>
              <input
                type="text"
                value={formState.orderPrefix}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    orderPrefix: e.target.value.toUpperCase(),
                  })
                }
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Next Order Sequence #
              </label>
              <input
                type="number"
                value={formState.nextOrderSeq}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    nextOrderSeq: parseInt(e.target.value, 10) || 1001,
                  })
                }
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Payment Provider Configuration (Section 9) */}
        <div className="border-t border-slate-100 pt-4 space-y-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-slate-700" />
            <h3 className="text-base font-bold text-slate-900">
              Payment Provider Adapter &amp; QR Template
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Preferred Payment Provider
              </label>
              <select
                value={formState.paymentProvider}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    paymentProvider: e.target.value as PaymentProviderType,
                  })
                }
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
              >
                <option value="VENMO">Venmo</option>
                <option value="PAYPAL">PayPal (PayPal.Me)</option>
                <option value="CASH_APP">Cash App ($Cashtag)</option>
                <option value="CUSTOM">Custom Payment URL Template</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Recipient Account / Identifier
              </label>
              <input
                type="text"
                value={formState.paymentIdentifier}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    paymentIdentifier: e.target.value,
                  })
                }
                placeholder="e.g. Stella-MakersMarket"
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono text-sm"
              />
            </div>
          </div>

          {formState.paymentProvider === 'CUSTOM' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Custom URL Template (Variables: &#123;recipient&#125;, &#123;amount&#125;, &#123;orderNumber&#125;, &#123;note&#125;)
              </label>
              <input
                type="text"
                value={formState.customPaymentTemplate ?? ''}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    customPaymentTemplate: e.target.value,
                  })
                }
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono text-xs"
              />
            </div>
          )}

          {/* Live Payment URL Adapter Preview */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Live Payment URL Preview (for $42.50, Order {formState.orderPrefix}-1048)
            </div>
            <div className="font-mono text-xs text-slate-800 break-all">
              {samplePaymentPreview.paymentUrl}
            </div>
          </div>
        </div>

        {/* Optional Sales Tax & Currency */}
        <div className="border-t border-slate-100 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={formState.taxEnabled}
              onChange={(e) =>
                setFormState({ ...formState, taxEnabled: e.target.checked })
              }
              className="w-4 h-4 rounded"
            />
            <span>Enable Sales Tax on Checkout</span>
          </label>

          {formState.taxEnabled && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tax Rate (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={(formState.taxRateBps / 100).toFixed(2)}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    taxRateBps: Math.round(
                      (parseFloat(e.target.value) || 0) * 100
                    ),
                  })
                }
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 font-mono text-sm"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="min-h-[44px] px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Event Configuration</span>
          </button>
        </div>
      </form>

      {/* New Event Modal */}
      {showNewEventModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateNewEvent}
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4"
          >
            <h3 className="text-lg font-bold text-slate-900">
              Create Market Event
            </h3>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Event Name
              </label>
              <input
                type="text"
                value={newEvtName}
                onChange={(e) => setNewEvtName(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={newEvtDate}
                  onChange={(e) => setNewEvtDate(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Order Prefix
                </label>
                <input
                  type="text"
                  value={newEvtPrefix}
                  onChange={(e) => setNewEvtPrefix(e.target.value.toUpperCase())}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 font-mono text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Location
              </label>
              <input
                type="text"
                value={newEvtLocation}
                onChange={(e) => setNewEvtLocation(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewEventModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                Create &amp; Activate
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
