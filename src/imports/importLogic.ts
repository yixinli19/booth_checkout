import type {
  ImportBatch,
  InventoryItem,
  ItemPhoto,
  OriginalSheetStructure,
  TagType,
  Vendor,
} from '../types/domain.ts';
import { parsePriceToCents } from '../lib/money.ts';
import type { ParsedWorkbook } from '../lib/xlsx.ts';
import { generateUuid } from '../checkout/cartLogic.ts';

export interface ColumnMapping {
  itemCode?: string;
  itemName?: string;
  description?: string;
  price?: string;
  quantity?: string;
  vendorName?: string;
  vendorLetter?: string;
  tagType?: string;
}

export interface RowValidationIssue {
  severity: 'ERROR' | 'WARNING';
  field: string;
  message: string;
}

export interface ValidatedImportRow {
  rowKey: string;
  sheetName: string;
  rowIndex: number; // 1-based Excel row index
  originalCells: Record<string, string | number>;
  itemCode: string;
  itemName: string;
  description: string;
  rawPrice: string | number;
  priceCents: number | null;
  rawQuantity: string | number;
  quantity: number | null;
  vendorName: string;
  vendorLetter: string;
  tagType: TagType;
  issues: RowValidationIssue[];
  excluded?: boolean;
}

export interface ImportValidationSummary {
  rows: ValidatedImportRow[];
  validRowCount: number;
  warningCount: number;
  errorCount: number;
  canProceed: boolean;
}

/**
 * Automatically guesses column mappings from spreadsheet column headers.
 */
