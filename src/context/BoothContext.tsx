import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  AdjustmentReason,
  AuditAction,
  AuditLogEntry,
  CartLine,
  EventReconciliationReport,
  ImportBatch,
  InventoryItem,
  ItemPhoto,
  MarketEvent,
  Order,
  OrderAdjustment,
  PaymentConfirmation,
  SyncQueueItem,
  SyncStateRecord,
  UserRole,
  Vendor,
  VendorPriceOption,
} from '../types/domain.ts';
import { boothDb } from '../offline/db.ts';
import {
  addDotItemToCart,
  addHangTagItemToCart,
  calculateCartTotals,
  createLocalOrderFromCart,
  generateUuid,
  removeCartLine,
  updateCartLinePrice,
  updateCartLineQuantity,
  validateVendorAttribution,
} from '../checkout/cartLogic.ts';
import {
  IdempotentServerLedger,
  prepareRegisterOfflineCatalog,
  synchronizePendingOrders,
} from '../sync/syncEngine.ts';
import { generateEventReconciliationReport } from '../reports/reportLogic.ts';
import { addCents, multiplyCents } from '../lib/money.ts';

export type AppMode = 'OPERATOR' | 'ADMIN';
export type OperatorTab = 'CHECKOUT' | 'ORDERS' | 'SYNC' | 'MORE';
export type AdminTab =
  | 'OVERVIEW'
  | 'EVENT'
  | 'VENDORS'
  | 'INVENTORY'
  | 'IMPORTS'
  | 'ORDERS'
  | 'REPORTS'
  | 'SETTINGS';

interface BoothContextValue {
  isLoading: boolean;
  role: UserRole;
  appMode: AppMode;
  operatorTab: OperatorTab;
  adminTab: AdminTab;
  setAppMode: (mode: AppMode) => void;
  setOperatorTab: (tab: OperatorTab) => void;
  setAdminTab: (tab: AdminTab) => void;
  switchRole: (newRole: UserRole) => void;

  // Connectivity & Sync
  isOffline: boolean;
  simulatedOffline: boolean;
  setSimulatedOffline: (offline: boolean) => void;
  isSyncing: boolean;
  lastSyncMessage: string | null;
  triggerSync: () => Promise<{
    syncedCount: number;
    alreadySyncedCount: number;
    messages: string[];
  }>;
  prepareRegister: () => Promise<SyncStateRecord>;

  // Domain Data
  events: MarketEvent[];
  activeEvent: MarketEvent | null;
  vendors: Vendor[];
  priceOptions: VendorPriceOption[];
  inventory: InventoryItem[];
  photos: ItemPhoto[];
  orders: Order[];
  adjustments: OrderAdjustment[];
  importBatches: ImportBatch[];
  syncQueue: SyncQueueItem[];
  syncState: SyncStateRecord | undefined;
  auditLogs: AuditLogEntry[];
  reconciliationReport: EventReconciliationReport | null;
  unsyncedOrderCount: number;

  // Cart & Operator Checkout
  cart: CartLine[];
  cartTotals: {
    itemCount: number;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
  };
  recentDotVendorIds: string[];
  canUndoLastItem: boolean;
  activeCheckoutOrder: Order | null;
  lastCompletedOrder: Order | null;
  addHangTagToCart: (
    item: InventoryItem,
    options?: { allowAdminOverride?: boolean }
  ) => void;
  addDotToCart: (vendor: Vendor, priceCents: number) => void;
  changeCartQuantity: (lineId: string, delta: number) => void;
  overrideCartPrice: (lineId: string, newPriceCents: number) => void;
  removeFromCart: (lineId: string) => void;
  undoLastCartItem: () => void;
  clearCart: () => void;
  beginOrderCheckout: () => Promise<Order>;
  confirmOrderPayment: (orderId: string) => Promise<Order>;
  cancelOrderCheckout: (orderId: string) => Promise<void>;
  dismissCompletedOrderScreen: () => void;

  // Paper Trail / Emergency Mode
  createPaperRecoveryOrder: (params: {
    paperOrderNumber: string;
    notes: string;
    lines: Array<{
      vendorId: string;
      itemCode: string;
      description: string;
      unitPriceCents: number;
      quantity: number;
      tagType: 'HANG_TAG' | 'DOT';
    }>;
  }) => Promise<Order>;

