import React, { useState } from 'react';
import {
  ShoppingBag,
  Receipt,
  RefreshCw,
  MoreHorizontal,
  LayoutDashboard,
  Calendar,
  Users,
  Package,
  FileSpreadsheet,
  BarChart3,
  Settings,
  Store,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  type AdminTab,
  BoothProvider,
  type OperatorTab,
  useBooth,
} from './context/BoothContext.tsx';
import { OperatorCheckoutView } from './checkout/OperatorCheckoutView.tsx';
import { QrPaymentModal } from './checkout/QrPaymentModal.tsx';
import { OrdersView } from './orders/OrdersView.tsx';
import { SyncStatusView } from './sync/SyncStatusView.tsx';
import { EmergencyPaperModeView } from './offline/EmergencyPaperModeView.tsx';
import { AdminOverviewView } from './reports/AdminOverviewView.tsx';
import { AdminEventView } from './events/AdminEventView.tsx';
import { AdminVendorsView } from './vendors/AdminVendorsView.tsx';
import { AdminInventoryView } from './inventory/AdminInventoryView.tsx';
import { AdminImportsView } from './imports/AdminImportsView.tsx';
import { AdminReportsView } from './reports/AdminReportsView.tsx';
import { AdminSettingsView } from './components/AdminSettingsView.tsx';

