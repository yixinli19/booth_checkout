import type {
  AuditLogEntry,
  DotColorConfig,
  ImportBatch,
  InventoryItem,
  ItemPhoto,
  MarketEvent,
  Order,
  OrderAdjustment,
  SyncQueueItem,
  SyncStateRecord,
  Vendor,
  VendorPriceOption,
} from '../types/domain.ts';
import { centsToFixedDecimal } from '../lib/money.ts';

export const DOT_COLOR_PALETTE: DotColorConfig[] = [
  {
    id: 'Red',
    name: 'Red',
    hex: '#dc2626',
    bgClass: 'bg-red-600',
    textClass: 'text-white',
    borderClass: 'border-red-700',
    patternLabel: '● Solid Circle',
  },
  {
    id: 'Blue',
    name: 'Blue',
    hex: '#2563eb',
    bgClass: 'bg-blue-600',
    textClass: 'text-white',
    borderClass: 'border-blue-700',
    patternLabel: '◆ Diamond Ring',
  },
  {
    id: 'Yellow',
    name: 'Yellow',
    hex: '#eab308',
    bgClass: 'bg-amber-400',
    textClass: 'text-slate-950',
    borderClass: 'border-amber-600',
    patternLabel: '▲ Triangle Mark',
  },
  {
    id: 'Green',
    name: 'Green',
    hex: '#16a34a',
    bgClass: 'bg-emerald-600',
    textClass: 'text-white',
    borderClass: 'border-emerald-700',
    patternLabel: '■ Square Badge',
  },
  {
    id: 'Purple',
    name: 'Purple',
    hex: '#7c3aed',
    bgClass: 'bg-violet-600',
    textClass: 'text-white',
    borderClass: 'border-violet-700',
    patternLabel: '★ Star Stamp',
  },
  {
    id: 'Orange',
    name: 'Orange',
    hex: '#ea580c',
    bgClass: 'bg-orange-600',
    textClass: 'text-white',
    borderClass: 'border-orange-700',
    patternLabel: '◈ Hex Dot',
  },
  {
    id: 'Teal',
    name: 'Teal',
    hex: '#0d9488',
    bgClass: 'bg-teal-600',
    textClass: 'text-white',
    borderClass: 'border-teal-700',
    patternLabel: '◎ Double Ring',
  },
  {
    id: 'Pink',
    name: 'Pink',
    hex: '#db2777',
    bgClass: 'bg-pink-600',
    textClass: 'text-white',
    borderClass: 'border-pink-700',
    patternLabel: '❖ Floral Dot',
  },
];

export function getDotColorConfig(colorName?: string): DotColorConfig {
  if (!colorName) return DOT_COLOR_PALETTE[0];
  return (
    DOT_COLOR_PALETTE.find(
      (c) => c.name.toLowerCase() === colorName.toLowerCase()
    ) ?? DOT_COLOR_PALETTE[0]
  );
}