  // Admin Operations
  saveEventSettings: (updatedEvent: MarketEvent) => Promise<void>;
  createNewEvent: (newEvent: Omit<MarketEvent, 'id' | 'updatedAt'>) => Promise<MarketEvent>;
  setActiveEventById: (eventId: string) => Promise<void>;
  saveVendor: (
    vendor: Vendor,
    dotPriceCentsList: number[]
  ) => Promise<void>;
  saveInventoryItem: (item: InventoryItem) => Promise<void>;
  commitSpreadsheetImport: (params: {
    importBatch: ImportBatch;
    newVendors: Vendor[];
    inventoryItems: InventoryItem[];
  }) => Promise<void>;
  saveBulkPhotos: (
    updatedPhotos: ItemPhoto[],
    updatedInventory: InventoryItem[],
    summaryText: string
  ) => Promise<void>;
  reassignPhotoToItem: (photoId: string, itemId: string) => Promise<void>;
  adjustCompletedOrder: (params: {
    orderId: string;
    reason: AdjustmentReason;
    notes: string;
    deltaTotalCents: number;
    vendorId?: string;
  }) => Promise<void>;
  recordAuditEvent: (
    action: AuditAction,
    recordId: string,
    summary: string,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
  resetDemoDataset: () => Promise<void>;
}

const BoothContext = createContext<BoothContextValue | null>(null);

export const BoothProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<UserRole>('OPERATOR');
  const [appMode, setAppModeState] = useState<AppMode>('OPERATOR');
  const [operatorTab, setOperatorTab] = useState<OperatorTab>('CHECKOUT');
  const [adminTab, setAdminTab] = useState<AdminTab>('OVERVIEW');

