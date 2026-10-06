export type UserRole = 'OWNER' | 'OPERATOR';

export type TagType = 'HANG_TAG' | 'DOT';

export type InventoryStatus = 'AVAILABLE' | 'SOLD' | 'REMOVED';

export type VendorStatus = 'ACTIVE' | 'INACTIVE';

export type PaymentProviderType = 'VENMO' | 'PAYPAL' | 'CASH_APP' | 'CUSTOM';

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'ADJUSTED';

export type SyncStatus = 'SYNCED' | 'PENDING_SYNC' | 'SYNC_FAILED';

export type OrderSource = 'REGISTER' | 'PAPER_RECOVERY';

export type AdjustmentReason =
  | 'WRONG_VENDOR'
  | 'WRONG_ITEM'
  | 'WRONG_AMOUNT'
  | 'DUPLICATE_TRANSACTION'
  | 'PAYMENT_NOT_RECEIVED'
  | 'PAPER_RECONCILIATION'
  | 'OTHER';

export type AuditAction =
  | 'INVENTORY_IMPORTED'
  | 'ORDER_CREATED'
  | 'ORDER_COMPLETED'
  | 'ORDER_SYNCED'
  | 'ORDER_ADJUSTED'
  | 'VENDOR_UPDATED'
  | 'REPORT_EXPORTED'
  | 'PAPER_ORDER_CREATED'
  | 'EVENT_UPDATED'
  | 'REGISTER_PREPARED'
  | 'PHOTO_MATCHED';

export interface DotColorConfig {
  id: string;
  name: string; // e.g., "Red", "Blue", "Yellow", "Green"
  hex: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  patternLabel: string; // Extra visual cue beyond color
}

export interface MarketEvent {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  location: string;
  currency: string; // 'USD'
  taxRateBps: number; // Basis points, e.g., 0 for no tax, 825 for 8.25%
  taxEnabled: boolean;
  commissionRateBps: number; // Optional owner booth commission (default 0)
  paymentProvider: PaymentProviderType;
  paymentIdentifier: string; // e.g. "@stella-market" or custom URL template
  customPaymentTemplate?: string; // e.g. "https://pay.example.com/{recipient}?amount={amount}&note={note}"
  orderPrefix: string; // e.g. "OCT26"
  nextOrderSeq: number; // e.g. 1048
  isActive: boolean;
  updatedAt: string;
}

export interface Vendor {
  id: string;
  eventId: string;
  vendorLetter: string; // e.g. "A", "B", "C", "D"
  name: string; // e.g. "Anna Ceramics"
  contactName: string; // e.g. "Anna"
  email: string;
  phone?: string;
  dotColor: string; // "Red" | "Blue" | "Yellow" | "Green" | "Purple" | "Orange" | "Teal" | "Pink"
  status: VendorStatus;
  sourceSpreadsheet?: string;
  notes?: string;
  updatedAt: string;
}

export interface VendorPriceOption {
  id: string;
  eventId: string;
  vendorId: string;
  priceCents: number;
  label?: string; // Optional category label
}

export interface InventoryItem {
  id: string;
  eventId: string;
  vendorId: string;
  vendorLetter: string;
  itemCode: string; // e.g. "A001", "A002", or "DOT-B-500"
  itemName: string;
  description: string;
  priceCents: number; // Always integer cents
  quantity: number; // Initial / current available quantity
  initialQuantity: number; // Original submitted quantity
  tagType: TagType;
  dotCategory?: string;
  photoUrl?: string;
  status: InventoryStatus;
  originalWorkbookName?: string;
  originalSheetName?: string;
  originalRowIndex?: number; // 1-based row index in original sheet
  originalRowData?: Record<string, string | number>; // Exact snapshot of original cells by column header
  importBatchId?: string;
  soldInOrderNumber?: string;
  updatedAt: string;
}

export interface ItemPhoto {
  id: string;
  eventId: string;
  fileName: string; // e.g. "A001.jpg"
  baseCode: string; // e.g. "A001"
  dataUrl: string;
  matchedItemId?: string;
  matchedItemCode?: string;
  matchStatus: 'MATCHED' | 'UNMATCHED' | 'DUPLICATE';
  uploadedAt: string;
}