export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};

  const matchHeader = (patterns: RegExp[]): string | undefined => {
    for (const pat of patterns) {
      const found = headers.find((h) => pat.test(h.trim()));
      if (found) return found;
    }
    return undefined;
  };

  mapping.itemCode = matchHeader([
    /^item\s*(#|no\.?|num|number|code|id)$/i,
    /^(sku|code|tag|tag\s*#|id)$/i,
    /item\s*#/i,
    /code/i,
  ]);

  mapping.itemName = matchHeader([
    /^(item\s*name|title|product|item|description|name)$/i,
    /description/i,
    /name/i,
  ]);

  mapping.description = matchHeader([
    /^(notes|details|long\s*description|category|material)$/i,
  ]);

  mapping.price = matchHeader([
    /^(price|unit\s*price|cost|amount|retail|\$)$/i,
    /price/i,
  ]);

  mapping.quantity = matchHeader([
    /^(qty|quantity|count|stock|units|initial\s*qty)$/i,
    /qty|quantity/i,
  ]);

  mapping.vendorName = matchHeader([
    /^(vendor|vendor\s*name|maker|artist|business|seller)$/i,
    /vendor/i,
  ]);

  mapping.vendorLetter = matchHeader([
    /^(vendor\s*letter|letter|prefix|booth\s*code)$/i,
  ]);

  mapping.tagType = matchHeader([
    /^(tag\s*type|type|sticker|dot)$/i,
  ]);

  return mapping;
}

/**
 * Validates all rows from a parsed workbook using the user-configured column mapping
 * and optional default vendor assignment.
 */
export function validateWorkbookRows(params: {
  workbook: ParsedWorkbook;
  mapping: ColumnMapping;
  defaultVendor?: Vendor;
  existingVendors: Vendor[];
  existingInventory: InventoryItem[];
  rowOverrides?: Record<string, Partial<ValidatedImportRow>>;
}): ImportValidationSummary {
  const {
    workbook,
    mapping,
    defaultVendor,
    existingVendors,
    existingInventory,
    rowOverrides = {},
  } = params;

  const existingCodes = new Set(
    existingInventory
      .filter((i) => i.status !== 'REMOVED')
      .map((i) => i.itemCode.toUpperCase())
  );
  const seenCodesInImport = new Map<string, string>(); // code -> rowKey
  const vendorLetterToName = new Map<string, string>();

  for (const v of existingVendors) {
    vendorLetterToName.set(v.vendorLetter.toUpperCase(), v.name.toLowerCase());
  }

  const validatedRows: ValidatedImportRow[] = [];

  for (const sheet of workbook.sheets) {
    for (const rawRow of sheet.rows) {
      const rowKey = `${sheet.sheetName}:${rawRow.rowIndex}`;
      const override = rowOverrides[rowKey] ?? {};

      const getMappedVal = (colName?: string): string | number => {
        if (!colName) return '';
        return rawRow.valuesByHeader[colName] ?? '';
      };

      const rawCode =
        override.itemCode !== undefined
          ? override.itemCode
          : String(getMappedVal(mapping.itemCode)).trim();
      const itemCode = rawCode.toUpperCase();

      const rawName =
        override.itemName !== undefined
          ? override.itemName
          : String(getMappedVal(mapping.itemName)).trim();

      const rawDesc =
        override.description !== undefined
          ? override.description
          : String(getMappedVal(mapping.description) || rawName).trim();

      const rawPrice =
        override.rawPrice !== undefined
          ? override.rawPrice
          : getMappedVal(mapping.price);

      const rawQuantity =
        override.rawQuantity !== undefined
          ? override.rawQuantity
          : getMappedVal(mapping.quantity);

      const rawVendorName =
        override.vendorName !== undefined
          ? override.vendorName
          : String(getMappedVal(mapping.vendorName) || defaultVendor?.name || '').trim();

      const inferredLetter =
        itemCode.length > 0 && /^[A-Z]/.test(itemCode) ? itemCode[0] : '';
      const rawVendorLetter =
        override.vendorLetter !== undefined
          ? override.vendorLetter
          : String(
              getMappedVal(mapping.vendorLetter) ||
                defaultVendor?.vendorLetter ||
                inferredLetter
            )
              .trim()
              .toUpperCase();

      const rawTagType = String(getMappedVal(mapping.tagType)).trim().toUpperCase();
      const tagType: TagType =
        override.tagType ??
        (rawTagType === 'DOT' || itemCode.startsWith('DOT') ? 'DOT' : 'HANG_TAG');

      const issues: RowValidationIssue[] = [];

      // 1. Validate item code
      if (!itemCode) {
        issues.push({
          severity: 'ERROR',
          field: 'itemCode',
          message: 'Missing item code.',
        });
      } else {
        if (seenCodesInImport.has(itemCode)) {
          issues.push({
            severity: 'ERROR',
            field: 'itemCode',
            message: `Duplicate item code "${itemCode}" in spreadsheet (first seen at ${seenCodesInImport.get(itemCode)}).`,
          });
        } else {
          seenCodesInImport.set(itemCode, rowKey);
        }

        if (existingCodes.has(itemCode)) {
          issues.push({
            severity: 'WARNING',
            field: 'itemCode',
            message: `Item code "${itemCode}" already exists in event inventory and will update the existing record.`,
          });
        }
      }

      // 2. Validate item name / description
      if (!rawName) {
        issues.push({
          severity: 'ERROR',
          field: 'itemName',
          message: 'Missing item name / description.',
        });
      }

      // 3. Validate price
      const priceCents = parsePriceToCents(rawPrice);
      if (rawPrice === '' || rawPrice === null || rawPrice === undefined) {
        issues.push({
          severity: 'ERROR',
          field: 'price',
          message: 'Empty price.',
        });
      } else if (priceCents === null) {
        issues.push({
          severity: 'ERROR',
          field: 'price',
          message: `Invalid or unsupported price format: "${String(rawPrice)}".`,
        });
      } else if (priceCents > 500000) {
        issues.push({
          severity: 'WARNING',
          field: 'price',
          message: `Unusually high price ($${(priceCents / 100).toFixed(2)}) — please verify.`,
        });
      }

      // 4. Validate quantity
      let quantity: number | null = 1;
      if (rawQuantity !== '' && rawQuantity !== null && rawQuantity !== undefined) {
        const qStr = String(rawQuantity).trim();
        if (!/^\d+$/.test(qStr)) {
          quantity = null;
          issues.push({
            severity: 'ERROR',
            field: 'quantity',
            message: `Malformed quantity: "${String(rawQuantity)}". Must be a positive whole number.`,
          });
        } else {
          const parsedQ = parseInt(qStr, 10);
          if (parsedQ <= 0) {
            quantity = null;
            issues.push({
              severity: 'ERROR',
              field: 'quantity',
              message: 'Quantity must be at least 1.',
            });
          } else {
            quantity = parsedQ;
            if (tagType === 'HANG_TAG' && parsedQ > 1) {
              issues.push({
                severity: 'WARNING',
                field: 'quantity',
                message: `Hang tag item has quantity ${parsedQ} (> 1). Consider using DOT tag if small duplicated stock.`,
              });
            }
          }
        }
      }

      // 5. Validate vendor attribution & duplicate vendor letter conflict
      if (!rawVendorName && !defaultVendor) {
        issues.push({
          severity: 'ERROR',
          field: 'vendorName',
          message: 'Missing vendor name (and no default vendor selected).',
        });
      }

      if (!rawVendorLetter) {
        issues.push({
          severity: 'ERROR',
          field: 'vendorLetter',
          message: 'Missing vendor letter.',
        });
      } else if (rawVendorName) {
        const existingVendorNameForLetter = vendorLetterToName.get(rawVendorLetter);
        if (
          existingVendorNameForLetter &&
          existingVendorNameForLetter !== rawVendorName.toLowerCase()
        ) {
          issues.push({
            severity: 'ERROR',
            field: 'vendorLetter',
            message: `Duplicate vendor letter "${rawVendorLetter}" assigned to "${rawVendorName}" (already used by "${existingVendorNameForLetter}").`,
          });
        } else {
          vendorLetterToName.set(rawVendorLetter, rawVendorName.toLowerCase());
        }
      }

      validatedRows.push({
        rowKey,
        sheetName: sheet.sheetName,
        rowIndex: rawRow.rowIndex,
        originalCells: { ...rawRow.valuesByHeader },
        itemCode,
        itemName: rawName,
        description: rawDesc || rawName,
        rawPrice,
        priceCents,
        rawQuantity: rawQuantity === '' ? 1 : rawQuantity,
        quantity,
        vendorName: rawVendorName,
        vendorLetter: rawVendorLetter,
        tagType,
        issues,
        excluded: override.excluded ?? false,
      });
    }
  }

  const activeRows = validatedRows.filter((r) => !r.excluded);
  let validRowCount = 0;
  let warningCount = 0;
  let errorCount = 0;

  for (const row of activeRows) {
    const hasError = row.issues.some((i) => i.severity === 'ERROR');
    const rowWarnings = row.issues.filter((i) => i.severity === 'WARNING').length;
    const rowErrors = row.issues.filter((i) => i.severity === 'ERROR').length;
    warningCount += rowWarnings;
    errorCount += rowErrors;
    if (!hasError) {
      validRowCount++;
    }
  }

  return {
    rows: validatedRows,
    validRowCount,
    warningCount,
    errorCount,
    canProceed: activeRows.length > 0 && errorCount === 0,
  };
}

/**
 * Executes the validated import, preserving full workbook/sheet/row lineage
 * so end-of-event Vendor Reconciliation exports mirror the original workbook structure.
 */
export function buildImportArtifacts(params: {
  eventId: string;
  workbook: ParsedWorkbook;
  validationSummary: ImportValidationSummary;
  mapping: ColumnMapping;
  existingVendors: Vendor[];
  importedBy: string;
}): {
  importBatch: ImportBatch;
  newVendors: Vendor[];
  inventoryItems: InventoryItem[];
} {
  const { eventId, workbook, validationSummary, mapping, existingVendors, importedBy } =
    params;

  if (!validationSummary.canProceed) {
    throw new Error(
      `Cannot finalize import while ${validationSummary.errorCount} unresolved error(s) remain.`
    );
  }

  const batchId = `batch-${generateUuid().slice(0, 8)}`;
  const now = new Date().toISOString();

  const vendorsByLetter = new Map<string, Vendor>();
  for (const v of existingVendors) {
    vendorsByLetter.set(v.vendorLetter.toUpperCase(), v);
  }

  const availableColors = ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange', 'Teal', 'Pink'];
  const newVendors: Vendor[] = [];
  const inventoryItems: InventoryItem[] = [];
  const itemBySheetRowKey = new Map<string, InventoryItem>();

  for (const row of validationSummary.rows) {
    if (row.excluded) continue;
    if (row.issues.some((i) => i.severity === 'ERROR')) continue;
    if (row.priceCents === null || row.quantity === null) continue;

    let vendor = vendorsByLetter.get(row.vendorLetter.toUpperCase());
    if (!vendor) {
      const colorIdx = (existingVendors.length + newVendors.length) % availableColors.length;
      vendor = {
        id: `vendor-${row.vendorLetter.toLowerCase()}-${generateUuid().slice(0, 6)}`,
        eventId,
        vendorLetter: row.vendorLetter.toUpperCase(),
        name: row.vendorName || `Vendor ${row.vendorLetter.toUpperCase()}`,
        contactName: row.vendorName.split(' ')[0] || row.vendorLetter.toUpperCase(),
        email: `${row.vendorLetter.toLowerCase()}@vendors.market.local`,
        dotColor: availableColors[colorIdx],
        status: 'ACTIVE',
        sourceSpreadsheet: workbook.fileName,
        updatedAt: now,
      };
      vendorsByLetter.set(vendor.vendorLetter, vendor);
      newVendors.push(vendor);
    }

    const item: InventoryItem = {
      id: `item-${row.itemCode.toLowerCase()}-${batchId}`,
      eventId,
      vendorId: vendor.id,
      vendorLetter: vendor.vendorLetter,
      itemCode: row.itemCode,
      itemName: row.itemName,
      description: row.description || row.itemName,
      priceCents: row.priceCents,
      quantity: row.quantity,
      initialQuantity: row.quantity,
      tagType: row.tagType,
      status: 'AVAILABLE',
      originalWorkbookName: workbook.fileName,
      originalSheetName: row.sheetName,
      originalRowIndex: row.rowIndex,
      originalRowData: { ...row.originalCells },
      importBatchId: batchId,
      updatedAt: now,
    };

    inventoryItems.push(item);
    itemBySheetRowKey.set(row.rowKey, item);
  }

  // Build preserved sheet structures
  const sheets: OriginalSheetStructure[] = workbook.sheets.map((s) => ({
    sheetName: s.sheetName,
    headers: [...s.headers],
    rows: s.rows.map((r) => {
      const rowKey = `${s.sheetName}:${r.rowIndex}`;
      const linkedItem = itemBySheetRowKey.get(rowKey);
      return {
        rowIndex: r.rowIndex,
        cells: { ...r.valuesByHeader },
        linkedItemId: linkedItem?.id,
        linkedItemCode: linkedItem?.itemCode,
      };
    }),
  }));

  const primaryVendorId =
    inventoryItems.length > 0 ? inventoryItems[0].vendorId : undefined;

  const importBatch: ImportBatch = {
    id: batchId,
    eventId,
    vendorId: primaryVendorId,
    fileName: workbook.fileName,
    importedAt: now,
    importedBy,
    validRowCount: validationSummary.validRowCount,
    warningCount: validationSummary.warningCount,
    errorCount: 0,
    columnMapping: mapping as Record<string, string>,
    sheets,
  };

  return {
    importBatch,
    newVendors,
    inventoryItems,
  };
}

/**
 * Matches uploaded photos by filename without extension (e.g. "A001.jpg" -> Item "A001").
 */
export function matchUploadedPhotos(params: {
  eventId: string;
  uploadedFiles: Array<{ fileName: string; dataUrl: string }>;
  inventory: InventoryItem[];
  existingPhotos: ItemPhoto[];
}): {
  photos: ItemPhoto[];
  matchedCount: number;
  unmatchedCount: number;
  duplicateCount: number;
  updatedInventory: InventoryItem[];
} {
  const { eventId, uploadedFiles, inventory, existingPhotos } = params;
  const now = new Date().toISOString();

  const itemByCode = new Map<string, InventoryItem>();
  for (const item of inventory) {
    itemByCode.set(item.itemCode.toUpperCase(), item);
  }

  const alreadyMatchedCodes = new Set<string>(
    existingPhotos
      .filter((p) => p.matchStatus === 'MATCHED' && p.matchedItemCode)
      .map((p) => p.matchedItemCode!.toUpperCase())
  );

  const newPhotos: ItemPhoto[] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  let duplicateCount = 0;

  const photoUrlByItemId = new Map<string, string>();

  for (const file of uploadedFiles) {
    // Strip extension and optional whitespace
    const baseName = file.fileName.replace(/\.[^.]+$/, '').trim().toUpperCase();
    const matchedItem = itemByCode.get(baseName);

    let matchStatus: ItemPhoto['matchStatus'] = 'UNMATCHED';
    let matchedItemId: string | undefined;
    let matchedItemCode: string | undefined;

    if (matchedItem) {
      if (alreadyMatchedCodes.has(baseName)) {
        matchStatus = 'DUPLICATE';
        matchedItemId = matchedItem.id;
        matchedItemCode = matchedItem.itemCode;
        duplicateCount++;
      } else {
        matchStatus = 'MATCHED';
        matchedItemId = matchedItem.id;
        matchedItemCode = matchedItem.itemCode;
        alreadyMatchedCodes.add(baseName);
        photoUrlByItemId.set(matchedItem.id, file.dataUrl);
        matchedCount++;
      }
    } else {
      unmatchedCount++;
    }

    newPhotos.push({
      id: `photo-${generateUuid().slice(0, 8)}`,
      eventId,
      fileName: file.fileName,
      baseCode: baseName,
      dataUrl: file.dataUrl,
      matchedItemId,
      matchedItemCode,
      matchStatus,
      uploadedAt: now,
    });
  }

  const updatedInventory = inventory.map((item) => {
    const newUrl = photoUrlByItemId.get(item.id);
    return newUrl ? { ...item, photoUrl: newUrl, updatedAt: now } : item;
  });

  return {
    photos: [...existingPhotos, ...newPhotos],
    matchedCount,
    unmatchedCount,
    duplicateCount,
    updatedInventory,
  };
}
