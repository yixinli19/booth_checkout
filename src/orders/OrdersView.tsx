import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileText,
  SlidersHorizontal,
  Search,
  AlertCircle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  PlusCircle,
} from 'lucide-react';
import { useBooth } from '../context/BoothContext.tsx';
import { formatCurrency, parsePriceToCents } from '../lib/money.ts';
import type { AdjustmentReason, Order } from '../types/domain.ts';

interface OrdersViewProps {
  isAdminView?: boolean;
  onOpenPaperSaleModal?: () => void;
}

const ADJUSTMENT_REASONS: Array<{ value: AdjustmentReason; label: string }> = [
  { value: 'WRONG_VENDOR', label: 'Wrong Vendor Attributed' },
  { value: 'WRONG_ITEM', label: 'Wrong Item Entered' },
  { value: 'WRONG_AMOUNT', label: 'Wrong Amount / Price' },
  { value: 'DUPLICATE_TRANSACTION', label: 'Duplicate Transaction' },
  { value: 'PAYMENT_NOT_RECEIVED', label: 'Payment Not Actually Received' },
  { value: 'PAPER_RECONCILIATION', label: 'Paper Reconciliation Correction' },
  { value: 'OTHER', label: 'Other (Explain in Notes)' },
];

export const OrdersView: React.FC<OrdersViewProps> = ({
  isAdminView = false,
  onOpenPaperSaleModal,
}) => {
  const {
    orders,
    adjustments,
    vendors,
    role,
    adjustCompletedOrder,
  } = useBooth();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterSync, setFilterSync] = useState<'ALL' | 'PENDING_SYNC' | 'SYNCED' | 'PAPER'>('ALL');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Adjust Order Modal State (Owner only)
  const [adjustingOrder, setAdjustingOrder] = useState<Order | null>(null);
  const [adjReason, setAdjReason] = useState<AdjustmentReason>('WRONG_AMOUNT');
  const [adjVendorId, setAdjVendorId] = useState<string>('');
  const [adjDirection, setAdjDirection] = useState<'DEDUCT' | 'ADD'>('DEDUCT');
  const [adjDollarAmount, setAdjDollarAmount] = useState<string>('');
  const [adjNotes, setAdjNotes] = useState<string>('');
  const [adjError, setAdjError] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (filterSync === 'PENDING_SYNC' && o.syncStatus === 'SYNCED') return false;
      if (filterSync === 'SYNCED' && o.syncStatus !== 'SYNCED') return false;
      if (filterSync === 'PAPER' && o.source !== 'PAPER_RECOVERY') return false;

      if (!q) return true;
      const matchesNum = o.orderNumber.toLowerCase().includes(q);
      const matchesLine = o.lines.some(
        (l) =>
          l.itemCode.toLowerCase().includes(q) ||
          l.itemDescription.toLowerCase().includes(q) ||
          l.vendorName.toLowerCase().includes(q)
      );
      return matchesNum || matchesLine;
    });
  }, [orders, searchQuery, filterSync]);

  const adjustmentsByOrderId = useMemo(() => {
    const map = new Map<string, typeof adjustments>();
    for (const adj of adjustments) {
      const list = map.get(adj.orderId) ?? [];
      list.push(adj);
      map.set(adj.orderId, list);
    }
    return map;
  }, [adjustments]);

  const handleOpenAdjustModal = (order: Order) => {
    setAdjustingOrder(order);
    setAdjReason('WRONG_AMOUNT');
    setAdjVendorId(order.lines[0]?.vendorId ?? '');
    setAdjDirection('DEDUCT');
    setAdjDollarAmount('');
    setAdjNotes('');
    setAdjError(null);
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingOrder) return;

    const cents = parsePriceToCents(adjDollarAmount, { allowZero: true });
    if (cents === null) {
      setAdjError('Enter a valid adjustment dollar amount (e.g. 6.00).');
      return;
    }
    if (!adjNotes.trim()) {
      setAdjError('Please enter an explanation note for the audit trail.');
      return;
    }

    const signedDelta = adjDirection === 'DEDUCT' ? -cents : cents;
    try {
      await adjustCompletedOrder({
        orderId: adjustingOrder.id,
        reason: adjReason,
        notes: adjNotes.trim(),
        deltaTotalCents: signedDelta,
        vendorId: adjVendorId || undefined,
      });
      setAdjustingOrder(null);
    } catch (err) {
      setAdjError(err instanceof Error ? err.message : 'Adjustment failed.');
    }
  };

  return (
    <div
      className={`${
        isAdminView ? 'max-w-5xl' : 'max-w-xl pb-24'
      } mx-auto px-3 sm:px-4 pt-4 space-y-4`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {isAdminView ? 'Event Transactions & Audit Adjustments' : "Today's Orders"}
          </h1>
          <p className="text-xs text-slate-600">
            {orders.length} recorded transaction{orders.length === 1 ? '' : 's'} • Immutable order history with snapshot vendor attribution
          </p>
        </div>

        {onOpenPaperSaleModal && (
          <button
            type="button"
            onClick={onOpenPaperSaleModal}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-2 self-start cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Paper Sale</span>
          </button>
        )}
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-2xs flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order #, item code (A002), or vendor..."
            className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:border-slate-900 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'PENDING_SYNC', label: 'Pending Sync' },
            { id: 'SYNCED', label: 'Synced' },
            { id: 'PAPER', label: 'Paper Recovery' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setFilterSync(tab.id as typeof filterSync)
              }
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                filterSync === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            No matching transactions found.
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isExpanded = expandedOrderId === order.id;
            const orderAdjs = adjustmentsByOrderId.get(order.id) ?? [];
            const hasConflicts =
              order.conflictFlags && order.conflictFlags.length > 0;

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden"
              >
                <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {order.orderNumber}
                      </span>

                      {/* Sync Status Badge */}
                      {order.syncStatus === 'SYNCED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Synced
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                          <Clock className="w-3 h-3" />
                          Pending Sync
                        </span>
                      )}

                      {/* Paper Recovery Identification Badge (Section 13) */}
                      {order.source === 'PAPER_RECOVERY' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
                          <FileText className="w-3 h-3" />
                          Source: Paper Recovery
                        </span>
                      )}

                      {/* Adjusted Status Badge */}
                      {order.paymentStatus === 'ADJUSTED' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          Adjusted
                        </span>
                      )}

                      {hasConflicts && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-50 text-red-800 border border-red-200">
                          <ShieldAlert className="w-3 h-3" />
                          Conflict Flagged
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                      <span>
                        {new Date(order.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span>•</span>
                      <span>{order.paymentProvider}</span>
                      <span>•</span>
                      <span>
                        {order.lines.map((l) => `${l.itemCode} (${l.vendorLetter})`).join(', ')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="font-mono font-extrabold text-base text-slate-900">
                        {formatCurrency(order.totalCents)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {order.lines.reduce((a, l) => a + l.quantity, 0)} items
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedOrderId(isExpanded ? null : order.id)
                      }
                      aria-label={`Toggle details for ${order.orderNumber}`}
                      className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>Details</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Line Items & Adjustments */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 p-3.5 sm:p-4 space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Attributed Sale Lines (Transaction Snapshot)
                    </div>
                    <div className="divide-y divide-slate-200/70 bg-white rounded-xl border border-slate-200 px-3">
                      {order.lines.map((line) => (
                        <div
                          key={line.id}
                          className="py-2.5 flex items-center justify-between text-xs sm:text-sm"
                        >
                          <div>
                            <span className="font-mono font-bold text-slate-900 mr-2">
                              {line.itemCode}
                            </span>
                            <span className="font-semibold text-slate-800">
                              {line.itemDescription}
                            </span>
                            <div className="text-xs text-slate-500">
                              Vendor {line.vendorLetter} — {line.vendorName} •{' '}
                              {line.tagType}
                            </div>
                          </div>
                          <div className="text-right font-mono">
                            <div className="font-bold text-slate-900">
                              {formatCurrency(line.lineTotalCents)}
                            </div>
                            {line.quantity > 1 && (
                              <div className="text-[11px] text-slate-500">
                                {line.quantity} ×{' '}
                                {formatCurrency(line.unitPriceCents)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {order.notes && (
                      <div className="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200">
                        <span className="font-semibold">Order Note:</span>{' '}
                        {order.notes}
                      </div>
                    )}

                    {/* Adjustment History (Section 25) */}
                    {orderAdjs.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-xs font-bold uppercase tracking-wider text-blue-800">
                          Adjustment Audit Trail
                        </div>
                        {orderAdjs.map((adj) => (
                          <div
                            key={adj.id}
                            className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between font-bold text-blue-950">
                              <span>
                                Reason: {adj.reason} • By {adj.performedBy}
                              </span>
                              <span className="font-mono">
                                {adj.deltaTotalCents >= 0 ? '+' : ''}
                                {formatCurrency(adj.deltaTotalCents)}
                              </span>
                            </div>
                            <div className="text-blue-900">{adj.notes}</div>
                            <div className="text-[11px] text-blue-700 font-mono">
                              Original: {adj.originalValueJson} → Updated:{' '}
                              {adj.updatedValueJson}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-mono text-slate-400">
                        UUID: {order.id} • Idempotency: {order.idempotencyKey}
                      </span>

                      {role === 'OWNER' && (
                        <button
                          type="button"
                          onClick={() => handleOpenAdjustModal(order)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>Adjust Order</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Adjust Order Modal (Section 25) */}
      {adjustingOrder && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjust-order-title"
        >
          <form
            onSubmit={handleSubmitAdjustment}
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4"
          >
            <div>
              <h3
                id="adjust-order-title"
                className="text-lg font-bold text-slate-900"
              >
                Adjust Order {adjustingOrder.orderNumber}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Completed transactions are never deleted. This records an auditable financial adjustment.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Adjustment Reason
              </label>
              <select
                value={adjReason}
                onChange={(e) =>
                  setAdjReason(e.target.value as AdjustmentReason)
                }
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {ADJUSTMENT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Affected Vendor
              </label>
              <select
                value={adjVendorId}
                onChange={(e) => setAdjVendorId(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    Vendor {v.vendorLetter} — {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Adjustment Type
                </label>
                <select
                  value={adjDirection}
                  onChange={(e) =>
                    setAdjDirection(e.target.value as 'DEDUCT' | 'ADD')
                  }
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
                >
                  <option value="DEDUCT">Deduct / Refund (-)</option>
                  <option value="ADD">Add Credit (+)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Amount ($)
                </label>
                <input
                  type="text"
                  value={adjDollarAmount}
                  onChange={(e) => setAdjDollarAmount(e.target.value)}
                  placeholder="e.g. 6.00"
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Audit Explanation / Reason Details
              </label>
              <textarea
                rows={3}
                value={adjNotes}
                onChange={(e) => setAdjNotes(e.target.value)}
                placeholder="Describe what happened and why this adjustment was made..."
                className="w-full p-3 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            {adjError && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{adjError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustingOrder(null)}
                className="min-h-[42px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                Record Audit Adjustment
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
