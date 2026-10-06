import React, { useState } from 'react';
import {
  CheckCircle2,
  CloudUpload,
  RefreshCw,
  Wifi,
  WifiOff,
  Database,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { useBooth } from '../context/BoothContext.tsx';
import { formatCurrency } from '../lib/money.ts';

function formatReadableTimestamp(iso?: string): string {
  if (!iso) return 'Not yet recorded';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const SyncStatusView: React.FC = () => {
  const {
    isOffline,
    simulatedOffline,
    setSimulatedOffline,
    isSyncing,
    lastSyncMessage,
    unsyncedOrderCount,
    syncState,
    orders,
    triggerSync,
    prepareRegister,
  } = useBooth();

  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const pendingOrders = orders.filter(
    (o) =>
      (o.paymentStatus === 'COMPLETED' || o.paymentStatus === 'ADJUSTED') &&
      o.syncStatus !== 'SYNCED'
  );

  const handleRetrySync = async () => {
    setStatusFeedback(null);
    try {
      const res = await triggerSync();
      setStatusFeedback({
        type: 'ok',
        text:
          res.syncedCount > 0
            ? `Successfully synchronized ${res.syncedCount} transaction(s).`
            : res.messages[0] ?? 'All caught up.',
      });
    } catch (err) {
      setStatusFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Synchronization failed.',
      });
    }
  };

  const handleRefreshCatalog = async () => {
    try {
      await prepareRegister();
      setStatusFeedback({
        type: 'ok',
        text: 'Local catalog verified and ready for offline operation.',
      });
    } catch (err) {
      setStatusFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Catalog verification failed.',
      });
    }
  };

  return (
    <div className="max-w-xl mx-auto px-3 sm:px-4 pt-4 pb-24 space-y-4">
      {/* Main Sync Status Hero Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {unsyncedOrderCount === 0 ? (
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-7 h-7" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <CloudUpload className="w-7 h-7" />
              </div>
            )}

            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                {unsyncedOrderCount === 0
                  ? 'All caught up'
                  : `${unsyncedOrderCount} ${
                      unsyncedOrderCount === 1 ? 'transaction' : 'transactions'
                    } waiting to sync`}
              </h1>
              <p className="text-xs text-slate-600 mt-0.5">
                {unsyncedOrderCount === 0
                  ? 'Every completed checkout on this register is backed up to the server.'
                  : 'Sales are safely stored in local IndexedDB on this device. You can continue ringing sales.'}
              </p>
            </div>
          </div>
        </div>

        {/* Key Sync Metrics Grid (Section 12) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Catalog downloaded
            </div>
            <div className="text-xs font-bold text-slate-900 mt-1">
              {formatReadableTimestamp(syncState?.catalogDownloadedAt)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Last sync
            </div>
            <div className="text-xs font-bold text-slate-900 mt-1">
              {formatReadableTimestamp(syncState?.lastSuccessfulSyncAt)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Pending sales
            </div>
            <div className="text-lg font-mono font-extrabold text-slate-900 mt-0.5">
              {unsyncedOrderCount}
            </div>
          </div>
        </div>

        {statusFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              statusFeedback.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}
          >
            {statusFeedback.type === 'ok' ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            )}
            <span>{statusFeedback.text}</span>
          </div>
        )}

        {lastSyncMessage && !statusFeedback && (
          <div className="text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            {lastSyncMessage}
          </div>
        )}

        {/* Primary Action: Retry Sync */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            disabled={isSyncing}
            onClick={handleRetrySync}
            className="flex-1 min-h-[48px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            <RefreshCw
              className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
            />
            <span>{isSyncing ? 'Synchronizing...' : 'Retry Sync'}</span>
          </button>

          <button
            type="button"
            onClick={handleRefreshCatalog}
            className="min-h-[48px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Database className="w-4 h-4" />
            <span>Verify Offline Catalog</span>
          </button>
        </div>
      </div>

      {/* Airplane Mode / Network Simulation Control */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {isOffline ? (
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <WifiOff className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Wifi className="w-5 h-5" />
            </div>
          )}
          <div>
            <div className="text-sm font-bold text-slate-900">
              Network Connectivity: {isOffline ? 'Offline (Airplane Mode)' : 'Online'}
            </div>
            <div className="text-xs text-slate-600">
              Toggle simulated Airplane Mode to test offline checkout &amp; idempotent recovery.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSimulatedOffline(!simulatedOffline)}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl font-bold text-xs shrink-0 transition-colors cursor-pointer ${
            simulatedOffline
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300'
          }`}
        >
          {simulatedOffline ? 'Restore Internet' : 'Simulate Airplane Mode'}
        </button>
      </div>

      {/* Pending Sync Transactions Queue */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Pending Upload Queue ({pendingOrders.length})
        </h2>

        {pendingOrders.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">
            No unsynced orders in local queue.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingOrders.map((order) => (
              <div
                key={order.id}
                className="py-2.5 flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-slate-900">
                    {order.orderNumber}
                  </span>
                  <span className="text-slate-500 ml-2">
                    {order.lines.length} line(s) • Idempotency:{' '}
                    <span className="font-mono">{order.idempotencyKey}</span>
                  </span>
                  <div className="text-[11px] text-amber-800 mt-0.5">
                    This sale is saved on this device but has not reached the server yet.
                  </div>
                </div>
                <span className="font-mono font-bold text-sm text-slate-900 shrink-0">
                  {formatCurrency(order.totalCents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