function makeProductSvgDataUrl(code: string, title: string, accentHex: string): string {
  const safeCode = code.replace(/[<>&"']/g, '');
  const safeTitle = title.slice(0, 22).replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <rect width="160" height="160" rx="16" fill="#f8fafc"/>
    <rect x="8" y="8" width="144" height="144" rx="12" fill="${accentHex}15" stroke="${accentHex}40" stroke-width="2"/>
    <circle cx="80" cy="64" r="28" fill="${accentHex}25" stroke="${accentHex}" stroke-width="2.5"/>
    <text x="80" y="70" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="700" font-size="16" fill="${accentHex}">${safeCode}</text>
    <text x="80" y="122" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="600" font-size="11" fill="#334155">${safeTitle}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface SeedDataset {
  event: MarketEvent;
  vendors: Vendor[];
  priceOptions: VendorPriceOption[];
  inventory: InventoryItem[];
  photos: ItemPhoto[];
  importBatches: ImportBatch[];
  orders: Order[];
  adjustments: OrderAdjustment[];
  syncQueue: SyncQueueItem[];
  syncState: SyncStateRecord;
  auditLogs: AuditLogEntry[];
}

export function buildSeedDataset(): SeedDataset {
  const eventId = 'evt-oct-makers-2026';
  const baseTime = '2026-10-06T08:30:00.000Z';

  const event: MarketEvent = {
    id: eventId,
    name: 'October Makers Market',
    date: '2026-10-06',
    startTime: '09:00',
    endTime: '17:00',
    location: 'Old Mill Pavilion • Hall B',
    currency: 'USD',
    taxRateBps: 0,
    taxEnabled: false,
    commissionRateBps: 0,
    paymentProvider: 'VENMO',
    paymentIdentifier: 'Stella-MakersMarket',
    customPaymentTemplate:
      'https://venmo.com/{recipient}?txn=pay&amount={amount}&note={note}',
    orderPrefix: 'OCT26',
    nextOrderSeq: 1048,
    isActive: true,
    updatedAt: baseTime,
  };

  const vendors: Vendor[] = [
    {
      id: 'vendor-anna',
      eventId,
      vendorLetter: 'A',
      name: 'Anna Ceramics',
      contactName: 'Anna Lindqvist',
      email: 'anna@annaceramics.studio',
      phone: '555-0141',
      dotColor: 'Red',
      status: 'ACTIVE',
      sourceSpreadsheet: 'Anna_Ceramics_Oct2026.xlsx',
      notes: 'Stoneware & porcelain vessels. Bubble wrap under register table.',
      updatedAt: baseTime,
    },
    {
      id: 'vendor-bluebird',
      eventId,
      vendorLetter: 'B',
      name: 'Bluebird Vintage',
      contactName: 'Beth Holloway',
      email: 'beth@bluebirdvintage.co',
      phone: '555-0182',
      dotColor: 'Blue',
      status: 'ACTIVE',
      sourceSpreadsheet: 'Bluebird_Vintage_Inventory.xlsx',
      notes: 'Curated brass, textiles, and mid-century homeware.',
      updatedAt: baseTime,
    },
    {
      id: 'vendor-cedar',
      eventId,
      vendorLetter: 'C',
      name: 'Cedar Candle Co.',
      contactName: 'Charlie Vance',
      email: 'charlie@cedarcandle.com',
      phone: '555-0194',
      dotColor: 'Yellow',
      status: 'ACTIVE',
      sourceSpreadsheet: 'Cedar_Candle_Co_Sheet.xlsx',
      notes: 'Small-batch soy & beeswax candles.',
      updatedAt: baseTime,
    },
    {
      id: 'vendor-daisy',
      eventId,
      vendorLetter: 'D',
      name: 'Daisy Jewelry',
      contactName: 'David Park',
      email: 'david@daisyjewelry.design',
      phone: '555-0219',
      dotColor: 'Green',
      status: 'ACTIVE',
      sourceSpreadsheet: 'Daisy_Jewelry_Catalog.xlsx',
      notes: 'Sterling silver & botanical resin jewelry.',
      updatedAt: baseTime,
    },
  ];

  // Configured Dot Prices per Section 34
  // Anna: $5, $8, $12 | Bluebird: $3, $5, $10 | Cedar: $6, $12 | Daisy: $4, $8, $15
  const rawDots: Array<{ vendorId: string; cents: number[]; label: string }> = [
    { vendorId: 'vendor-anna', cents: [500, 800, 1200], label: 'Ceramic Magnet / Rest / Dish' },
    { vendorId: 'vendor-bluebird', cents: [300, 500, 1000], label: 'Postcard / Coaster / Kerchief' },
    { vendorId: 'vendor-cedar', cents: [600, 1200], label: 'Wax Melt / Travel Tin' },
    { vendorId: 'vendor-daisy', cents: [400, 800, 1500], label: 'Sticker / Ring / Studs' },
  ];

  const priceOptions: VendorPriceOption[] = [];
  for (const group of rawDots) {
    for (const c of group.cents) {
      priceOptions.push({
        id: `vp-${group.vendorId}-${c}`,
        eventId,
        vendorId: group.vendorId,
        priceCents: c,
        label: group.label,
      });
    }
  }

  // 34 Hang Tag Unique Items + 11 Dot Inventory Stock records
  const rawUniqueItems: Array<{
    code: string;
    vendorId: string;
    letter: string;
    name: string;
    desc: string;
    priceCents: number;
    status?: 'AVAILABLE' | 'SOLD';
    soldInOrder?: string;
    workbook: string;
    sheet: string;
    row: number;
  }> = [
    // Vendor A — Anna Ceramics (10 unique items; note A011, A016, A018 exist so searching A017 suggests them!)
    { code: 'A001', vendorId: 'vendor-anna', letter: 'A', name: 'Handmade Mug', desc: 'Speckled stoneware coffee mug 12oz', priceCents: 1800, status: 'SOLD', soldInOrder: 'OCT26-1037', workbook: 'Anna_Ceramics_Oct2026.xlsx', sheet: 'Ceramics Inventory', row: 2 },
    { code: 'A002', vendorId: 'vendor-anna', letter: 'A', name: 'Ceramic Vase', desc: 'Wheel-thrown celadon glaze bud vase', priceCents: 3200, status: 'AVAILABLE', workbook: 'Anna_Ceramics_Oct2026.xlsx', sheet: 'Ceramics Inventory', row: 3 },
    { code: 'A003', vendorId: 'vendor-anna', letter: 'A', name: 'Matcha Bowl', desc: 'Hand-carved chawan with pouring spout', priceCents: 3800, status: 'SOLD', soldInOrder: 'OCT26-1039', workbook: 'Anna_Ceramics_Oct2026.xlsx', sheet: 'Ceramics Inventory', row: 4 },
    { code: 'A004', vendorId: 'vendor-anna', letter: 'A', name: 'Pour-Over Coffee Dripper', desc: 'Ribbed matte white ceramic cone', priceCents: 2800, status: 'AVAILABLE', workbook: 'Anna_Ceramics_Oct2026.xlsx', sheet: 'Ceramics Inventory', row: 5 },
    { code: 'A005', vendorId: 'vendor-anna', letter: 'A', name: 'Stoneware Serving Platter', desc: 'Oval cobalt rim platter 14-inch', priceCents: 5400, status: 'SOLD', soldInOrder: 'OCT26-1038', workbook: 'Anna_Ceramics_Oct2026.xlsx', sheet: 'Ceramics Inventory', row: 6 },
    { code: 'A006', vendorId: 'vendor-anna', letter: 'A', name: 'Berry Colander Bowl', desc: 'Pierced stoneware berry strainer', priceCents: 3400, status: 'AVAILABLE', workbook: 'Anna_Ceramics_Oct2026.xlsx', sheet: 'Ceramics Inventory', row: 7 },
    { code: 'A008', vendorId: 'vendor-anna', letter: 'A', name: 'Ceramic Butter Keeper', desc: 'French water-seal butter crock', priceCents: 3000, status: 'SOLD', soldInOrder: 'OCT26-1044', workbook: 'Anna_Ceramics_Oct2026.xlsx', sheet: 'Ceramics Inventory', row: 8 },
    { code: 'A011', vendorId: 'vendor-anna', letter: 'A', name: 'Fluted Planter Pot', desc: '6-inch terracotta planter with saucer', priceCents: 2600, status: 'AVAILABLE', workbook: 'Anna_Ceramics_Oct2026.xlsx', sheet: 'Ceramics Inventory', row: 9 },
    { code: 'A016', vendorId: 'vendor-anna', letter: 'A', name: 'Glazed Ikebana Vase', desc: 'Low ceramic flower arranger with frog', priceCents: 2400, status: 'AVAILABLE', workbook: 'Anna_Ceramics_Oct2026.xlsx', sheet: 'Ceramics Inventory', row: 10 },
    { code: 'A018', vendorId: 'vendor-anna', letter: 'A', name: 'Salt Cellar with Lid', desc: 'Olive wood lid + stoneware pinch pot', priceCents: 2200, status: 'AVAILABLE', workbook: 'Anna_Ceramics_Oct2026.xlsx', sheet: 'Ceramics Inventory', row: 11 },

    // Vendor B — Bluebird Vintage (8 unique items)
    { code: 'B001', vendorId: 'vendor-bluebird', letter: 'B', name: 'Vintage Scarf', desc: '1970s pure silk botanical print scarf', priceCents: 1400, status: 'SOLD', soldInOrder: 'OCT26-1037', workbook: 'Bluebird_Vintage_Inventory.xlsx', sheet: 'Vintage Finds', row: 2 },
    { code: 'B002', vendorId: 'vendor-bluebird', letter: 'B', name: 'Brass Frame', desc: 'Beveled glass botanical pressed frame', priceCents: 2200, status: 'AVAILABLE', workbook: 'Bluebird_Vintage_Inventory.xlsx', sheet: 'Vintage Finds', row: 3 },
    { code: 'B003', vendorId: 'vendor-bluebird', letter: 'B', name: 'Mid-Century Taper Holders', desc: 'Pair of solid brass brutalist candlesticks', priceCents: 3600, status: 'SOLD', soldInOrder: 'OCT26-1040', workbook: 'Bluebird_Vintage_Inventory.xlsx', sheet: 'Vintage Finds', row: 4 },
    { code: 'B004', vendorId: 'vendor-bluebird', letter: 'B', name: 'Enamelware Coffee Pot', desc: 'Cobalt speckled vintage camp percolator', priceCents: 2900, status: 'SOLD', soldInOrder: 'OCT26-1042', workbook: 'Bluebird_Vintage_Inventory.xlsx', sheet: 'Vintage Finds', row: 5 },
    { code: 'B005', vendorId: 'vendor-bluebird', letter: 'B', name: 'Woven Market Basket', desc: 'Handwoven reed French market tote', priceCents: 2500, status: 'AVAILABLE', workbook: 'Bluebird_Vintage_Inventory.xlsx', sheet: 'Vintage Finds', row: 6 },
    { code: 'B006', vendorId: 'vendor-bluebird', letter: 'B', name: 'Amber Glass Apothecary Jar', desc: 'Embossed glass jar with ground stopper', priceCents: 1800, status: 'AVAILABLE', workbook: 'Bluebird_Vintage_Inventory.xlsx', sheet: 'Vintage Finds', row: 7 },
    { code: 'B014', vendorId: 'vendor-bluebird', letter: 'B', name: 'Copper Watering Can', desc: 'Long-spout indoor plant mister can', priceCents: 3400, status: 'AVAILABLE', workbook: 'Bluebird_Vintage_Inventory.xlsx', sheet: 'Vintage Finds', row: 8 },
    { code: 'B015', vendorId: 'vendor-bluebird', letter: 'B', name: 'Linen Table Runner', desc: 'Embroidered oatmeal flax table runner', priceCents: 2700, status: 'SOLD', soldInOrder: 'OCT26-1046', workbook: 'Bluebird_Vintage_Inventory.xlsx', sheet: 'Vintage Finds', row: 9 },

    // Vendor C — Cedar Candle Co. (8 unique items)
    { code: 'C001', vendorId: 'vendor-cedar', letter: 'C', name: 'Cedar Candle', desc: '8oz amber jar soy candle — Atlas Cedar & Smoke', priceCents: 1600, status: 'AVAILABLE', workbook: 'Cedar_Candle_Co_Sheet.xlsx', sheet: 'Autumn Line', row: 2 },
    { code: 'C002', vendorId: 'vendor-cedar', letter: 'C', name: 'Beeswax Pillar Pair', desc: 'Hand-dipped 100% pure local beeswax tapers', priceCents: 2000, status: 'SOLD', soldInOrder: 'OCT26-1039', workbook: 'Cedar_Candle_Co_Sheet.xlsx', sheet: 'Autumn Line', row: 3 },
    { code: 'C003', vendorId: 'vendor-cedar', letter: 'C', name: 'Fig & Vetiver Jar Candle', desc: '12oz double-wick ceramic tumbler candle', priceCents: 2800, status: 'SOLD', soldInOrder: 'OCT26-1041', workbook: 'Cedar_Candle_Co_Sheet.xlsx', sheet: 'Autumn Line', row: 4 },
    { code: 'C004', vendorId: 'vendor-cedar', letter: 'C', name: 'Fireside Birch Room Spray', desc: '4oz botanical linen & room mist', priceCents: 1500, status: 'AVAILABLE', workbook: 'Cedar_Candle_Co_Sheet.xlsx', sheet: 'Autumn Line', row: 5 },
    { code: 'C005', vendorId: 'vendor-cedar', letter: 'C', name: 'Hinoki Cypress Reed Diffuser', desc: 'Apothecary bottle with 8 rattan reeds', priceCents: 2400, status: 'SOLD', soldInOrder: 'OCT26-1045', workbook: 'Cedar_Candle_Co_Sheet.xlsx', sheet: 'Autumn Line', row: 6 },
    { code: 'C006', vendorId: 'vendor-cedar', letter: 'C', name: 'Cast Iron Wick Trimmer Set', desc: 'Matte black wick trimmer + snuffer tray', priceCents: 1900, status: 'AVAILABLE', workbook: 'Cedar_Candle_Co_Sheet.xlsx', sheet: 'Autumn Line', row: 7 },
    { code: 'C007', vendorId: 'vendor-cedar', letter: 'C', name: 'Spiced Chai Soy Candle', desc: '8oz cardamom, clove, and vanilla bean candle', priceCents: 1600, status: 'AVAILABLE', workbook: 'Cedar_Candle_Co_Sheet.xlsx', sheet: 'Autumn Line', row: 8 },
    { code: 'C008', vendorId: 'vendor-cedar', letter: 'C', name: 'Woodland Moss Gift Box', desc: 'Trio of 4oz seasonal votive candles', priceCents: 3200, status: 'SOLD', soldInOrder: 'OCT26-1047', workbook: 'Cedar_Candle_Co_Sheet.xlsx', sheet: 'Autumn Line', row: 9 },

    // Vendor D — Daisy Jewelry (8 unique items)
    { code: 'D001', vendorId: 'vendor-daisy', letter: 'D', name: 'Pressed Fern Pendant', desc: 'Real botanical fern frond in sterling bezel', priceCents: 3500, status: 'SOLD', soldInOrder: 'OCT26-1040', workbook: 'Daisy_Jewelry_Catalog.xlsx', sheet: 'Jewelry Sheet', row: 2 },
    { code: 'D002', vendorId: 'vendor-daisy', letter: 'D', name: 'Hammered Silver Cuff', desc: 'Adjustable recycled sterling cuff bracelet', priceCents: 4200, status: 'AVAILABLE', workbook: 'Daisy_Jewelry_Catalog.xlsx', sheet: 'Jewelry Sheet', row: 3 },
    { code: 'D003', vendorId: 'vendor-daisy', letter: 'D', name: 'Wildflower Drop Earrings', desc: 'Queen Anne lace resin & gold-fill hooks', priceCents: 2600, status: 'SOLD', soldInOrder: 'OCT26-1043', workbook: 'Daisy_Jewelry_Catalog.xlsx', sheet: 'Jewelry Sheet', row: 4 },
    { code: 'D004', vendorId: 'vendor-daisy', letter: 'D', name: 'Moss Agate Signet Ring', desc: 'Size 7 bezel-set green moss agate ring', priceCents: 4800, status: 'AVAILABLE', workbook: 'Daisy_Jewelry_Catalog.xlsx', sheet: 'Jewelry Sheet', row: 5 },
    { code: 'D005', vendorId: 'vendor-daisy', letter: 'D', name: 'Baroque Pearl Lariat', desc: 'Freshwater pearl on 18-inch sterling chain', priceCents: 3900, status: 'AVAILABLE', workbook: 'Daisy_Jewelry_Catalog.xlsx', sheet: 'Jewelry Sheet', row: 6 },
    { code: 'D006', vendorId: 'vendor-daisy', letter: 'D', name: 'Sunburst Brass Hair Pin', desc: 'Hand-sawn architectural brass chignon pin', priceCents: 2100, status: 'AVAILABLE', workbook: 'Daisy_Jewelry_Catalog.xlsx', sheet: 'Jewelry Sheet', row: 7 },
    { code: 'D007', vendorId: 'vendor-daisy', letter: 'D', name: 'Garnet Stacking Ring Trio', desc: 'Set of 3 faceted garnet & silver bands', priceCents: 3400, status: 'SOLD', soldInOrder: 'OCT26-1045', workbook: 'Daisy_Jewelry_Catalog.xlsx', sheet: 'Jewelry Sheet', row: 8 },
    { code: 'D008', vendorId: 'vendor-daisy', letter: 'D', name: ' Crescent Moon Hoops', desc: 'Lightweight hammered brass hoop earrings', priceCents: 2400, status: 'AVAILABLE', workbook: 'Daisy_Jewelry_Catalog.xlsx', sheet: 'Jewelry Sheet', row: 9 },
  ];

  const colorHexByLetter: Record<string, string> = {
    A: '#dc2626',
    B: '#2563eb',
    C: '#d97706',
    D: '#16a34a',
  };

  const inventory: InventoryItem[] = [];
  const photos: ItemPhoto[] = [];

  for (const u of rawUniqueItems) {
    const id = `item-${u.code.toLowerCase()}`;
    const photoUrl = makeProductSvgDataUrl(
      u.code,
      u.name,
      colorHexByLetter[u.letter] ?? '#475569'
    );
    const priceDollars = Number(centsToFixedDecimal(u.priceCents));

    inventory.push({
      id,
      eventId,
      vendorId: u.vendorId,
      vendorLetter: u.letter,
      itemCode: u.code,
      itemName: u.name,
      description: u.desc,
      priceCents: u.priceCents,
      quantity: u.status === 'SOLD' ? 0 : 1,
      initialQuantity: 1,
      tagType: 'HANG_TAG',
      photoUrl,
      status: u.status ?? 'AVAILABLE',
      soldInOrderNumber: u.soldInOrder,
      originalWorkbookName: u.workbook,
      originalSheetName: u.sheet,
      originalRowIndex: u.row,
      originalRowData: {
        'Item #': u.code,
        Description: u.name,
        'Material / Notes': u.desc,
        Price: priceDollars,
        Quantity: 1,
      },
      importBatchId: `batch-seed-${u.letter.toLowerCase()}`,
      updatedAt: baseTime,
    });

    photos.push({
      id: `photo-${u.code.toLowerCase()}`,
      eventId,
      fileName: `${u.code}.jpg`,
      baseCode: u.code,
      dataUrl: photoUrl,
      matchedItemId: id,
      matchedItemCode: u.code,
      matchStatus: 'MATCHED',
      uploadedAt: baseTime,
    });
  }

  // Also add DOT inventory records for each vendor's dot price points
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  for (const vp of priceOptions) {
    const v = vendorById.get(vp.vendorId)!;
    const code = `DOT-${v.vendorLetter}-${vp.priceCents}`;
    const priceFormatted = `$${(vp.priceCents / 100).toFixed(0)}`;
    const itemName = `${v.dotColor} Dot (${priceFormatted})`;

    inventory.push({
      id: `dot-${v.id}-${vp.priceCents}`,
      eventId,
      vendorId: v.id,
      vendorLetter: v.vendorLetter,
      itemCode: code,
      itemName,
      description: `${v.dotColor} Dot Sticker Item — ${v.name}`,
      priceCents: vp.priceCents,
      quantity: 25,
      initialQuantity: 30,
      tagType: 'DOT',
      dotCategory: vp.label,
      status: 'AVAILABLE',
      originalWorkbookName: v.sourceSpreadsheet,
      originalSheetName: 'Dot Sticker Stock',
      originalRowIndex: Math.floor(vp.priceCents / 100),
      originalRowData: {
        'Item #': code,
        Description: itemName,
        'Material / Notes': vp.label ?? 'Dot merchandise',
        Price: Number(centsToFixedDecimal(vp.priceCents)),
        Quantity: 30,
      },
      importBatchId: `batch-seed-${v.vendorLetter.toLowerCase()}`,
      updatedAt: baseTime,
    });
  }

  // Build seed ImportBatches so Vendor Excel Exports have full original workbook lineage
  const importBatches: ImportBatch[] = vendors.map((v) => {
    const vHangItems = inventory.filter(
      (i) => i.vendorId === v.id && i.tagType === 'HANG_TAG'
    );
    const vDotItems = inventory.filter(
      (i) => i.vendorId === v.id && i.tagType === 'DOT'
    );
    const mainSheetName = vHangItems[0]?.originalSheetName || `${v.vendorLetter} Inventory`;

    return {
      id: `batch-seed-${v.vendorLetter.toLowerCase()}`,
      eventId,
      vendorId: v.id,
      fileName: v.sourceSpreadsheet || `${v.vendorLetter}_Inventory.xlsx`,
      importedAt: baseTime,
      importedBy: 'Stella (Owner)',
      validRowCount: vHangItems.length + vDotItems.length,
      warningCount: 0,
      errorCount: 0,
      columnMapping: {
        itemCode: 'Item #',
        itemName: 'Description',
        description: 'Material / Notes',
        price: 'Price',
        quantity: 'Quantity',
      },
      sheets: [
        {
          sheetName: mainSheetName,
          headers: ['Item #', 'Description', 'Material / Notes', 'Price', 'Quantity'],
          rows: [...vHangItems, ...vDotItems].map((item, idx) => ({
            rowIndex: idx + 2,
            cells: item.originalRowData ?? {
              'Item #': item.itemCode,
              Description: item.itemName,
              'Material / Notes': item.description,
              Price: Number(centsToFixedDecimal(item.priceCents)),
              Quantity: item.initialQuantity,
            },
            linkedItemId: item.id,
            linkedItemCode: item.itemCode,
          })),
        },
      ],
    };
  });

  // 10 Historical Completed Orders (OCT26-1037 to OCT26-1046) + 1 Offline Unsynced Order (OCT26-1047)
  const orders: Order[] = [
    {
      id: 'ord-1037',
      orderNumber: 'OCT26-1037',
      eventId,
      createdAt: '2026-10-06T09:14:00.000Z',
      completedAt: '2026-10-06T09:14:22.000Z',
      paymentStatus: 'COMPLETED',
      paymentProvider: 'VENMO',
      subtotalCents: 3200,
      taxCents: 0,
      totalCents: 3200,
      source: 'REGISTER',
      deviceId: 'reg-phone-01',
      syncStatus: 'SYNCED',
      idempotencyKey: 'idem-ord-1037',
      lines: [
        {
          id: 'line-1037-1',
          orderId: 'ord-1037',
          itemId: 'item-a001',
          itemCode: 'A001',
          vendorId: 'vendor-anna',
          vendorName: 'Anna Ceramics',
          vendorLetter: 'A',
          itemDescription: 'Handmade Mug',
          unitPriceCents: 1800,
          quantity: 1,
          lineTotalCents: 1800,
          tagType: 'HANG_TAG',
        },
        {
          id: 'line-1037-2',
          orderId: 'ord-1037',
          itemId: 'item-b001',
          itemCode: 'B001',
          vendorId: 'vendor-bluebird',
          vendorName: 'Bluebird Vintage',
          vendorLetter: 'B',
          itemDescription: 'Vintage Scarf',
          unitPriceCents: 1400,
          quantity: 1,
          lineTotalCents: 1400,
          tagType: 'HANG_TAG',
        },
      ],
    },
    {
      id: 'ord-1038',
      orderNumber: 'OCT26-1038',
      eventId,
      createdAt: '2026-10-06T09:32:00.000Z',
      completedAt: '2026-10-06T09:32:18.000Z',
      paymentStatus: 'COMPLETED',
      paymentProvider: 'VENMO',
      subtotalCents: 6400,
      taxCents: 0,
      totalCents: 6400,
      source: 'REGISTER',
      deviceId: 'reg-phone-01',
      syncStatus: 'SYNCED',
      idempotencyKey: 'idem-ord-1038',
      lines: [
        {
          id: 'line-1038-1',
          orderId: 'ord-1038',
          itemId: 'item-a005',
          itemCode: 'A005',
          vendorId: 'vendor-anna',
          vendorName: 'Anna Ceramics',
          vendorLetter: 'A',
          itemDescription: 'Stoneware Serving Platter',
          unitPriceCents: 5400,
          quantity: 1,
          lineTotalCents: 5400,
          tagType: 'HANG_TAG',
        },
        {
          id: 'line-1038-2',
          orderId: 'ord-1038',
          itemId: 'dot-vendor-bluebird-500',
          itemCode: 'DOT-B-500',
          vendorId: 'vendor-bluebird',
          vendorName: 'Bluebird Vintage',
          vendorLetter: 'B',
          itemDescription: 'Blue Dot Item',
          unitPriceCents: 500,
          quantity: 2,
          lineTotalCents: 1000,
          tagType: 'DOT',
        },
      ],
    },
    {
      id: 'ord-1039',
      orderNumber: 'OCT26-1039',
      eventId,
      createdAt: '2026-10-06T10:05:00.000Z',
      completedAt: '2026-10-06T10:05:30.000Z',
      paymentStatus: 'COMPLETED',
      paymentProvider: 'VENMO',
      subtotalCents: 5800,
      taxCents: 0,
      totalCents: 5800,
      source: 'REGISTER',
      deviceId: 'reg-phone-01',
      syncStatus: 'SYNCED',
      idempotencyKey: 'idem-ord-1039',
      lines: [
        {
          id: 'line-1039-1',
          orderId: 'ord-1039',
          itemId: 'item-a003',
          itemCode: 'A003',
          vendorId: 'vendor-anna',
          vendorName: 'Anna Ceramics',
          vendorLetter: 'A',
          itemDescription: 'Matcha Bowl',
          unitPriceCents: 3800,
          quantity: 1,
          lineTotalCents: 3800,
          tagType: 'HANG_TAG',
        },
        {
          id: 'line-1039-2',
          orderId: 'ord-1039',
          itemId: 'item-c002',
          itemCode: 'C002',
          vendorId: 'vendor-cedar',
          vendorName: 'Cedar Candle Co.',
          vendorLetter: 'C',
          itemDescription: 'Beeswax Pillar Pair',
          unitPriceCents: 2000,
          quantity: 1,
          lineTotalCents: 2000,
          tagType: 'HANG_TAG',
        },
      ],
    },
    {
      id: 'ord-1040',
      orderNumber: 'OCT26-1040',
      eventId,
      createdAt: '2026-10-06T10:41:00.000Z',
      completedAt: '2026-10-06T10:41:29.000Z',
      paymentStatus: 'COMPLETED',
      paymentProvider: 'VENMO',
      subtotalCents: 7100,
      taxCents: 0,
      totalCents: 7100,
      source: 'REGISTER',
      deviceId: 'reg-phone-01',
      syncStatus: 'SYNCED',
      idempotencyKey: 'idem-ord-1040',
      lines: [
        {
          id: 'line-1040-1',
          orderId: 'ord-1040',
          itemId: 'item-b003',
          itemCode: 'B003',
          vendorId: 'vendor-bluebird',
          vendorName: 'Bluebird Vintage',
          vendorLetter: 'B',
          itemDescription: 'Mid-Century Taper Holders',
          unitPriceCents: 3600,
          quantity: 1,
          lineTotalCents: 3600,
          tagType: 'HANG_TAG',
        },
        {
          id: 'line-1040-2',
          orderId: 'ord-1040',
          itemId: 'item-d001',
          itemCode: 'D001',
          vendorId: 'vendor-daisy',
          vendorName: 'Daisy Jewelry',
          vendorLetter: 'D',
          itemDescription: 'Pressed Fern Pendant',
          unitPriceCents: 3500,
          quantity: 1,
          lineTotalCents: 3500,
          tagType: 'HANG_TAG',
        },
      ],
    },
    {
      id: 'ord-1041',
      orderNumber: 'OCT26-1041',
      eventId,
      createdAt: '2026-10-06T11:15:00.000Z',
      completedAt: '2026-10-06T11:15:40.000Z',
      paymentStatus: 'ADJUSTED',
      paymentProvider: 'VENMO',
      subtotalCents: 4000,
      taxCents: 0,
      totalCents: 4000,
      source: 'REGISTER',
      deviceId: 'reg-phone-01',
      syncStatus: 'SYNCED',
      idempotencyKey: 'idem-ord-1041',
      notes: 'Adjusted: Customer swapped $12 candle tin for $6 wax melt (-$6.00 adjustment recorded).',
      lines: [
        {
          id: 'line-1041-1',
          orderId: 'ord-1041',
          itemId: 'item-c003',
          itemCode: 'C003',
          vendorId: 'vendor-cedar',
          vendorName: 'Cedar Candle Co.',
          vendorLetter: 'C',
          itemDescription: 'Fig & Vetiver Jar Candle',
          unitPriceCents: 2800,
          quantity: 1,
          lineTotalCents: 2800,
          tagType: 'HANG_TAG',
        },
        {
          id: 'line-1041-2',
          orderId: 'ord-1041',
          itemId: 'dot-vendor-cedar-1200',
          itemCode: 'DOT-C-1200',
          vendorId: 'vendor-cedar',
          vendorName: 'Cedar Candle Co.',
          vendorLetter: 'C',
          itemDescription: 'Yellow Dot Item',
          unitPriceCents: 1200,
          quantity: 1,
          lineTotalCents: 1200,
          tagType: 'DOT',
        },
      ],
    },
    {
      id: 'ord-1042',
      orderNumber: 'OCT26-1042',
      eventId,
      createdAt: '2026-10-06T11:50:00.000Z',
      completedAt: '2026-10-06T11:50:19.000Z',
      paymentStatus: 'COMPLETED',
      paymentProvider: 'VENMO',
      subtotalCents: 3700,
      taxCents: 0,
      totalCents: 3700,
      source: 'REGISTER',
      deviceId: 'reg-phone-01',
      syncStatus: 'SYNCED',
      idempotencyKey: 'idem-ord-1042',
      lines: [
        {
          id: 'line-1042-1',
          orderId: 'ord-1042',
          itemId: 'item-b004',
          itemCode: 'B004',
          vendorId: 'vendor-bluebird',
          vendorName: 'Bluebird Vintage',
          vendorLetter: 'B',
          itemDescription: 'Enamelware Coffee Pot',
          unitPriceCents: 2900,
          quantity: 1,
          lineTotalCents: 2900,
          tagType: 'HANG_TAG',
        },
        {
          id: 'line-1042-2',
          orderId: 'ord-1042',
          itemId: 'dot-vendor-daisy-800',
          itemCode: 'DOT-D-800',
          vendorId: 'vendor-daisy',
          vendorName: 'Daisy Jewelry',
          vendorLetter: 'D',
          itemDescription: 'Green Dot Item',
          unitPriceCents: 800,
          quantity: 1,
          lineTotalCents: 800,
          tagType: 'DOT',
        },
      ],
    },
    {
      id: 'ord-1043',
      orderNumber: 'OCT26-1043',
      eventId,
      createdAt: '2026-10-06T12:22:00.000Z',
      completedAt: '2026-10-06T12:22:31.000Z',
      paymentStatus: 'COMPLETED',
      paymentProvider: 'VENMO',
      subtotalCents: 3600,
      taxCents: 0,
      totalCents: 3600,
      source: 'REGISTER',
      deviceId: 'reg-phone-01',
      syncStatus: 'SYNCED',
      idempotencyKey: 'idem-ord-1043',
      lines: [
        {
          id: 'line-1043-1',
          orderId: 'ord-1043',
          itemId: 'item-d003',
          itemCode: 'D003',
          vendorId: 'vendor-daisy',
          vendorName: 'Daisy Jewelry',
          vendorLetter: 'D',
          itemDescription: 'Wildflower Drop Earrings',
          unitPriceCents: 2600,
          quantity: 1,
          lineTotalCents: 2600,
          tagType: 'HANG_TAG',
        },
        {
          id: 'line-1043-2',
          orderId: 'ord-1043',
          itemId: 'dot-vendor-anna-500',
          itemCode: 'DOT-A-500',
          vendorId: 'vendor-anna',
          vendorName: 'Anna Ceramics',
          vendorLetter: 'A',
          itemDescription: 'Red Dot Item',
          unitPriceCents: 500,
          quantity: 2,
          lineTotalCents: 1000,
          tagType: 'DOT',
        },
      ],
    },
    {
      id: 'ord-1044',
      orderNumber: 'OCT26-1044',
      eventId,
      createdAt: '2026-10-06T13:10:00.000Z',
      completedAt: '2026-10-06T13:10:25.000Z',
      paymentStatus: 'COMPLETED',
      paymentProvider: 'VENMO',
      subtotalCents: 4500,
      taxCents: 0,
      totalCents: 4500,
      source: 'REGISTER',
      deviceId: 'reg-phone-01',
      syncStatus: 'SYNCED',
      idempotencyKey: 'idem-ord-1044',
      lines: [
        {
          id: 'line-1044-1',
          orderId: 'ord-1044',
          itemId: 'item-a008',
          itemCode: 'A008',
          vendorId: 'vendor-anna',
          vendorName: 'Anna Ceramics',
          vendorLetter: 'A',
          itemDescription: 'Ceramic Butter Keeper',
          unitPriceCents: 3000,
          quantity: 1,
          lineTotalCents: 3000,
          tagType: 'HANG_TAG',
        },
        {
          id: 'line-1044-2',
          orderId: 'ord-1044',
          itemId: 'dot-vendor-daisy-1500',
          itemCode: 'DOT-D-1500',
          vendorId: 'vendor-daisy',
          vendorName: 'Daisy Jewelry',
          vendorLetter: 'D',
          itemDescription: 'Green Dot Item',
          unitPriceCents: 1500,
          quantity: 1,
          lineTotalCents: 1500,
          tagType: 'DOT',
        },
      ],
    },
    {
      id: 'ord-1045',
      orderNumber: 'OCT26-1045',
      eventId,
      createdAt: '2026-10-06T13:48:00.000Z',
      completedAt: '2026-10-06T13:48:15.000Z',
      paymentStatus: 'COMPLETED',
      paymentProvider: 'VENMO',
      subtotalCents: 5800,
      taxCents: 0,
      totalCents: 5800,
      source: 'REGISTER',
      deviceId: 'reg-phone-01',
      syncStatus: 'SYNCED',
      idempotencyKey: 'idem-ord-1045',
      lines: [
        {
          id: 'line-1045-1',
          orderId: 'ord-1045',
          itemId: 'item-c005',
          itemCode: 'C005',
          vendorId: 'vendor-cedar',
          vendorName: 'Cedar Candle Co.',
          vendorLetter: 'C',
          itemDescription: 'Hinoki Cypress Reed Diffuser',
          unitPriceCents: 2400,
          quantity: 1,
          lineTotalCents: 2400,
          tagType: 'HANG_TAG',
        },
        {
          id: 'line-1045-2',
          orderId: 'ord-1045',
          itemId: 'item-d007',
          itemCode: 'D007',
          vendorId: 'vendor-daisy',
          vendorName: 'Daisy Jewelry',
          vendorLetter: 'D',
          itemDescription: 'Garnet Stacking Ring Trio',
          unitPriceCents: 3400,
          quantity: 1,
          lineTotalCents: 3400,
          tagType: 'HANG_TAG',
        },
      ],
    },
    {
      id: 'ord-1046',
      orderNumber: 'OCT26-1046',
      eventId,
      createdAt: '2026-10-06T14:12:00.000Z',
      completedAt: '2026-10-06T14:12:20.000Z',
      paymentStatus: 'COMPLETED',
      paymentProvider: 'VENMO',
      subtotalCents: 3500,
      taxCents: 0,
      totalCents: 3500,
      source: 'REGISTER',
      deviceId: 'reg-phone-01',
      syncStatus: 'SYNCED',
      idempotencyKey: 'idem-ord-1046',
      lines: [
        {
          id: 'line-1046-1',
          orderId: 'ord-1046',
          itemId: 'item-b015',
          itemCode: 'B015',
          vendorId: 'vendor-bluebird',
          vendorName: 'Bluebird Vintage',
          vendorLetter: 'B',
          itemDescription: 'Linen Table Runner',
          unitPriceCents: 2700,
          quantity: 1,
          lineTotalCents: 2700,
          tagType: 'HANG_TAG',
        },
        {
          id: 'line-1046-2',
          orderId: 'ord-1046',
          itemId: 'dot-vendor-anna-800',
          itemCode: 'DOT-A-800',
          vendorId: 'vendor-anna',
          vendorName: 'Anna Ceramics',
          vendorLetter: 'A',
          itemDescription: 'Red Dot Item',
          unitPriceCents: 800,
          quantity: 1,
          lineTotalCents: 800,
          tagType: 'DOT',
        },
      ],
    },
    // 11th order: One offline unsynced order per Section 34
    {
      id: 'ord-1047',
      orderNumber: 'OCT26-1047',
      eventId,
      createdAt: '2026-10-06T14:35:00.000Z',
      completedAt: '2026-10-06T14:35:18.000Z',
      paymentStatus: 'COMPLETED',
      paymentProvider: 'VENMO',
      subtotalCents: 3800,
      taxCents: 0,
      totalCents: 3800,
      source: 'REGISTER',
      deviceId: 'reg-phone-01',
      syncStatus: 'PENDING_SYNC',
      idempotencyKey: 'idem-ord-1047',
      notes: 'Rung up during brief Wi-Fi drop at Pavilion B.',
      lines: [
        {
          id: 'line-1047-1',
          orderId: 'ord-1047',
          itemId: 'item-c008',
          itemCode: 'C008',
          vendorId: 'vendor-cedar',
          vendorName: 'Cedar Candle Co.',
          vendorLetter: 'C',
          itemDescription: 'Woodland Moss Gift Box',
          unitPriceCents: 3200,
          quantity: 1,
          lineTotalCents: 3200,
          tagType: 'HANG_TAG',
        },
        {
          id: 'line-1047-2',
          orderId: 'ord-1047',
          itemId: 'dot-vendor-cedar-600',
          itemCode: 'DOT-C-600',
          vendorId: 'vendor-cedar',
          vendorName: 'Cedar Candle Co.',
          vendorLetter: 'C',
          itemDescription: 'Yellow Dot Item',
          unitPriceCents: 600,
          quantity: 1,
          lineTotalCents: 600,
          tagType: 'DOT',
        },
      ],
    },
  ];

  // One corrected transaction per Section 34
  const adjustments: OrderAdjustment[] = [
    {
      id: 'adj-1041-1',
      orderId: 'ord-1041',
      orderNumber: 'OCT26-1041',
      eventId,
      reason: 'WRONG_AMOUNT',
      notes: 'Customer took the $6 Cedar Wax Melt instead of the $12 Travel Tin. Refunded $6.00 via Venmo.',
      originalValueJson: JSON.stringify({
        orderNumber: 'OCT26-1041',
        vendor: 'Cedar Candle Co. (C)',
        dotLineCents: 1200,
        orderTotalCents: 4000,
      }),
      updatedValueJson: JSON.stringify({
        orderNumber: 'OCT26-1041',
        vendor: 'Cedar Candle Co. (C)',
        dotLineCents: 600,
        orderTotalCents: 3400,
      }),
      deltaTotalCents: -600,
      vendorId: 'vendor-cedar',
      performedBy: 'Stella (Owner)',
      createdAt: '2026-10-06T11:28:00.000Z',
    },
  ];

  const unsyncedOrder = orders.find((o) => o.id === 'ord-1047')!;
  const syncQueue: SyncQueueItem[] = [
    {
      id: unsyncedOrder.idempotencyKey,
      orderId: unsyncedOrder.id,
      orderNumber: unsyncedOrder.orderNumber,
      payload: unsyncedOrder,
      attempts: 0,
      status: 'PENDING',
      createdAt: unsyncedOrder.completedAt!,
    },
  ];

  const syncState: SyncStateRecord = {
    id: 'current',
    eventId,
    catalogDownloadedAt: '2026-10-06T08:42:00.000Z',
    lastSuccessfulSyncAt: '2026-10-06T14:14:00.000Z',
    isCatalogReadyOffline: true,
    vendorCount: vendors.length,
    inventoryCount: inventory.length,
    dotPriceCount: priceOptions.length,
  };

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'aud-1',
      timestamp: '2026-10-06T08:35:00.000Z',
      user: 'Stella (Owner)',
      role: 'OWNER',
      action: 'INVENTORY_IMPORTED',
      recordId: 'batch-seed-a',
      summary: 'Imported 4 vendor spreadsheets (45 total catalog records) for October Makers Market.',
      metadata: { vendors: 4, items: 45 },
    },
    {
      id: 'aud-2',
      timestamp: '2026-10-06T08:42:00.000Z',
      user: 'Stella (Owner)',
      role: 'OWNER',
      action: 'REGISTER_PREPARED',
      recordId: eventId,
      summary: 'Prepared Register & verified full offline catalog download in IndexedDB.',
      metadata: { vendors: 4, inventory: 45, dotPrices: 11 },
    },
    {
      id: 'aud-3',
      timestamp: '2026-10-06T11:28:00.000Z',
      user: 'Stella (Owner)',
      role: 'OWNER',
      action: 'ORDER_ADJUSTED',
      recordId: 'ord-1041',
      summary: 'Adjusted Order OCT26-1041 (-$6.00 for Cedar Candle Co. — Wrong Amount).',
      metadata: { deltaCents: -600, reason: 'WRONG_AMOUNT', vendorId: 'vendor-cedar' },
    },
    {
      id: 'aud-4',
      timestamp: '2026-10-06T14:35:18.000Z',
      user: 'Booth Operator',
      role: 'OPERATOR',
      action: 'ORDER_COMPLETED',
      recordId: 'ord-1047',
      summary: 'Completed Order OCT26-1047 ($38.00) locally; queued for sync.',
      metadata: { orderNumber: 'OCT26-1047', totalCents: 3800, syncStatus: 'PENDING_SYNC' },
    },
  ];

  return {
    event,
    vendors,
    priceOptions,
    inventory,
    photos,
    importBatches,
    orders,
    adjustments,
    syncQueue,
    syncState,
    auditLogs,
  };
}