  // Connectivity state
  const [browserOffline, setBrowserOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(false);
  const isOffline = browserOffline || simulatedOffline;

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

  // Domain state loaded from IndexedDB
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [priceOptions, setPriceOptions] = useState<VendorPriceOption[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [adjustments, setAdjustments] = useState<OrderAdjustment[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const [syncState, setSyncState] = useState<SyncStateRecord | undefined>(
    undefined
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Checkout & Cart state
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartHistory, setCartHistory] = useState<CartLine[][]>([]);
  const [recentDotVendorIds, setRecentDotVendorIds] = useState<string[]>([
    'vendor-anna',
    'vendor-bluebird',
    'vendor-cedar',
    'vendor-daisy',
  ]);
  const [activeCheckoutOrder, setActiveCheckoutOrder] = useState<Order | null>(
    null
  );
  const [lastCompletedOrder, setLastCompletedOrder] = useState<Order | null>(
    null
  );

  const serverLedgerRef = useRef<IdempotentServerLedger>(
    new IdempotentServerLedger()
  );
  const deviceId = 'reg-phone-01';

  const refreshFromDb = useCallback(async () => {
    const snap = await boothDb.loadFullSnapshot();
    setEvents(snap.events);
    setVendors(snap.vendors);
    setPriceOptions(snap.priceOptions);
    setInventory(snap.inventory);
    setPhotos(snap.photos);
    setOrders(snap.orders);
    setAdjustments(snap.adjustments);
    setImportBatches(snap.importBatches);
    setSyncQueue(snap.syncQueue);
    setSyncState(snap.syncState);
    setAuditLogs(snap.auditLogs);
    return snap;
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const snap = await refreshFromDb();
      serverLedgerRef.current = new IdempotentServerLedger(snap.orders);
      if (mounted) {
        setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshFromDb]);

  // Listen to browser online/offline events
  useEffect(() => {
    const handleOnline = () => setBrowserOffline(false);
    const handleOffline = () => setBrowserOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const activeEvent = useMemo(
    () => events.find((e) => e.isActive) ?? events[0] ?? null,
    [events]
  );

  const eventVendors = useMemo(
    () =>
      activeEvent
        ? vendors
            .filter((v) => v.eventId === activeEvent.id)
            .sort((a, b) => a.vendorLetter.localeCompare(b.vendorLetter))
        : [],
    [vendors, activeEvent]
  );

  const eventInventory = useMemo(
    () =>
      activeEvent
        ? inventory.filter((i) => i.eventId === activeEvent.id)
        : [],
    [inventory, activeEvent]
  );

  const eventOrders = useMemo(
    () =>
      activeEvent ? orders.filter((o) => o.eventId === activeEvent.id) : [],
    [orders, activeEvent]
  );

  const unsyncedOrderCount = useMemo(
    () =>
      eventOrders.filter(
        (o) =>
          (o.paymentStatus === 'COMPLETED' || o.paymentStatus === 'ADJUSTED') &&
          o.syncStatus !== 'SYNCED'
      ).length,
    [eventOrders]
  );

  const reconciliationReport = useMemo(() => {
    if (!activeEvent) return null;
    return generateEventReconciliationReport({
      event: activeEvent,
      vendors: eventVendors,
      inventory: eventInventory,
      orders: eventOrders,
      adjustments,
    });
  }, [activeEvent, eventVendors, eventInventory, eventOrders, adjustments]);

  const recordAuditEvent = useCallback(
    async (
      action: AuditAction,
      recordId: string,
      summary: string,
      metadata: Record<string, unknown> = {}
    ) => {
      const entry: AuditLogEntry = {
        id: `aud-${generateUuid().slice(0, 8)}`,
        timestamp: new Date().toISOString(),
        user: role === 'OWNER' ? 'Stella (Owner)' : 'Booth Operator',
        role,
        action,
        recordId,
        summary,
        metadata,
      };
      await boothDb.put('auditLogs', entry);
      setAuditLogs((prev) => [entry, ...prev]);
    },
    [role]
  );

  const setAppMode = useCallback((mode: AppMode) => {
    if (mode === 'ADMIN') {
      setRole('OWNER');
    }
    setAppModeState(mode);
  }, []);

  const switchRole = useCallback((newRole: UserRole) => {
    setRole(newRole);
    if (newRole === 'OPERATOR') {
      setAppModeState('OPERATOR');
    }
  }, []);

  // Trigger synchronization of pending transactions
  const triggerSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await synchronizePendingOrders({
        db: boothDb,
        serverLedger: serverLedgerRef.current,
        isOffline,
        useHttpApi: true,
      });
      await refreshFromDb();
      if (res.syncedCount > 0) {
        await recordAuditEvent(
          'ORDER_SYNCED',
          'batch-sync',
          `Synchronized ${res.syncedCount} pending order(s) with server.`,
          { syncedCount: res.syncedCount, alreadySyncedCount: res.alreadySyncedCount }
        );
      }
      const msg =
        res.syncedCount > 0
          ? `Synchronized ${res.syncedCount} sale(s) to server.`
          : res.messages[0] ?? 'All caught up.';
      setLastSyncMessage(msg);
      return res;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Sync failed.';
      setLastSyncMessage(errMsg);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, [isOffline, refreshFromDb, recordAuditEvent]);

  // Auto-sync when connectivity returns and there are unsynced orders
  const prevOfflineRef = useRef(isOffline);
  useEffect(() => {
    if (prevOfflineRef.current && !isOffline && unsyncedOrderCount > 0) {
      triggerSync().catch(() => {
        // Keep queued if background auto-sync fails
      });
    }
    prevOfflineRef.current = isOffline;
  }, [isOffline, unsyncedOrderCount, triggerSync]);

  const prepareRegister = useCallback(async () => {
    const updated = await prepareRegisterOfflineCatalog(boothDb);
    await recordAuditEvent(
      'REGISTER_PREPARED',
      updated.eventId,
      `Prepared Register for offline operation (${updated.vendorCount} vendors, ${updated.inventoryCount} items).`
    );
    await refreshFromDb();
    return updated;
  }, [recordAuditEvent, refreshFromDb]);

  // Cart & Checkout operations
  const cartTotals = useMemo(
    () => calculateCartTotals(cart, activeEvent ?? undefined),
    [cart, activeEvent]
  );

  const pushCartState = useCallback((nextCart: CartLine[]) => {
    setCart((prev) => {
      setCartHistory((hist) => [...hist.slice(-15), prev]);
      return nextCart;
    });
  }, []);

  const addHangTagToCart = useCallback(
    (item: InventoryItem, options?: { allowAdminOverride?: boolean }) => {
      const vendor = eventVendors.find((v) => v.id === item.vendorId);
      const { cart: nextCart } = addHangTagItemToCart(cart, item, vendor, {
        allowAdminOverride: options?.allowAdminOverride && role === 'OWNER',
      });
      pushCartState(nextCart);
    },
    [cart, eventVendors, role, pushCartState]
  );

  const addDotToCart = useCallback(
    (vendor: Vendor, priceCents: number) => {
      const matchingDotItem = eventInventory.find(
        (i) =>
          i.tagType === 'DOT' &&
          i.vendorId === vendor.id &&
          i.priceCents === priceCents
      );
      const { cart: nextCart } = addDotItemToCart(
        cart,
        vendor,
        priceCents,
        matchingDotItem
      );
      pushCartState(nextCart);
      setRecentDotVendorIds((prev) => [
        vendor.id,
        ...prev.filter((id) => id !== vendor.id),
      ]);
    },
    [cart, eventInventory, pushCartState]
  );

  const changeCartQuantity = useCallback(
    (lineId: string, delta: number) => {
      const nextCart = updateCartLineQuantity(cart, lineId, delta);
      pushCartState(nextCart);
    },
    [cart, pushCartState]
  );

  const overrideCartPrice = useCallback(
    (lineId: string, newPriceCents: number) => {
      const nextCart = updateCartLinePrice(cart, lineId, newPriceCents, role);
      pushCartState(nextCart);
    },
    [cart, role, pushCartState]
  );

  const removeFromCart = useCallback(
    (lineId: string) => {
      const nextCart = removeCartLine(cart, lineId);
      pushCartState(nextCart);
    },
    [cart, pushCartState]
  );

  const undoLastCartItem = useCallback(() => {
    setCartHistory((hist) => {
      if (hist.length === 0) return hist;
      const previousCart = hist[hist.length - 1];
      setCart(previousCart);
      return hist.slice(0, -1);
    });
  }, []);

  const clearCart = useCallback(() => {
    if (cart.length === 0) return;
    pushCartState([]);
  }, [cart.length, pushCartState]);

  /**
   * Creates the order locally FIRST before opening the QR Payment Screen.
   */
  const beginOrderCheckout = useCallback(async (): Promise<Order> => {
    if (!activeEvent) {
      throw new Error('There is no active market event.');
    }
    const seq = activeEvent.nextOrderSeq;
    const localOrder = createLocalOrderFromCart({
      cart,
      event: activeEvent,
      orderSequenceNumber: seq,
      deviceId,
      source: 'REGISTER',
    });

    // Save local order and increment event's nextOrderSeq in IndexedDB immediately
    const updatedEvent: MarketEvent = {
      ...activeEvent,
      nextOrderSeq: seq + 1,
      updatedAt: new Date().toISOString(),
    };

    await boothDb.put('events', updatedEvent);
    await boothDb.put('orders', localOrder);
    await boothDb.bulkPut('orderLines', localOrder.lines);

    await recordAuditEvent(
      'ORDER_CREATED',
      localOrder.id,
      `Created local Order ${localOrder.orderNumber} (${localOrder.lines.length} line(s), total $${(localOrder.totalCents / 100).toFixed(2)}).`,
      { orderNumber: localOrder.orderNumber, totalCents: localOrder.totalCents }
    );

    await refreshFromDb();
    setActiveCheckoutOrder(localOrder);
    return localOrder;
  }, [activeEvent, cart, recordAuditEvent, refreshFromDb]);

  /**
   * Completes payment for an active checkout order locally first, updates inventory,
   * queues synchronization, and clears the cart.
   */
  const confirmOrderPayment = useCallback(
    async (orderId: string): Promise<Order> => {
      const existingOrder = await boothDb.getById<Order>('orders', orderId);
      if (!existingOrder) {
        throw new Error(`Order ${orderId} not found in local storage.`);
      }
      // Prevent duplicate completion
      if (existingOrder.paymentStatus === 'COMPLETED') {
        return existingOrder;
      }

      const now = new Date().toISOString();
      const completedOrder: Order = {
        ...existingOrder,
        paymentStatus: 'COMPLETED',
        completedAt: now,
        syncStatus: 'PENDING_SYNC',
      };

      await boothDb.put('orders', completedOrder);

      // Record PaymentConfirmation
      const confirmation: PaymentConfirmation = {
        id: `pay-${completedOrder.id}`,
        orderId: completedOrder.id,
        orderNumber: completedOrder.orderNumber,
        confirmedAt: now,
        confirmedByRole: role,
        amountCents: completedOrder.totalCents,
        provider: completedOrder.paymentProvider,
        deviceId,
      };
      await boothDb.put('paymentConfirmations', confirmation);

      // Update local inventory status / quantities
      const currentInv = await boothDb.getAll<InventoryItem>('inventory');
      const invById = new Map(currentInv.map((i) => [i.id, i]));
      const updatedItems: InventoryItem[] = [];

      for (const line of completedOrder.lines) {
        const invItem = invById.get(line.itemId);
        if (invItem) {
          const nextQty = Math.max(0, invItem.quantity - line.quantity);
          const nextStatus =
            invItem.tagType === 'HANG_TAG' && nextQty === 0
              ? 'SOLD'
              : invItem.status;
          updatedItems.push({
            ...invItem,
            quantity: nextQty,
            status: nextStatus,
            soldInOrderNumber:
              nextStatus === 'SOLD'
                ? completedOrder.orderNumber
                : invItem.soldInOrderNumber,
            updatedAt: now,
          });
        }
      }
      if (updatedItems.length > 0) {
        await boothDb.bulkPut('inventory', updatedItems);
      }

      // Queue for server sync
      const queueItem: SyncQueueItem = {
        id: completedOrder.idempotencyKey,
        orderId: completedOrder.id,
        orderNumber: completedOrder.orderNumber,
        payload: completedOrder,
        attempts: 0,
        status: 'PENDING',
        createdAt: now,
      };
      await boothDb.put('syncQueue', queueItem);

      await recordAuditEvent(
        'ORDER_COMPLETED',
        completedOrder.id,
        `Payment received for Order ${completedOrder.orderNumber} ($${(completedOrder.totalCents / 100).toFixed(2)}).`,
        {
          orderNumber: completedOrder.orderNumber,
          totalCents: completedOrder.totalCents,
          offline: isOffline,
        }
      );

      // Clear active cart & history
      setCart([]);
      setCartHistory([]);
      setActiveCheckoutOrder(null);

      // If online, attempt immediate synchronization in the background
      let finalOrder = completedOrder;
      if (!isOffline) {
        try {
          await synchronizePendingOrders({
            db: boothDb,
            serverLedger: serverLedgerRef.current,
            isOffline: false,
            useHttpApi: true,
          });
          const refreshedOrder = await boothDb.getById<Order>(
            'orders',
            completedOrder.id
          );
          if (refreshedOrder) {
            finalOrder = refreshedOrder;
          }
          await recordAuditEvent(
            'ORDER_SYNCED',
            completedOrder.id,
            `Order ${completedOrder.orderNumber} synchronized with server.`
          );
        } catch {
          // Remains safely in PENDING_SYNC state
        }
      }

      await refreshFromDb();
      setLastCompletedOrder(finalOrder);
      return finalOrder;
    },
    [role, isOffline, recordAuditEvent, refreshFromDb]
  );

  const cancelOrderCheckout = useCallback(
    async (orderId: string) => {
      const existing = await boothDb.getById<Order>('orders', orderId);
      if (existing && existing.paymentStatus === 'PENDING') {
        await boothDb.delete('orders', orderId);
        for (const l of existing.lines) {
          await boothDb.delete('orderLines', l.id);
        }
      }
      setActiveCheckoutOrder(null);
      await refreshFromDb();
    },
    [refreshFromDb]
  );

  const dismissCompletedOrderScreen = useCallback(() => {
    setLastCompletedOrder(null);
  }, []);

  // Paper Trail / Emergency Mode Order Recovery
  const createPaperRecoveryOrder = useCallback(
    async (params: {
      paperOrderNumber: string;
      notes: string;
      lines: Array<{
        vendorId: string;
        itemCode: string;
        description: string;
        unitPriceCents: number;
        quantity: number;
        tagType: 'HANG_TAG' | 'DOT';
      }>;
    }): Promise<Order> => {
      if (!activeEvent) {
        throw new Error('No active market event.');
      }
      if (params.lines.length === 0) {
        throw new Error('Paper recovery order must include at least one sale line.');
      }

      const vendorMap = new Map(eventVendors.map((v) => [v.id, v]));
      const cartLines: CartLine[] = params.lines.map((l) => {
        const v = vendorMap.get(l.vendorId);
        if (!v) {
          throw new Error('Every paper recovery line must select a valid vendor.');
        }
        validateVendorAttribution(v.id, v.name, v.vendorLetter);
        return {
          lineId: generateUuid(),
          itemId: `paper-${l.itemCode.toLowerCase()}-${generateUuid().slice(0, 4)}`,
          itemCode: l.itemCode.trim().toUpperCase() || `PAPER-${v.vendorLetter}`,
          vendorId: v.id,
          vendorName: v.name,
          vendorLetter: v.vendorLetter,
          dotColor: v.dotColor,
          itemName: l.description.trim() || `${v.name} Paper Item`,
          description: l.description.trim() || `${v.name} Paper Item`,
          unitPriceCents: l.unitPriceCents,
          quantity: l.quantity,
          lineTotalCents: multiplyCents(l.unitPriceCents, l.quantity),
          tagType: l.tagType,
        };
      });

      const seq = activeEvent.nextOrderSeq;
      const customNum =
        params.paperOrderNumber.trim() ||
        `${activeEvent.orderPrefix}-P${seq}`;

      const paperOrder = createLocalOrderFromCart({
        cart: cartLines,
        event: activeEvent,
        orderSequenceNumber: seq,
        deviceId,
        source: 'PAPER_RECOVERY',
        customOrderNumber: customNum,
        notes: params.notes.trim() || 'Reconstructed from paper register sheet.',
      });

      const now = new Date().toISOString();
      const completedPaperOrder: Order = {
        ...paperOrder,
        paymentStatus: 'COMPLETED',
        completedAt: now,
        syncStatus: 'PENDING_SYNC',
      };

      await boothDb.put('events', {
        ...activeEvent,
        nextOrderSeq: seq + 1,
        updatedAt: now,
      });
      await boothDb.put('orders', completedPaperOrder);
      await boothDb.bulkPut('orderLines', completedPaperOrder.lines);
      await boothDb.put('syncQueue', {
        id: completedPaperOrder.idempotencyKey,
        orderId: completedPaperOrder.id,
        orderNumber: completedPaperOrder.orderNumber,
        payload: completedPaperOrder,
        attempts: 0,
        status: 'PENDING',
        createdAt: now,
      });

      await recordAuditEvent(
        'PAPER_ORDER_CREATED',
        completedPaperOrder.id,
        `Created Paper Recovery Order ${completedPaperOrder.orderNumber} ($${(completedPaperOrder.totalCents / 100).toFixed(2)}).`,
        {
          orderNumber: completedPaperOrder.orderNumber,
          source: 'PAPER_RECOVERY',
          totalCents: completedPaperOrder.totalCents,
        }
      );

      if (!isOffline) {
        try {
          await synchronizePendingOrders({
            db: boothDb,
            serverLedger: serverLedgerRef.current,
            isOffline: false,
            useHttpApi: true,
          });
        } catch {
          // Remains queued locally
        }
      }

      await refreshFromDb();
      return completedPaperOrder;
    },
    [activeEvent, eventVendors, isOffline, recordAuditEvent, refreshFromDb]
  );

  // Admin Methods
  const saveEventSettings = useCallback(
    async (updatedEvent: MarketEvent) => {
      const toSave: MarketEvent = {
        ...updatedEvent,
        updatedAt: new Date().toISOString(),
      };
      await boothDb.put('events', toSave);
      await recordAuditEvent(
        'EVENT_UPDATED',
        toSave.id,
        `Updated event settings for "${toSave.name}" (Provider: ${toSave.paymentProvider}, Prefix: ${toSave.orderPrefix}).`
      );
      await refreshFromDb();
    },
    [recordAuditEvent, refreshFromDb]
  );

  const createNewEvent = useCallback(
    async (
      newEventData: Omit<MarketEvent, 'id' | 'updatedAt'>
    ): Promise<MarketEvent> => {
      const now = new Date().toISOString();
      const allEvts = await boothDb.getAll<MarketEvent>('events');
      if (newEventData.isActive) {
        for (const ev of allEvts) {
          if (ev.isActive) {
            await boothDb.put('events', { ...ev, isActive: false });
          }
        }
      }
      const created: MarketEvent = {
        ...newEventData,
        id: `evt-${generateUuid().slice(0, 8)}`,
        updatedAt: now,
      };
      await boothDb.put('events', created);
      await recordAuditEvent(
        'EVENT_UPDATED',
        created.id,
        `Created new market event "${created.name}".`
      );
      await refreshFromDb();
      return created;
    },
    [recordAuditEvent, refreshFromDb]
  );

  const setActiveEventById = useCallback(
    async (eventId: string) => {
      const allEvts = await boothDb.getAll<MarketEvent>('events');
      for (const ev of allEvts) {
        await boothDb.put('events', {
          ...ev,
          isActive: ev.id === eventId,
          updatedAt: new Date().toISOString(),
        });
      }
      await refreshFromDb();
    },
    [refreshFromDb]
  );

  const saveVendor = useCallback(
    async (vendor: Vendor, dotPriceCentsList: number[]) => {
      // Enforce unique vendor letter within the event
      const duplicateLetter = vendors.find(
        (v) =>
          v.eventId === vendor.eventId &&
          v.id !== vendor.id &&
          v.vendorLetter.toUpperCase() === vendor.vendorLetter.toUpperCase()
      );
      if (duplicateLetter) {
        throw new Error(
          `Vendor letter "${vendor.vendorLetter.toUpperCase()}" is already assigned to ${duplicateLetter.name}. Each vendor in an event must have a unique letter.`
        );
      }

      const now = new Date().toISOString();
      const normalizedVendor: Vendor = {
        ...vendor,
        vendorLetter: vendor.vendorLetter.trim().toUpperCase(),
        updatedAt: now,
      };

      await boothDb.put('vendors', normalizedVendor);

      // Update price options for this vendor
      const existingOpts = await boothDb.getAll<VendorPriceOption>('priceOptions');
      for (const opt of existingOpts) {
        if (opt.vendorId === normalizedVendor.id) {
          await boothDb.delete('priceOptions', opt.id);
        }
      }

      const uniqueSortedCents = Array.from(new Set(dotPriceCentsList))
        .filter((c) => c > 0)
        .sort((a, b) => a - b);

      const newOpts: VendorPriceOption[] = uniqueSortedCents.map((c) => ({
        id: `vp-${normalizedVendor.id}-${c}`,
        eventId: normalizedVendor.eventId,
        vendorId: normalizedVendor.id,
        priceCents: c,
        label: `${normalizedVendor.dotColor} Dot`,
      }));
      await boothDb.bulkPut('priceOptions', newOpts);

      await recordAuditEvent(
        'VENDOR_UPDATED',
        normalizedVendor.id,
        `Saved Vendor ${normalizedVendor.vendorLetter} — ${normalizedVendor.name} (${normalizedVendor.dotColor} Dot).`
      );
      await refreshFromDb();
    },
    [vendors, recordAuditEvent, refreshFromDb]
  );

  const saveInventoryItem = useCallback(
    async (item: InventoryItem) => {
      const now = new Date().toISOString();
      await boothDb.put('inventory', {
        ...item,
        itemCode: item.itemCode.trim().toUpperCase(),
        updatedAt: now,
      });
      await refreshFromDb();
    },
    [refreshFromDb]
  );

  const commitSpreadsheetImport = useCallback(
    async (params: {
      importBatch: ImportBatch;
      newVendors: Vendor[];
      inventoryItems: InventoryItem[];
    }) => {
      if (params.newVendors.length > 0) {
        await boothDb.bulkPut('vendors', params.newVendors);
      }
      await boothDb.put('importBatches', params.importBatch);
      await boothDb.bulkPut('inventory', params.inventoryItems);

      await recordAuditEvent(
        'INVENTORY_IMPORTED',
        params.importBatch.id,
        `Imported "${params.importBatch.fileName}" (${params.inventoryItems.length} valid items, ${params.newVendors.length} new vendor(s)).`,
        {
          fileName: params.importBatch.fileName,
          validRowCount: params.importBatch.validRowCount,
        }
      );
      await refreshFromDb();
    },
    [recordAuditEvent, refreshFromDb]
  );

  const saveBulkPhotos = useCallback(
    async (
      updatedPhotos: ItemPhoto[],
      updatedInventory: InventoryItem[],
      summaryText: string
    ) => {
      await boothDb.bulkPut('photos', updatedPhotos);
      await boothDb.bulkPut('inventory', updatedInventory);
      await recordAuditEvent('PHOTO_MATCHED', 'bulk-photos', summaryText);
      await refreshFromDb();
    },
    [recordAuditEvent, refreshFromDb]
  );

  const reassignPhotoToItem = useCallback(
    async (photoId: string, itemId: string) => {
      const photo = await boothDb.getById<ItemPhoto>('photos', photoId);
      const item = await boothDb.getById<InventoryItem>('inventory', itemId);
      if (!photo || !item) return;

      const now = new Date().toISOString();
      const updatedPhoto: ItemPhoto = {
        ...photo,
        matchedItemId: item.id,
        matchedItemCode: item.itemCode,
        matchStatus: 'MATCHED',
      };
      const updatedItem: InventoryItem = {
        ...item,
        photoUrl: photo.dataUrl,
        updatedAt: now,
      };
      await boothDb.put('photos', updatedPhoto);
      await boothDb.put('inventory', updatedItem);
      await recordAuditEvent(
        'PHOTO_MATCHED',
        photo.id,
        `Manually assigned photo "${photo.fileName}" to item ${item.itemCode} (${item.itemName}).`
      );
      await refreshFromDb();
    },
    [recordAuditEvent, refreshFromDb]
  );

  const adjustCompletedOrder = useCallback(
    async (params: {
      orderId: string;
      reason: AdjustmentReason;
      notes: string;
      deltaTotalCents: number;
      vendorId?: string;
    }) => {
      if (role !== 'OWNER') {
        throw new Error('Only Stella (Owner) can adjust completed transactions.');
      }
      const existingOrder = await boothDb.getById<Order>(
        'orders',
        params.orderId
      );
      if (!existingOrder) {
        throw new Error('Order not found.');
      }

      const now = new Date().toISOString();
      const adjustment: OrderAdjustment = {
        id: `adj-${generateUuid().slice(0, 8)}`,
        orderId: existingOrder.id,
        orderNumber: existingOrder.orderNumber,
        eventId: existingOrder.eventId,
        reason: params.reason,
        notes: params.notes,
        originalValueJson: JSON.stringify({
          orderNumber: existingOrder.orderNumber,
          paymentStatus: existingOrder.paymentStatus,
          totalCents: existingOrder.totalCents,
        }),
        updatedValueJson: JSON.stringify({
          orderNumber: existingOrder.orderNumber,
          paymentStatus: 'ADJUSTED',
          netEffectiveTotalCents: addCents(
            existingOrder.totalCents,
            params.deltaTotalCents
          ),
          deltaTotalCents: params.deltaTotalCents,
          vendorId: params.vendorId,
        }),
        deltaTotalCents: params.deltaTotalCents,
        vendorId: params.vendorId,
        performedBy: 'Stella (Owner)',
        createdAt: now,
      };

      const updatedOrder: Order = {
        ...existingOrder,
        paymentStatus: 'ADJUSTED',
        notes: params.notes,
      };

      await boothDb.put('adjustments', adjustment);
      await boothDb.put('orders', updatedOrder);

      await recordAuditEvent(
        'ORDER_ADJUSTED',
        existingOrder.id,
        `Adjusted Order ${existingOrder.orderNumber} (${params.reason}: ${params.deltaTotalCents >= 0 ? '+' : ''}$${(params.deltaTotalCents / 100).toFixed(2)}) — ${params.notes}`,
        {
          reason: params.reason,
          deltaTotalCents: params.deltaTotalCents,
          vendorId: params.vendorId,
        }
      );

      await refreshFromDb();
    },
    [role, recordAuditEvent, refreshFromDb]
  );

  const resetDemoDataset = useCallback(async () => {
    setIsLoading(true);
    await boothDb.seedWithDefaultData();
    const snap = await refreshFromDb();
    serverLedgerRef.current = new IdempotentServerLedger(snap.orders);
    setCart([]);
    setCartHistory([]);
    setActiveCheckoutOrder(null);
    setLastCompletedOrder(null);
    setSimulatedOffline(false);
    setLastSyncMessage('Demo dataset reset to clean initial state (Next Order: OCT26-1048).');
    setIsLoading(false);
  }, [refreshFromDb]);

  const value: BoothContextValue = {
    isLoading,
    role,
    appMode,
    operatorTab,
    adminTab,
    setAppMode,
    setOperatorTab,
    setAdminTab,
    switchRole,
    isOffline,
    simulatedOffline,
    setSimulatedOffline,
    isSyncing,
    lastSyncMessage,
    triggerSync,
    prepareRegister,
    events,
    activeEvent,
    vendors: eventVendors,
    priceOptions,
    inventory: eventInventory,
    photos,
    orders: eventOrders,
    adjustments,
    importBatches,
    syncQueue,
    syncState,
    auditLogs,
    reconciliationReport,
    unsyncedOrderCount,
    cart,
    cartTotals,
    recentDotVendorIds,
    canUndoLastItem: cartHistory.length > 0,
    activeCheckoutOrder,
    lastCompletedOrder,
    addHangTagToCart,
    addDotToCart,
    changeCartQuantity,
    overrideCartPrice,
    removeFromCart,
    undoLastCartItem,
    clearCart,
    beginOrderCheckout,
    confirmOrderPayment,
    cancelOrderCheckout,
    dismissCompletedOrderScreen,
    createPaperRecoveryOrder,
    saveEventSettings,
    createNewEvent,
    setActiveEventById,
    saveVendor,
    saveInventoryItem,
    commitSpreadsheetImport,
    saveBulkPhotos,
    reassignPhotoToItem,
    adjustCompletedOrder,
    recordAuditEvent,
    resetDemoDataset,
  };

  return (
    <BoothContext.Provider value={value}>{children}</BoothContext.Provider>
  );
};

export function useBooth(): BoothContextValue {
  const ctx = useContext(BoothContext);
  if (!ctx) {
    throw new Error('useBooth must be used inside a BoothProvider');
  }
  return ctx;
}
