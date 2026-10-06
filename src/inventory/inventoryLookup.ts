import type { InventoryItem, TagType, Vendor } from '../types/domain.ts';
import { formatCurrency } from '../lib/money.ts';

export interface CodeLookupResult {
  query: string;
  exactMatch: InventoryItem | null;
  alreadySoldWarning?: {
    item: InventoryItem;
    soldInOrderNumber: string;
    message: string;
  };
  suggestions: InventoryItem[];
  notFoundMessage?: string;
}

/**
 * Computes Levenshtein edit distance between two uppercase item codes.
 */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * Fast local lookup for Operator Hang-Tag / Item Code entry.
 * Never automatically substitutes an item on miss; suggests closest matching codes.
 * Checks if a unique item (initialQuantity === 1) was already sold and returns a warning.
 */
export function lookupItemByCode(
  rawCode: string,
  catalog: InventoryItem[],
  maxSuggestions = 4
): CodeLookupResult {
  const query = rawCode.trim().toUpperCase();
  if (!query) {
    return {
      query: '',
      exactMatch: null,
      suggestions: [],
    };
  }

  // Exact match (excluding REMOVED items unless no active match)
  const exactItem =
    catalog.find(
      (item) => item.itemCode.toUpperCase() === query && item.status !== 'REMOVED'
    ) ?? null;

  if (exactItem) {
    if (
      exactItem.tagType === 'HANG_TAG' &&
      (exactItem.status === 'SOLD' || exactItem.quantity <= 0)
    ) {
      const orderRef = exactItem.soldInOrderNumber || 'a previous order';
      return {
        query,
        exactMatch: exactItem,
        alreadySoldWarning: {
          item: exactItem,
          soldInOrderNumber: orderRef,
          message: `⚠ ${exactItem.itemCode} was already sold in Order ${orderRef}.`,
        },
        suggestions: [],
      };
    }

    return {
      query,
      exactMatch: exactItem,
      suggestions: [],
    };
  }

  // Find closest matching HANG_TAG item codes without auto-substituting
  const candidates = catalog
    .filter((item) => item.status === 'AVAILABLE' && item.tagType === 'HANG_TAG')
    .map((item) => {
      const code = item.itemCode.toUpperCase();
      const dist = editDistance(query, code);
      const sameVendorPrefix = code[0] === query[0] ? -0.5 : 0;
      const prefixMatch = code.startsWith(query) || query.startsWith(code) ? -1 : 0;
      // Numeric proximity when vendor prefix matches (e.g. A017 -> A016, A018, A011)
      let numDiffScore = 10;
      if (code[0] === query[0]) {
        const qNum = parseInt(query.slice(1), 10);
        const cNum = parseInt(code.slice(1), 10);
        if (Number.isFinite(qNum) && Number.isFinite(cNum)) {
          numDiffScore = Math.abs(qNum - cNum) * 0.05;
        }
      }
      return {
        item,
        score: dist + sameVendorPrefix + prefixMatch + numDiffScore,
        dist,
      };
    })
    .filter((entry) => entry.dist <= 3 || entry.item.itemCode.toUpperCase().startsWith(query[0]))
    .sort((a, b) => a.score - b.score)
    .slice(0, maxSuggestions)
    .map((entry) => entry.item);

  return {
    query,
    exactMatch: null,
    suggestions: candidates,
    notFoundMessage: `${query} could not be found in the downloaded catalog.`,
  };
}

export interface AdminInventoryFilter {
  searchQuery?: string;
  vendorId?: string;
  vendorLetter?: string;
  tagType?: TagType | 'ALL';
  status?: 'ALL' | 'AVAILABLE' | 'SOLD' | 'REMOVED';
}

export function filterAdminInventory(
  items: InventoryItem[],
  vendorsById: Map<string, Vendor>,
  filter: AdminInventoryFilter
): InventoryItem[] {
  const q = (filter.searchQuery ?? '').trim().toLowerCase();

  return items.filter((item) => {
    if (filter.vendorId && filter.vendorId !== 'ALL' && item.vendorId !== filter.vendorId) {
      return false;
    }
    if (
      filter.vendorLetter &&
      filter.vendorLetter !== 'ALL' &&
      item.vendorLetter.toUpperCase() !== filter.vendorLetter.toUpperCase()
    ) {
      return false;
    }
    if (filter.tagType && filter.tagType !== 'ALL' && item.tagType !== filter.tagType) {
      return false;
    }
    if (filter.status && filter.status !== 'ALL' && item.status !== filter.status) {
      return false;
    }

    if (!q) return true;

    const vendor = vendorsById.get(item.vendorId);
    const vendorName = vendor?.name.toLowerCase() ?? '';
    const formattedPrice = formatCurrency(item.priceCents).toLowerCase();
    const rawDollarPrice = (item.priceCents / 100).toString();

    return (
      item.itemCode.toLowerCase().includes(q) ||
      item.itemName.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.vendorLetter.toLowerCase() === q ||
      vendorName.includes(q) ||
      formattedPrice.includes(q) ||
      rawDollarPrice === q ||
      item.tagType.toLowerCase().includes(q)
    );
  });
}
