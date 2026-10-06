# Booth Checkout — Mobile-First Multi-Vendor Market POS & Reconciliation System

**Booth Checkout** is a local-first Progressive Web App (PWA) designed for a one-person, multi-vendor market booth. It pairs an ultra-fast **Operator Mode** (designed for one-handed phone operation in bright outdoor sunlight and intermittent/zero cellular connectivity) with **Stella's Owner Admin Mode** (designed for desktop/tablet inventory import, vendor management, bulk photo matching, audit adjustments, and lineage-preserving Excel reconciliation exports).

---

## Key Capabilities

### 1. Operator Mode (Mobile-First Register)
- **Hang Tag Quick Lookup (`A001`)**:
  - Rapid code entry with an integrated big-target on-screen keypad (`A–G`, `0–9`, `⌫`, `ADD`) or hardware keyboard.
  - Instant item card confirmation with vendor badge, photo thumbnail, price, and description.
  - **Duplicate Unique Item Sale Guard**: Warns the operator if a single-quantity item was already sold (e.g., `Item A005 was already sold in Order #1038 ($68.00 at 2:14 PM)`) with explicit **Cancel** or **Override & Sell Anyway** actions that record an audit trail.
  - **Closest-Match Code Suggestions**: If `A017` is not found, suggests nearest available codes (`A016`, `A018`, `A011`) as tap-to-review buttons without ever silently substituting an item.
- **Dot Sticker Mode (Accessible Color + Shape + Pattern + Letter)**:
  - Colorblind-safe vendor tiles combining high-contrast fills, SVG patterns, geometric badge icons (`CIRCLE`, `DIAMOND`, `SQUARE`, `TRIANGLE`, `HEXAGON`), vendor letter, and vendor name.
  - Quick price buttons (`$1`, `$2`, `$3`, `$5`, `$8`, `$10`, `$12`, `$15`, `$20`, `$25`) plus custom dollar/cent keypad and quantity stepper (`- 1 +`).
- **Combined Multi-Vendor Cart & Offline QR Payment**:
  - Integer-cent arithmetic (`priceCents * quantity`) eliminating floating-point drift.
  - Client-side **ISO/IEC 18004 QR Code SVG Generator** (`src/lib/qrcode.ts`) that renders crisp, scannable payment QR codes completely offline.
  - Pluggable **Payment Provider Adapters** (`Venmo`, `PayPal`, `Cash App`, `Custom URL`) with strict two-decimal formatting (`5 -> 5.00`, `12.5 -> 12.50`).
  - **Duplicate-Tap Payment Protection**: Synchronous mutex + idempotency key ensures rapid double-taps on **Payment Received** only ever create a single order.
- **Emergency / Paper Mode**:
  - Dedicated high-visibility recovery view showing the Vendor Quick Reference Table, Offline QR Calculator, and **Paper Slip Recovery** form (`Source: Paper Recovery`).

### 2. Stella's Admin Mode (Desktop & Tablet Dashboard)
- **Owner Overview**: Real-time Gross Merchandise Sales, Vendor Payouts Due, Market Commission, Completed Orders, and a live 3-Way Financial Integrity status banner.
- **Event Settings & "Prepare Register" Checklist**:
  - Interactive 4-point pre-market readiness verification (Event configured, Vendors & inventory cached locally, Offline storage & Service Worker ready, Sample QR test passed) with one-click local JSON backup export.
- **Vendor Management**:
  - Enforces unique vendor letters per event and warns when two vendors share the same dot sticker color.
- **6-Step Excel Import Wizard & Bulk Photo Matcher**:
  - Supports `.xlsx` (native OpenXML parser) and `.csv` uploads with column auto-mapping, inline row error repair, and full spreadsheet lineage capture (`originalWorkbookName`, `originalSheetName`, `originalRowIndex`, `originalHeaders`, `originalRowData`).
  - Bulk Photo Upload matches `A001.jpg -> A001` case-insensitively and flags unmatched or duplicate filenames.
- **End-of-Day Reconciliation & Excel Exports**:
  - Enforces three-way financial integrity:
    $$\sum \text{Order Line Totals} = \sum \text{Vendor Gross Sales} = \text{Event Gross Merchandise Sales}$$
  - **Vendor Reconciliation Workbook (`.xlsx`)**: Preserves the vendor's original sheet name, column order, and row order while appending `Qty Sold`, `Sales Total`, `Remaining`, and a summary block (`Hang Tag Sales`, `Dot Sticker Sales`, `Gross Sales`, `Commission`, `Net Payout`).
  - **Market Master Workbook (`.xlsx`)**: Multi-sheet OpenXML workbook with 5 tabs: `Summary`, `Orders`, `Order Lines`, `Vendor Payouts`, and `Inventory`.

---

## Project Architecture

```text
booth-checkout/
├── public/
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Offline-first Service Worker
│   ├── icon-192.svg           # Booth Checkout app icon
│   └── icon-512.svg
├── server/
│   ├── schema.sql             # PostgreSQL / SQLite relational schema
│   └── apiServer.ts           # Idempotent sync & snapshot API server
├── src/
│   ├── types/domain.ts        # Core domain models & types
│   ├── lib/
│   │   ├── money.ts           # Integer-cent currency & commission math
│   │   ├── qrcode.ts          # Offline ISO/IEC 18004 SVG QR generator
│   │   └── xlsx.ts            # Pure TypeScript OpenXML (.xlsx) reader/writer
│   ├── payments/              # Venmo, PayPal, Cash App, Custom URL adapters
│   ├── inventory/             # Hang Tag lookup, fuzzy suggestions, Inventory UI
│   ├── checkout/              # Cart logic, Operator Checkout UI, QR Payment Modal
│   ├── orders/                # Orders & Line Items search + audited adjustments
│   ├── vendors/               # Vendor management & duplicate color detection
│   ├── events/                # Event settings & Prepare Register checklist
│   ├── imports/               # 6-step Excel Import Wizard & Bulk Photo Matcher
│   ├── reports/               # 3-way reconciliation engine & Excel exporters
│   ├── offline/               # IndexedDB storage (BoothCheckoutDB_v1), seed data, Paper Mode
│   ├── sync/                  # Offline queue & IdempotentServerLedger sync engine
│   └── tests/runTests.ts      # Automated business logic & E2E demo test suite
```

---

## Getting Started

### Run Automated Tests
```bash
npm test
```

### Start Development Server (with `/api/sync` middleware)
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```
