import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  WifiOff,
  CloudUpload,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { useBooth } from '../context/BoothContext.tsx';
import { formatCurrency } from '../lib/money.ts';
import { generatePaymentDetails } from '../payments/paymentProviders.ts';
import { generateQrSvgString } from '../lib/qrcode.ts';
import { getDotColorConfig } from '../offline/seedData.ts';

export const QrPaymentModal: React.FC = () => {
  const {
    activeCheckoutOrder,
    lastCompletedOrder,
    activeEvent,
    isOffline,
    confirmOrderPayment,
    cancelOrderCheckout,
    dismissCompletedOrderScreen,
  } = useBooth();

  const [isConfirming, setIsConfirming] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const paymentDetails = useMemo(() => {
    if (!activeCheckoutOrder || !activeEvent) return null;
    return generatePaymentDetails({
      provider: activeCheckoutOrder.paymentProvider,
      recipientIdentifier: activeEvent.paymentIdentifier,
      amountCents: activeCheckoutOrder.totalCents,
      orderNumber: activeCheckoutOrder.orderNumber,
      eventName: activeEvent.name,
      customTemplate: activeEvent.customPaymentTemplate,
    });
  }, [activeCheckoutOrder, activeEvent]);

  const qrSvg = useMemo(() => {
    if (!paymentDetails) return '';
    return generateQrSvgString(paymentDetails.paymentUrl, 3);
  }, [paymentDetails]);

  // Group vendor attribution for the active or completed order
  const orderForBreakdown = activeCheckoutOrder ?? lastCompletedOrder;
  const vendorBreakdown = useMemo(() => {
    if (!orderForBreakdown) return [];
    const map = new Map<
      string,
      { vendorLetter: string; vendorName: string; cents: number; items: number }
    >();
    for (const line of orderForBreakdown.lines) {
      const prev = map.get(line.vendorId) ?? {
        vendorLetter: line.vendorLetter,
        vendorName: line.vendorName,
        cents: 0,
        items: 0,
      };
      map.set(line.vendorId, {
        ...prev,
        cents: prev.cents + line.lineTotalCents,
        items: prev.items + line.quantity,
      });
    }
    return Array.from(map.values());
  }, [orderForBreakdown]);

  if (!activeCheckoutOrder && !lastCompletedOrder) {
    return null;
  }

  // Completed Sale Confirmation View
  if (lastCompletedOrder && !activeCheckoutOrder) {
    return (
      <div
        className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-complete-heading"
      >
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center space-y-5 animate-in fade-in zoom-in-95 duration-150">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              Payment Confirmed
            </span>
            <h2
              id="sale-complete-heading"
              className="text-3xl font-bold text-slate-900 mt-2"
            >
              {formatCurrency(lastCompletedOrder.totalCents)}
            </h2>
            <p className="text-sm font-medium text-slate-600 mt-0.5">
              Order <span className="font-mono font-bold text-slate-900">{lastCompletedOrder.orderNumber}</span>
            </p>
          </div>

          {/* Sync Status Banner */}
          {lastCompletedOrder.syncStatus === 'SYNCED' ? (
            <div className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Saved locally &amp; synchronized with server</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-medium text-amber-900">
              <CloudUpload className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                This sale is saved on this device (<strong>Pending Sync</strong>) and will sync automatically when online.
              </span>
            </div>
          )}

          {/* Vendor Attribution Summary */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-left space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Vendor Attribution Recorded
            </div>
            {vendorBreakdown.map((vb) => (
              <div
                key={vb.vendorLetter}
                className="flex items-center justify-between text-sm font-medium text-slate-800"
              >
                <span>
                  Vendor {vb.vendorLetter} — {vb.vendorName}{' '}
                  <span className="text-slate-500 text-xs">({vb.items} item{vb.items !== 1 ? 's' : ''})</span>
                </span>
                <span className="font-mono font-bold text-emerald-700">
                  +{formatCurrency(vb.cents)}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={dismissCompletedOrderScreen}
            className="w-full min-h-[54px] rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-semibold text-base shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Sparkles className="w-5 h-5" />
            <span>Start Next Sale</span>
          </button>
        </div>
      </div>
    );
  }

  if (!activeCheckoutOrder || !paymentDetails) return null;

  const handleConfirmPayment = async () => {
    if (isConfirming) return; // Immediate duplicate-tap lock
    setIsConfirming(true);
    setErrorMsg(null);
    try {
      await confirmOrderPayment(activeCheckoutOrder.id);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not record payment confirmation.'
      );
      setIsConfirming(false);
    }
  };

  const handleCancel = async () => {
    if (isConfirming) return;
    await cancelOrderCheckout(activeCheckoutOrder.id);
  };

  const handleCopyUrl = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(paymentDetails.paymentUrl).catch(() => {});
    }
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-payment-heading"
    >
      <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Customer Payment
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono font-bold text-sm text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
                Order {activeCheckoutOrder.orderNumber}
              </span>
              {isOffline && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-900">
                  <WifiOff className="w-3 h-3" />
                  Offline QR Ready
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-slate-500">Provider</span>
            <div className="text-sm font-bold text-slate-800">
              {paymentDetails.providerDisplayName}
            </div>
          </div>
        </div>

        {/* Exact Total */}
        <div className="text-center py-1">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Exact Amount Due
          </div>
          <h1
            id="qr-payment-heading"
            className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mt-1"
          >
            {formatCurrency(activeCheckoutOrder.totalCents)}
          </h1>
        </div>

        {/* Client-side Offline SVG QR Code */}
        <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 flex flex-col items-center">
          <div
            className="w-56 h-56 sm:w-64 sm:h-64 bg-white p-2 rounded-xl shadow-sm border border-slate-200"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="mt-3 text-center">
            <div className="text-base font-bold text-slate-900">Scan to Pay</div>
            <div className="text-xs text-slate-600 mt-0.5">
              Recipient: <span className="font-semibold text-slate-800">{paymentDetails.recipientDisplay}</span>
              {' • '}
              Note: <span className="font-mono font-semibold text-slate-800">"{paymentDetails.noteText}"</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyUrl}
            className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 shadow-2xs cursor-pointer"
          >
            {copiedUrl ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copied Payment Link</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Payment URL ({paymentDetails.formattedAmount})</span>
              </>
            )}
          </button>
        </div>

        {/* Vendor Attribution Preview */}
        <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-200">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Attributed Vendors ({activeCheckoutOrder.lines.reduce((a, l) => a + l.quantity, 0)} items)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {vendorBreakdown.map((vb) => {
              const dotCfg = getDotColorConfig();
              return (
                <span
                  key={vb.vendorLetter}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-800"
                >
                  <span className="font-bold text-slate-900">
                    {vb.vendorLetter} • {vb.vendorName}:
                  </span>
                  <span className="font-mono font-semibold text-emerald-700">
                    {formatCurrency(vb.cents)}
                  </span>
                  <span className="sr-only">{dotCfg.name}</span>
                </span>
              );
            })}
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
            {errorMsg}
          </div>
        )}

        {/* Primary & Secondary Actions */}
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            disabled={isConfirming}
            onClick={handleConfirmPayment}
            className="w-full min-h-[54px] rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-400 text-white font-bold text-base shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>
              {isConfirming ? 'Recording Payment...' : 'Payment Received'}
            </span>
          </button>

          <button
            type="button"
            disabled={isConfirming}
            onClick={handleCancel}
            className="w-full min-h-[46px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Cancel / Return to Cart</span>
          </button>
        </div>
      </div>
    </div>
  );
};
