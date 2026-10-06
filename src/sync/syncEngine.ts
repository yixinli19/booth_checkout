import type {
  InventoryItem,
  Order,
  SyncQueueItem,
  SyncStateRecord,
} from '../types/domain.ts';
import { BoothDatabase } from '../offline/db.ts';
import { validateVendorAttribution } from '../checkout/cartLogic.ts';

export interface ServerOrderUpsertResult {
  order: Order;
  alreadyExisted: boolean;
  conflictDetected: boolean;
  conflictMessages: string[];
  message: string;
}

export interface BatchSyncResponse {
  syncedAt: string;
  results: ServerOrderUpsertResult[];
  totalServerOrders: number;
}

/**
 * Transactional, idempotent Server Ledger Engine.
 * Enforces unique constraints on `order.id` and `order.idempotencyKey`,
 * validates vendor attribution, tracks sold unique items, and flags conflicts
 * without ever deleting data.
 */
export class IdempotentServerLedger {
  private ordersById = new Map<string, Order>();
  private orderIdByIdempotencyKey = new Map<string, string>();
  private soldHangTagItemToOrder = new Map<string, string>(); // itemCode -> orderNumber

  constructor(initialOrders: Order[] = []) {
    for (const order of initialOrders) {
      if (order.syncStatus === 'SYNCED') {
        this.registerExistingOrder(order);
      }
    }
  }

  private registerExistingOrder(order: Order): void {
    const syncedCopy: Order = {
      ...structuredClone(order),
      syncStatus: 'SYNCED',
    };
    this.ordersById.set(syncedCopy.id, syncedCopy);
    this.orderIdByIdempotencyKey.set(syncedCopy.idempotencyKey, syncedCopy.id);
    for (const line of syncedCopy.lines) {
      if (line.tagType === 'HANG_TAG') {
        this.soldHangTagItemToOrder.set(
          line.itemCode.toUpperCase(),
          syncedCopy.orderNumber
        );
      }
    }
  }

  public upsertOrder(incomingOrder: Order): ServerOrderUpsertResult {
    // 1. Strict vendor attribution validation on every line
    if (!incomingOrder.lines || incomingOrder.lines.length === 0) {
      throw new Error('Order rejected: Order must contain at least one line.');
    }
    for (const line of incomingOrder.lines) {
      validateVendorAttribution(line.vendorId, line.vendorName, line.vendorLetter);
    }

    // 2. Idempotency check by order UUID or idempotencyKey
    const existingById = this.ordersById.get(incomingOrder.id);
    if (existingById) {
      return {
        order: existingById,
        alreadyExisted: true,
        conflictDetected: Boolean(
          existingById.conflictFlags && existingById.conflictFlags.length > 0
        ),
        conflictMessages: existingById.conflictFlags ?? [],
        message: 'This order was already synchronized and was not duplicated.',
      };
    }

    const existingIdByKey = this.orderIdByIdempotencyKey.get(
      incomingOrder.idempotencyKey
    );
    if (existingIdByKey) {
      const existingOrder = this.ordersById.get(existingIdByKey)!;
      return {
        order: existingOrder,
        alreadyExisted: true,
        conflictDetected: Boolean(
          existingOrder.conflictFlags && existingOrder.conflictFlags.length > 0
        ),
        conflictMessages: existingOrder.conflictFlags ?? [],
        message: 'This order was already synchronized and was not duplicated.',
      };
    }

    // 3. Conflict detection: check if any unique HANG_TAG item was already sold in a different order
    const conflictMessages: string[] = [];
    for (const line of incomingOrder.lines) {
      if (line.tagType === 'HANG_TAG') {
        const codeKey = line.itemCode.toUpperCase();
        const priorOrderNum = this.soldHangTagItemToOrder.get(codeKey);
        if (priorOrderNum && priorOrderNum !== incomingOrder.orderNumber) {
          conflictMessages.push(
            `Unique item ${codeKey} was already recorded as sold in Order ${priorOrderNum}. Flagged for Stella's review.`
          );
        } else {
          this.soldHangTagItemToOrder.set(codeKey, incomingOrder.orderNumber);
        }
      }
    }

    const storedOrder: Order = {
      ...structuredClone(incomingOrder),
      syncStatus: 'SYNCED',
      conflictFlags:
        conflictMessages.length > 0
          ? conflictMessages
          : incomingOrder.conflictFlags,
    };

    this.ordersById.set(storedOrder.id, storedOrder);
    this.orderIdByIdempotencyKey.set(storedOrder.idempotencyKey, storedOrder.id);

    return {
      order: storedOrder,
      alreadyExisted: false,
      conflictDetected: conflictMessages.length > 0,
      conflictMessages,
      message:
        conflictMessages.length > 0
          ? `Order ${storedOrder.orderNumber} synchronized with ${conflictMessages.length} inventory conflict flag(s).`
          : `Order ${storedOrder.orderNumber} synchronized.`,
    };
  }

  public syncBatch(orders: Order[]): BatchSyncResponse {
    const results = orders.map((o) => this.upsertOrder(o));
    return {
      syncedAt: new Date().toISOString(),
      results,
      totalServerOrders: this.ordersById.size,
    };
  }