const BoothShell: React.FC = () => {
  const {
    isLoading,
    appMode,
    operatorTab,
    adminTab,
    setAppMode,
    setOperatorTab,
    setAdminTab,
    activeEvent,
    isOffline,
    simulatedOffline,
    setSimulatedOffline,
    unsyncedOrderCount,
    cartTotals,
    triggerSync,
  } = useBooth();

  const [showPaperModal, setShowPaperModal] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center mx-auto font-bold">
            BC
          </div>
          <div className="text-sm font-bold text-slate-800">
            Loading Booth Checkout Local Database...
          </div>
        </div>
      </div>
    );
  }

  // --- OPERATOR MODE (MOBILE-FIRST REGISTER) ---
  if (appMode === 'OPERATOR') {
    const operatorNavItems: Array<{
      id: OperatorTab;
      label: string;
      icon: React.ReactNode;
      badge?: number;
    }> = [
      {
        id: 'CHECKOUT',
        label: 'Checkout',
        icon: <ShoppingBag className="w-5 h-5" />,
        badge: cartTotals.itemCount > 0 ? cartTotals.itemCount : undefined,
      },
      {
        id: 'ORDERS',
        label: 'Orders',
        icon: <Receipt className="w-5 h-5" />,
      },
      {
        id: 'SYNC',
        label: 'Sync Status',
        icon: <RefreshCw className="w-5 h-5" />,
        badge: unsyncedOrderCount > 0 ? unsyncedOrderCount : undefined,
      },
      {
        id: 'MORE',
        label: 'More',
        icon: <MoreHorizontal className="w-5 h-5" />,
      },
    ];

    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
        {/* Operator Header (Section 4) */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5 shadow-2xs">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base text-slate-900 tracking-tight">
                  Booth Checkout
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-700">
                  Cart: {cartTotals.itemCount}
                </span>
              </div>

              {/* Event Name • Online/Offline Status • Sync Indicator */}
              <div className="text-xs font-medium text-slate-600 flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="font-semibold text-slate-800 truncate">
                  {activeEvent?.name ?? 'No Event'}
                </span>
                <span>•</span>
                {isOffline ? (
                  <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                    <span className="w-2 h-2 rounded-full bg-amber-600" />
                    Offline
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Online
                  </span>
                )}
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setOperatorTab('SYNC')}
                  className={`underline decoration-dotted cursor-pointer font-semibold ${
                    unsyncedOrderCount > 0
                      ? 'text-amber-800'
                      : 'text-slate-500'
                  }`}
                >
                  {unsyncedOrderCount > 0
                    ? `${unsyncedOrderCount} ${
                        unsyncedOrderCount === 1 ? 'sale' : 'sales'
                      } waiting to sync`
                    : 'All caught up'}
                </button>
              </div>
            </div>

            {/* Right Controls: Airplane Mode Sim + Stella Admin Switch */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setSimulatedOffline(!simulatedOffline)}
                title="Toggle Airplane Mode / Offline Simulation"
                className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 border transition-colors cursor-pointer ${
                  isOffline
                    ? 'bg-amber-100 text-amber-950 border-amber-300'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isOffline ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-amber-800" />
                    <span className="hidden sm:inline">Offline</span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="hidden sm:inline">Online</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setAppMode('ADMIN')}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Stella Admin</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Operator Content */}
        <main className="flex-1">
          {operatorTab === 'CHECKOUT' && <OperatorCheckoutView />}
          {operatorTab === 'ORDERS' && <OrdersView isAdminView={false} />}
          {operatorTab === 'SYNC' && <SyncStatusView />}
          {operatorTab === 'MORE' && <EmergencyPaperModeView />}
        </main>

        {/* Bottom Mobile Operator Navigation (Section 3) */}
        <nav
          aria-label="Operator Main Navigation"
          className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 px-2 py-1 shadow-lg"
        >
          <div className="max-w-xl mx-auto grid grid-cols-4 gap-1">
            {operatorNavItems.map((item) => {
              const isActive = operatorTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOperatorTab(item.id)}
                  className={`min-h-[50px] rounded-xl flex flex-col items-center justify-center relative transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100 font-medium'
                  }`}
                >
                  {item.icon}
                  <span className="text-[11px] mt-0.5">{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`absolute top-1 right-4 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        isActive
                          ? 'bg-emerald-400 text-slate-950'
                          : 'bg-amber-500 text-slate-950'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <QrPaymentModal />
      </div>
    );
  }

  // --- ADMIN MODE (STELLA'S DESKTOP/TABLET DASHBOARD) ---
  const adminNavItems: Array<{
    id: AdminTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: 'OVERVIEW',
      label: 'Overview',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'EVENT',
      label: 'Event',
      icon: <Calendar className="w-4 h-4" />,
    },
    {
      id: 'VENDORS',
      label: 'Vendors',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'INVENTORY',
      label: 'Inventory',
      icon: <Package className="w-4 h-4" />,
    },
    {
      id: 'IMPORTS',
      label: 'Imports',
      icon: <FileSpreadsheet className="w-4 h-4" />,
    },
    {
      id: 'ORDERS',
      label: 'Orders',
      icon: <Receipt className="w-4 h-4" />,
      badge: unsyncedOrderCount > 0 ? unsyncedOrderCount : undefined,
    },
    {
      id: 'REPORTS',
      label: 'Reports',
      icon: <BarChart3 className="w-4 h-4" />,
    },
    {
      id: 'SETTINGS',
      label: 'Settings',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col md:flex-row">
      {/* Sidebar Navigation (Section 3) */}
      <aside className="w-full md:w-60 bg-slate-900 text-white shrink-0 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 font-extrabold flex items-center justify-center">
                BC
              </div>
              <div>
                <div className="font-extrabold text-sm tracking-tight">
                  Booth Checkout
                </div>
                <div className="text-[11px] text-slate-400">
                  Stella • Owner Admin
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAppMode('OPERATOR')}
              className="md:hidden px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold cursor-pointer"
            >
              Register Mode
            </button>
          </div>

          {/* Navigation Links */}
          <nav
            aria-label="Admin Sidebar Navigation"
            className="flex md:flex-col gap-1 overflow-x-auto pb-1 md:pb-0"
          >
            {adminNavItems.map((item) => {
              const isActive = adminTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAdminTab(item.id)}
                  className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 shrink-0 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Switch to Operator Mode */}
        <div className="hidden md:block p-4 border-t border-slate-800 space-y-2.5">
          <div className="text-xs text-slate-400">
            Active Event:{' '}
            <strong className="text-white block truncate">
              {activeEvent?.name}
            </strong>
          </div>
          <button
            type="button"
            onClick={() => setAppMode('OPERATOR')}
            className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Store className="w-4 h-4" />
            <span>Switch to Register</span>
          </button>
        </div>
      </aside>

      {/* Main Admin Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Status Bar */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
            <span className="font-bold text-slate-900">
              {activeEvent?.name}
            </span>
            <span>•</span>
            {isOffline ? (
              <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md">
                <WifiOff className="w-3.5 h-3.5" />
                Offline Mode
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                <Wifi className="w-3.5 h-3.5" />
                Online
              </span>
            )}
            {unsyncedOrderCount > 0 && (
              <button
                type="button"
                onClick={() => triggerSync().catch(() => {})}
                className="px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-amber-900 font-bold hover:bg-amber-100 cursor-pointer"
              >
                {unsyncedOrderCount} pending sync — Sync Now
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSimulatedOffline(!simulatedOffline)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              {simulatedOffline ? 'Restore Network' : 'Simulate Offline'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {adminTab === 'OVERVIEW' && (
            <AdminOverviewView
              onOpenPaperModal={() => setShowPaperModal(true)}
            />
          )}
          {adminTab === 'EVENT' && <AdminEventView />}
          {adminTab === 'VENDORS' && <AdminVendorsView />}
          {adminTab === 'INVENTORY' && <AdminInventoryView />}
          {adminTab === 'IMPORTS' && <AdminImportsView />}
          {adminTab === 'ORDERS' && (
            <OrdersView
              isAdminView={true}
              onOpenPaperSaleModal={() => setShowPaperModal(true)}
            />
          )}
          {adminTab === 'REPORTS' && <AdminReportsView />}
          {adminTab === 'SETTINGS' && <AdminSettingsView />}
        </main>
      </div>

      {/* Add Paper Sale Modal for Stella Admin */}
      {showPaperModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-100 rounded-2xl max-w-2xl w-full p-4 sm:p-5 shadow-2xl border border-slate-300 space-y-3 my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">
                Add Paper Sale (Paper Trail Recovery)
              </h3>
              <button
                type="button"
                onClick={() => setShowPaperModal(false)}
                className="p-1.5 rounded-lg bg-white hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <EmergencyPaperModeView
              isEmbeddedModal={true}
              onClose={() => setShowPaperModal(false)}
            />
          </div>
        </div>
      )}

      <QrPaymentModal />
    </div>
  );
};

export function App() {
  return (
    <BoothProvider>
      <BoothShell />
    </BoothProvider>
  );
}

export default App;