export interface CartLine {
  lineId: string;
  itemId: string;
  itemCode: string;
  vendorId: string;
  vendorName: string;
  vendorLetter: string;
  dotColor?: string;
  itemName: string;
  description: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  tagType: TagType;
  photoUrl?: string;
  priceOverridden?: boolean;
}

export interface OrderLine {
  id: string;
  orderId: string;
  itemId: string;
  itemCode: string;
  vendorId: string;
  vendorName: string;
  vendorLetter: string;
  itemDescription: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  tagType: TagType;
}

export interface Order {
  id: string; // Immutable UUID
  orderNumber: string; // e.g. "OCT26-1048" or "MKT-1047"
  eventId: string;
  createdAt: string;
  completedAt?: string;
  paymentStatus: PaymentStatus;
  paymentProvider: PaymentProviderType;
  paymentUrl?: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  source: OrderSource;
  deviceId: string;
  syncStatus: SyncStatus;
  idempotencyKey: string;
  notes?: string;
  lines: OrderLine[];
  conflictFlags?: string[];
}

export interface PaymentConfirmation {
  id: string;
  orderId: string;
  orderNumber: string;
  confirmedAt: string;
  confirmedByRole: UserRole;
  amountCents: number;
  provider: PaymentProviderType;
  deviceId: string;
}

export interface OrderAdjustment {
  id: string;
  orderId: string;
  orderNumber: string;
  eventId: string;
  reason: AdjustmentReason;
  notes: string;
  originalValueJson: string;
  updatedValueJson: string;
  deltaTotalCents: number; // Negative for reductions/voids, positive for additions
  vendorId?: string; // If specific vendor affected
  performedBy: string;
  createdAt: string;
}

export interface OriginalSheetStructure {
  sheetName: string;
  headers: string[]; // Preserved in exact original column order
  rows: Array<{
    rowIndex: number; // 1-based row number in the sheet
    cells: Record<string, string | number>;
    linkedItemId?: string;
    linkedItemCode?: string;
  }>;
}

export interface ImportBatch {
  id: string;
  eventId: string;
  vendorId?: string;
  fileName: string;
  importedAt: string;
  importedBy: string;
  validRowCount: number;
  warningCount: number;
  errorCount: number;
  columnMapping: Record<string, string>;
  sheets: OriginalSheetStructure[];
}

export interface SyncQueueItem {
  id: string; // Same as order.idempotencyKey
  orderId: string;
  orderNumber: string;
  payload: Order;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  createdAt: string;
}

export interface SyncStateRecord {
  id: string; // 'current'
  eventId: string;
  catalogDownloadedAt?: string;
  lastSuccessfulSyncAt?: string;
  lastSyncAttemptAt?: string;
  lastSyncError?: string;
  isCatalogReadyOffline: boolean;
  vendorCount: number;
  inventoryCount: number;
  dotPriceCount: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  role: UserRole;
  action: AuditAction;
  recordId: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface VendorReconciliationSummary {
  vendorId: string;
  vendorLetter: string;
  vendorName: string;
  contactName: string;
  dotColor: string;
  totalItemsSubmitted: number;
  totalUnitsSubmitted: number;
  itemsSoldCount: number; // Units sold
  grossSalesCents: number;
  adjustmentsCents: number;
  commissionCents: number;
  finalPayoutCents: number;
  soldLines: OrderLine[];
}

export interface EventReconciliationReport {
  eventId: string;
  eventName: string;
  generatedAt: string;
  grossMerchandiseSalesCents: number; // Sum of completed order subtotals/totals before adjustments
  sumOfOrderLineTotalsCents: number;
  sumOfVendorGrossSalesCents: number;
  totalAdjustmentsCents: number;
  totalOwnerCommissionCents: number;
  netVendorPayoutTotalCents: number;
  completedOrdersCount: number;
  unsyncedOrdersCount: number;
  paperRecoveryOrdersCount: number;
  totalUnitsSold: number;
  isReconciled: boolean; // True iff sumOfOrderLineTotalsCents === sumOfVendorGrossSalesCents === grossMerchandiseSalesCents
  discrepancyCents: number;
  discrepancyDetails?: string;
  vendorSummaries: VendorReconciliationSummary[];
}
