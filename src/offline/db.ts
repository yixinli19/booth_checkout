import type {
  AuditLogEntry,
  ImportBatch,
  InventoryItem,
  ItemPhoto,
  MarketEvent,
  Order,
  OrderAdjustment,
  OrderLine,
  PaymentConfirmation,
  SyncQueueItem,
  SyncStateRecord,
  Vendor,
  VendorPriceOption,
} from '../types/domain.ts';
import { buildSeedDataset, type SeedDataset } from './seedData.ts';

const DB_NAME = 'BoothCheckoutDB_v1';
const DB_VERSION = 1;

export type StoreName =
  | 'events'
  | 'vendors'
  | 'priceOptions'
  | 'inventory'
  | 'photos'
  | 'orders'
  | 'orderLines'
  | 'paymentConfirmations'
  | 'syncQueue'
  | 'syncState'
  | 'adjustments'
  | 'importBatches'
  | 'auditLogs';

const ALL_STORES: StoreName[] = [
  'events',
  'vendors',
  'priceOptions',
  'inventory',
  'photos',
  'orders',
  'orderLines',
  'paymentConfirmations',
  'syncQueue',
  'syncState',
  'adjustments',
  'importBatches',
  'auditLogs',
];

/**
 * Dexie-style IndexedDB wrapper with automatic fallback for headless Node.js unit tests.
 * Provides indexed stores for all Booth Checkout operational entities.
 */
export class BoothDatabase {
  private idb: IDBDatabase | null = null;
  private memoryFallback = new Map<StoreName, Map<string, unknown>>();
  private initPromise: Promise<void> | null = null;

  constructor() {
    for (const store of ALL_STORES) {
      this.memoryFallback.set(store, new Map());
    }
  }

  public async open(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this.internalOpen();
    return this.initPromise;
  }