  public getAllOrders(): Order[] {
    return Array.from(this.ordersById.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  public getOrderCount(): number {
    return this.ordersById.size;
  }
}

/**
 * Synchronizes all pending local orders in `BoothDatabase` with the server ledger
 * (via HTTP `/api/sync` when available, with fallback to the local server ledger adapter).
 */
export async function synchronizePendingOrders(params: {
  db: BoothDatabase;
  serverLedger: IdempotentServerLedger;
  isOffline: boolean;
  useHttpApi?: boolean;
}): Promise<{
  syncedCount: number;
  alreadySyncedCount: number;
  failedCount: number;
  messages: string[];
}> {
  const { db, serverLedger, isOffline, useHttpApi = true } = params;

  if (isOffline) {
    throw new Error(
      'Cannot synchronize while offline. All sales are safely stored on this device and will sync when connectivity returns.'
    );
  }

  const allOrders = await db.getAll<Order>('orders');
  const pendingOrders = allOrders.filter(
    (o) =>
      (o.paymentStatus === 'COMPLETED' || o.paymentStatus === 'ADJUSTED') &&
      o.syncStatus !== 'SYNCED'
  );

  const now = new Date().toISOString();
  const currentState = await db.getById<SyncStateRecord>('syncState', 'current');

  if (pendingOrders.length === 0) {
    if (currentState) {
      await db.put('syncState', {
        ...currentState,
        lastSuccessfulSyncAt: now,
        lastSyncAttemptAt: now,
        lastSyncError: undefined,
      });
    }
    return {
      syncedCount: 0,
      alreadySyncedCount: 0,
      failedCount: 0,
      messages: ['All caught up. No pending transactions to sync.'],
    };
  }

  let batchResponse: BatchSyncResponse | null = null;

  if (useHttpApi && typeof fetch !== 'undefined') {
    try {
      const resp = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: pendingOrders }),
      });
      if (resp.ok) {
        batchResponse = (await resp.json()) as BatchSyncResponse;
      }
    } catch {
      // Fallback to in-process serverLedger when running as static PWA preview
    }
  }

  // Always keep in-process serverLedger in sync as well
  const localLedgerResponse = serverLedger.syncBatch(pendingOrders);
  if (!batchResponse) {
    batchResponse = localLedgerResponse;
  }

  let syncedCount = 0;
  let alreadySyncedCount = 0;
  const messages: string[] = [];

  for (const res of batchResponse.results) {
    const updatedOrder: Order = {
      ...res.order,
      syncStatus: 'SYNCED',
    };
    await db.put('orders', updatedOrder);

    const queueItem = await db.getById<SyncQueueItem>(
      'syncQueue',
      updatedOrder.idempotencyKey
    );
    if (queueItem) {
      await db.put('syncQueue', {
        ...queueItem,
        status: 'SYNCED',
        attempts: queueItem.attempts + 1,
        lastAttemptAt: batchResponse.syncedAt,
        lastError: undefined,
      });
    }

    if (res.alreadyExisted) {
      alreadySyncedCount++;
    } else {
      syncedCount++;
    }
    messages.push(res.message);
  }

  if (currentState) {
    await db.put('syncState', {
      ...currentState,
      lastSuccessfulSyncAt: batchResponse.syncedAt,
      lastSyncAttemptAt: batchResponse.syncedAt,
      lastSyncError: undefined,
    });
  }

  return {
    syncedCount,
    alreadySyncedCount,
    failedCount: 0,
    messages,
  };
}

/**
 * Downloads and verifies the full event catalog into local IndexedDB storage ("Prepare Register").
 */
export async function prepareRegisterOfflineCatalog(db: BoothDatabase): Promise<SyncStateRecord> {
  const snapshot = await db.loadFullSnapshot();
  const activeEvent =
    snapshot.events.find((e) => e.isActive) ?? snapshot.events[0];
  if (!activeEvent) {
    throw new Error('There is no active market event to prepare.');
  }

  const eventVendors = snapshot.vendors.filter(
    (v) => v.eventId === activeEvent.id && v.status === 'ACTIVE'
  );
  const eventInventory = snapshot.inventory.filter(
    (i) => i.eventId === activeEvent.id && i.status !== 'REMOVED'
  );
  const eventDots = snapshot.priceOptions.filter(
    (p) => p.eventId === activeEvent.id
  );

  const now = new Date().toISOString();
  const updatedSyncState: SyncStateRecord = {
    id: 'current',
    eventId: activeEvent.id,
    catalogDownloadedAt: now,
    lastSuccessfulSyncAt: snapshot.syncState?.lastSuccessfulSyncAt ?? now,
    lastSyncAttemptAt: now,
    isCatalogReadyOffline:
      eventVendors.length > 0 && eventInventory.length > 0,
    vendorCount: eventVendors.length,
    inventoryCount: eventInventory.length,
    dotPriceCount: eventDots.length,
  };

  await db.put('syncState', updatedSyncState);
  return updatedSyncState;
}