  private async internalOpen(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      // Headless Node environment (e.g., automated tests)
      await this.ensureSeeded();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains('events')) {
          db.createObjectStore('events', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('vendors')) {
          const s = db.createObjectStore('vendors', { keyPath: 'id' });
          s.createIndex('by_event', 'eventId', { unique: false });
          s.createIndex('by_letter', 'vendorLetter', { unique: false });
        }
        if (!db.objectStoreNames.contains('priceOptions')) {
          const s = db.createObjectStore('priceOptions', { keyPath: 'id' });
          s.createIndex('by_vendor', 'vendorId', { unique: false });
        }
        if (!db.objectStoreNames.contains('inventory')) {
          const s = db.createObjectStore('inventory', { keyPath: 'id' });
          s.createIndex('by_code', 'itemCode', { unique: false });
          s.createIndex('by_vendor', 'vendorId', { unique: false });
          s.createIndex('by_event', 'eventId', { unique: false });
        }
        if (!db.objectStoreNames.contains('photos')) {
          const s = db.createObjectStore('photos', { keyPath: 'id' });
          s.createIndex('by_code', 'baseCode', { unique: false });
        }
        if (!db.objectStoreNames.contains('orders')) {
          const s = db.createObjectStore('orders', { keyPath: 'id' });
          s.createIndex('by_orderNumber', 'orderNumber', { unique: false });
          s.createIndex('by_idempotencyKey', 'idempotencyKey', { unique: true });
          s.createIndex('by_syncStatus', 'syncStatus', { unique: false });
        }
        if (!db.objectStoreNames.contains('orderLines')) {
          const s = db.createObjectStore('orderLines', { keyPath: 'id' });
          s.createIndex('by_order', 'orderId', { unique: false });
          s.createIndex('by_vendor', 'vendorId', { unique: false });
        }
        if (!db.objectStoreNames.contains('paymentConfirmations')) {
          db.createObjectStore('paymentConfirmations', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          const s = db.createObjectStore('syncQueue', { keyPath: 'id' });
          s.createIndex('by_status', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains('syncState')) {
          db.createObjectStore('syncState', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('adjustments')) {
          const s = db.createObjectStore('adjustments', { keyPath: 'id' });
          s.createIndex('by_order', 'orderId', { unique: false });
        }
        if (!db.objectStoreNames.contains('importBatches')) {
          db.createObjectStore('importBatches', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('auditLogs')) {
          db.createObjectStore('auditLogs', { keyPath: 'id' });
        }
      };

      req.onsuccess = () => {
        this.idb = req.result;
        resolve();
      };

      req.onerror = () => {
        reject(req.error);
      };
    });

    await this.ensureSeeded();
  }

  public async getAll<T>(storeName: StoreName): Promise<T[]> {
    if (!this.idb) {
      const map = this.memoryFallback.get(storeName)!;
      return Array.from(map.values()) as T[];
    }
    return new Promise<T[]>((resolve, reject) => {
      const tx = this.idb!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result ?? []) as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  public async getById<T>(storeName: StoreName, id: string): Promise<T | undefined> {
    if (!this.idb) {
      const map = this.memoryFallback.get(storeName)!;
      return map.get(id) as T | undefined;
    }
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = this.idb!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  public async put<T extends { id: string }>(storeName: StoreName, record: T): Promise<void> {
    if (!this.idb) {
      this.memoryFallback.get(storeName)!.set(record.id, structuredClone(record));
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const tx = this.idb!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async bulkPut<T extends { id: string }>(
    storeName: StoreName,
    records: T[]
  ): Promise<void> {
    if (records.length === 0) return;
    if (!this.idb) {
      const map = this.memoryFallback.get(storeName)!;
      for (const r of records) {
        map.set(r.id, structuredClone(r));
      }
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const tx = this.idb!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const r of records) {
        store.put(r);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async delete(storeName: StoreName, id: string): Promise<void> {
    if (!this.idb) {
      this.memoryFallback.get(storeName)!.delete(id);
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const tx = this.idb!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async clearStore(storeName: StoreName): Promise<void> {
    if (!this.idb) {
      this.memoryFallback.get(storeName)!.clear();
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const tx = this.idb!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async clearAll(): Promise<void> {
    for (const store of ALL_STORES) {
      await this.clearStore(store);
    }
  }

  private async ensureSeeded(): Promise<void> {
    const existingEvents = await this.getAll<MarketEvent>('events');
    if (existingEvents.length > 0) {
      return;
    }
    await this.seedWithDefaultData();
  }

  public async seedWithDefaultData(customSeed?: SeedDataset): Promise<void> {
    const seed = customSeed ?? buildSeedDataset();
    await this.clearAll();
    await this.put('events', seed.event);
    await this.bulkPut('vendors', seed.vendors);
    await this.bulkPut('priceOptions', seed.priceOptions);
    await this.bulkPut('inventory', seed.inventory);
    await this.bulkPut('photos', seed.photos);
    await this.bulkPut('importBatches', seed.importBatches);
    await this.bulkPut('orders', seed.orders);

    const allOrderLines: OrderLine[] = [];
    for (const o of seed.orders) {
      for (const l of o.lines) {
        allOrderLines.push(l);
      }
    }
    await this.bulkPut('orderLines', allOrderLines);
    await this.bulkPut('adjustments', seed.adjustments);
    await this.bulkPut('syncQueue', seed.syncQueue);
    await this.put('syncState', seed.syncState);
    await this.bulkPut('auditLogs', seed.auditLogs);
  }

  public async loadFullSnapshot(): Promise<{
    events: MarketEvent[];
    vendors: Vendor[];
    priceOptions: VendorPriceOption[];
    inventory: InventoryItem[];
    photos: ItemPhoto[];
    orders: Order[];
    paymentConfirmations: PaymentConfirmation[];
    adjustments: OrderAdjustment[];
    importBatches: ImportBatch[];
    syncQueue: SyncQueueItem[];
    syncState: SyncStateRecord | undefined;
    auditLogs: AuditLogEntry[];
  }> {
    await this.open();
    const [
      events,
      vendors,
      priceOptions,
      inventory,
      photos,
      orders,
      paymentConfirmations,
      adjustments,
      importBatches,
      syncQueue,
      syncStates,
      auditLogs,
    ] = await Promise.all([
      this.getAll<MarketEvent>('events'),
      this.getAll<Vendor>('vendors'),
      this.getAll<VendorPriceOption>('priceOptions'),
      this.getAll<InventoryItem>('inventory'),
      this.getAll<ItemPhoto>('photos'),
      this.getAll<Order>('orders'),
      this.getAll<PaymentConfirmation>('paymentConfirmations'),
      this.getAll<OrderAdjustment>('adjustments'),
      this.getAll<ImportBatch>('importBatches'),
      this.getAll<SyncQueueItem>('syncQueue'),
      this.getAll<SyncStateRecord>('syncState'),
      this.getAll<AuditLogEntry>('auditLogs'),
    ]);

    return {
      events,
      vendors,
      priceOptions,
      inventory,
      photos,
      orders: orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      paymentConfirmations,
      adjustments: adjustments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      importBatches: importBatches.sort((a, b) => b.importedAt.localeCompare(a.importedAt)),
      syncQueue,
      syncState: syncStates[0],
      auditLogs: auditLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    };
  }
}

export const boothDb = new BoothDatabase();
