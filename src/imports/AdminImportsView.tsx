import React, { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Image as ImageIcon,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Download,
} from 'lucide-react';
import { useBooth } from '../context/BoothContext.tsx';
import {
  parseWorkbookBuffer,
  type ParsedWorkbook,
  writeXlsxWorkbook,
} from '../lib/xlsx.ts';
import {
  autoDetectColumnMapping,
  buildImportArtifacts,
  type ColumnMapping,
  matchUploadedPhotos,
  type ValidatedImportRow,
  validateWorkbookRows,
} from './importLogic.ts';
import { formatCurrency } from '../lib/money.ts';

function triggerBrowserDownload(
  bytes: Uint8Array,
  fileName: string,
  mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
) {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const AdminImportsView: React.FC = () => {
  const {
    activeEvent,
    vendors,
    inventory,
    photos,
    importBatches,
    commitSpreadsheetImport,
    saveBulkPhotos,
    reassignPhotoToItem,
  } = useBooth();

  const [activeSubTab, setActiveSubTab] = useState<'EXCEL' | 'PHOTOS'>('EXCEL');

  // 6-Step Excel Import Wizard State
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [parsedWorkbook, setParsedWorkbook] = useState<ParsedWorkbook | null>(
    null
  );
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [defaultVendorId, setDefaultVendorId] = useState<string>('');
  const [rowOverrides, setRowOverrides] = useState<
    Record<string, Partial<ValidatedImportRow>>
  >({});
  const [completedBatchSummary, setCompletedBatchSummary] = useState<{
    batchId: string;
    fileName: string;
    importedCount: number;
    newVendorsCount: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Photo Upload State
  const [lastPhotoStats, setLastPhotoStats] = useState<{
    matched: number;
    unmatched: number;
    duplicates: number;
  } | null>(null);

  const allHeaders = useMemo(() => {
    if (!parsedWorkbook || parsedWorkbook.sheets.length === 0) return [];
    const set = new Set<string>();
    for (const s of parsedWorkbook.sheets) {
      for (const h of s.headers) set.add(h);
    }
    return Array.from(set);
  }, [parsedWorkbook]);

  const selectedDefaultVendor = useMemo(
    () => vendors.find((v) => v.id === defaultVendorId),
    [vendors, defaultVendorId]
  );

  const validationSummary = useMemo(() => {
    if (!parsedWorkbook) return null;
    return validateWorkbookRows({
      workbook: parsedWorkbook,
      mapping: columnMapping,
      defaultVendor: selectedDefaultVendor,
      existingVendors: vendors,
      existingInventory: inventory,
      rowOverrides,
    });
  }, [
    parsedWorkbook,
    columnMapping,
    selectedDefaultVendor,
    vendors,
    inventory,
    rowOverrides,
  ]);

  const handleLoadWorkbookBytes = async (
    fileName: string,
    bytes: ArrayBuffer | Uint8Array
  ) => {
    setImportError(null);
    try {
      const wb = await parseWorkbookBuffer(fileName, bytes);
      setParsedWorkbook(wb);
      const firstHeaders = wb.sheets[0]?.headers ?? [];
      setColumnMapping(autoDetectColumnMapping(firstHeaders));
      setRowOverrides({});
      setDefaultVendorId(vendors[0]?.id ?? '');
      setWizardStep(2);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Failed to parse spreadsheet.'
      );
    }
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    await handleLoadWorkbookBytes(file.name, buffer);
  };

  const handleLoadSampleCleanWorkbook = async () => {
    const bytes = writeXlsxWorkbook([
      {
        sheetName: 'Anna Studio Additions',
        headers: ['Item #', 'Description', 'Clay & Glaze', 'Price', 'Quantity'],
        rows: [
          ['A021', 'Hand-Pinched Espresso Cup', 'Dark stoneware + shino', 18, 1],
          ['A022', 'Ikebana Moon Cylinder', 'Matte ash glaze', 36, 1],
          ['A023', 'Ceramic Garlic Grater Plate', 'Speckled buff clay', 22, 1],
          ['A024', 'Large Ramen Noodle Bowl', 'Oribe green rim', 34, 1],
        ],
      },
    ]);
    await handleLoadWorkbookBytes('Anna_Studio_Additions.xlsx', bytes);
  };

  const handleLoadSampleWorkbookWithErrors = async () => {
    const bytes = writeXlsxWorkbook([
      {
        sheetName: 'Vendor Sheet With Errors',
        headers: ['Item Number', 'Description', 'Notes', 'Price', 'Quantity'],
        rows: [
          ['B031', 'Mid-Century Brass Bookends', 'Pair of solid brass owls', 38, 1],
          ['B032', 'Invalid Price Teapot', 'Malformed price row', '$24..50', 1], // Error 1: invalid price
          ['', 'Missing Code Mirror', 'Gilt wood vanity mirror', 28, 1], // Error 2: missing item code
          ['B034', 'Handwoven Linen Napkins (Set)', 'Quantity > 1 hang tag warning', 26, 4], // Warning: qty > 1 on hang tag
          ['B035', 'Pressed Glass Cake Stand', '1950s scalloped rim', 32, 1],
        ],
      },
    ]);
    const bluebird = vendors.find((v) => v.vendorLetter === 'B');
    await handleLoadWorkbookBytes('Bluebird_Batch2_WithErrors.xlsx', bytes);
    if (bluebird) {
      setDefaultVendorId(bluebird.id);
    }
  };

  const handleDownloadSampleXlsxFile = () => {
    const bytes = writeXlsxWorkbook([
      {
        sheetName: 'Vendor Inventory Template',
        headers: ['Item #', 'Description', 'Material / Notes', 'Price', 'Quantity'],
        rows: [
          ['A031', 'Stoneware Vase', 'Celadon glaze', 32, 1],
          ['A032', 'Tea Mug', 'Speckled clay', 20, 1],
        ],
      },
    ]);
    triggerBrowserDownload(bytes, 'Vendor_Inventory_Template.xlsx');
  };

  const handlePatchRowOverride = (
    rowKey: string,
    patch: Partial<ValidatedImportRow>
  ) => {
    setRowOverrides((prev) => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] ?? {}),
        ...patch,
      },
    }));
  };

  const handleExecuteImport = async () => {
    if (!activeEvent || !parsedWorkbook || !validationSummary) return;
    setImportError(null);
    try {
      const artifacts = buildImportArtifacts({
        eventId: activeEvent.id,
        workbook: parsedWorkbook,
        validationSummary,
        mapping: columnMapping,
        existingVendors: vendors,
        importedBy: 'Stella (Owner)',
      });
      await commitSpreadsheetImport(artifacts);
      setCompletedBatchSummary({
        batchId: artifacts.importBatch.id,
        fileName: artifacts.importBatch.fileName,
        importedCount: artifacts.inventoryItems.length,
        newVendorsCount: artifacts.newVendors.length,
      });
      setWizardStep(6);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  // --- Photo Upload Handlers (Section 20) ---
  const handlePhotoFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !activeEvent) return;

    const uploadedFiles: Array<{ fileName: string; dataUrl: string }> = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.readAsDataURL(f);
      });
      uploadedFiles.push({ fileName: f.name, dataUrl });
    }

    const res = matchUploadedPhotos({
      eventId: activeEvent.id,
      uploadedFiles,
      inventory,
      existingPhotos: photos,
    });

    setLastPhotoStats({
      matched: res.matchedCount,
      unmatched: res.unmatchedCount,
      duplicates: res.duplicateCount,
    });

    await saveBulkPhotos(
      res.photos,
      res.updatedInventory,
      `Uploaded ${uploadedFiles.length} photo(s) — Matched: ${res.matchedCount}, Unmatched: ${res.unmatchedCount}, Duplicates: ${res.duplicateCount}.`
    );
  };

  const handleSimulateSamplePhotoUpload = async () => {
    if (!activeEvent) return;
    const makeSampleSvg = (label: string, hex: string) =>
      `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" rx="16" fill="${hex}"/><text x="80" y="88" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="bold" font-size="22">${label}</text></svg>`
      )}`;

    // Temporarily clear photo on A004 so A004.jpg counts as a fresh MATCH, A002.jpg counts as DUPLICATE, and Z999.jpg counts as UNMATCHED
    const filteredExistingPhotos = photos.filter((p) => p.baseCode !== 'A004');
    const res = matchUploadedPhotos({
      eventId: activeEvent.id,
      uploadedFiles: [
        { fileName: 'A004.jpg', dataUrl: makeSampleSvg('A004 NEW', '#0f766e') },
        { fileName: 'A002.jpg', dataUrl: makeSampleSvg('A002 DUP', '#b91c1c') },
        { fileName: 'Z999_Unlabeled.jpg', dataUrl: makeSampleSvg('Z999 ?', '#64748b') },
      ],
      inventory,
      existingPhotos: filteredExistingPhotos,
    });

    setLastPhotoStats({
      matched: res.matchedCount,
      unmatched: res.unmatchedCount,
      duplicates: res.duplicateCount,
    });

    await saveBulkPhotos(
      res.photos,
      res.updatedInventory,
      `Bulk photo match run — Matched: ${res.matchedCount}, Unmatched: ${res.unmatchedCount}, Duplicates: ${res.duplicateCount}.`
    );
  };

  const matchedTotal = photos.filter((p) => p.matchStatus === 'MATCHED').length;
  const unmatchedTotal = photos.filter(
    (p) => p.matchStatus === 'UNMATCHED'
  ).length;
  const duplicateTotal = photos.filter(
    (p) => p.matchStatus === 'DUPLICATE'
  ).length;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Sub-navigation: Excel Import Wizard vs Bulk Photo Upload */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Vendor Spreadsheet Import &amp; Photo Matcher
          </h1>
          <p className="text-xs text-slate-600">
            Import vendor .xlsx files while preserving exact sheet/row lineage, and bulk-match sequential item photos.
          </p>
        </div>

        <div className="inline-flex rounded-xl bg-slate-100 p-1 self-start">
          <button
            type="button"
            onClick={() => setActiveSubTab('EXCEL')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'EXCEL'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel Import Wizard</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('PHOTOS')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'PHOTOS'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Bulk Photo Matcher ({photos.length})</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'EXCEL' ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-5">
          {/* 6-Step Progress Stepper (Section 18) */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 border-b border-slate-100 pb-4">
            {[
              { step: 1, title: '1. Upload' },
              { step: 2, title: '2. Inspect Sheets' },
              { step: 3, title: '3. Map Columns' },
              { step: 4, title: '4. Validate Data' },
              { step: 5, title: '5. Preview' },
              { step: 6, title: '6. Import Done' },
            ].map((s) => (
              <div
                key={s.step}
                className={`px-3 py-2 rounded-xl text-xs font-bold border text-center ${
                  wizardStep === s.step
                    ? 'bg-slate-900 text-white border-slate-900'
                    : wizardStep > s.step
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-slate-50 text-slate-400 border-slate-200'
                }`}
              >
                {s.title}
              </div>
            ))}
          </div>

          {importError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
              {importError}
            </div>
          )}

          {/* STEP 1: UPLOAD SPREADSHEET */}
          {wizardStep === 1 && (
            <div className="space-y-5 py-2">
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3 bg-slate-50/60">
                <Upload className="w-10 h-10 text-slate-500 mx-auto" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Step 1: Upload Vendor Inventory Spreadsheet (.xlsx or .csv)
                  </h2>
                  <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                    Booth Checkout preserves original sheet names, column order, and row numbers so end-of-event reconciliation reports mirror the vendor&apos;s exact workbook.
                  </p>
                </div>

                <div className="pt-2">
                  <label className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>Select .xlsx or .csv File</span>
                    <input
                      type="file"
                      accept=".xlsx,.csv,.tsv"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Instant Test Workbooks */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Quick Demo Workbooks (Test 6-Step Wizard &amp; Validation Immediately)
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={handleLoadSampleCleanWorkbook}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Load Sample Valid Workbook (4 Anna Ceramics Items)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadSampleWorkbookWithErrors}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                    <span>
                      Load Sample Workbook with Errors (3 Valid, 1 Warning, 2 Errors)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSampleXlsxFile}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Blank .xlsx Template</span>
                  </button>
                </div>
              </div>

              {/* Existing Import Batches Lineage List */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Recorded Import Batches &amp; Preserved Workbooks ({importBatches.length})
                </h3>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {importBatches.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900">
                          {b.fileName}
                        </span>
                        <span className="text-slate-500 ml-2">
                          Batch ID: <span className="font-mono">{b.id}</span> •{' '}
                          {b.sheets.map((s) => `"${s.sheetName}"`).join(', ')}
                        </span>
                      </div>
                      <span className="font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                        {b.validRowCount} items preserved
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: INSPECT SHEETS AND HEADERS */}
          {wizardStep === 2 && parsedWorkbook && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Step 2: Inspect Sheets &amp; Headers — {parsedWorkbook.fileName}
                </h2>
                <p className="text-xs text-slate-600">
                  Detected {parsedWorkbook.sheets.length} sheet(s). Original tab names and column ordering will be preserved on export.
                </p>
              </div>

              {parsedWorkbook.sheets.map((sheet) => (
                <div
                  key={sheet.sheetName}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">
                      Tab: &ldquo;{sheet.sheetName}&rdquo;
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      {sheet.rows.length} data rows • {sheet.headers.length} columns
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sheet.headers.map((h, idx) => (
                      <span
                        key={h}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-mono font-semibold text-slate-800"
                      >
                        Col {idx + 1}: {h}
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStep(3)}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Next: Map Columns</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: MAP SPREADSHEET COLUMNS */}
          {wizardStep === 3 && parsedWorkbook && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Step 3: Map Spreadsheet Columns to Booth Checkout Fields
                </h2>
                <p className="text-xs text-slate-600">
                  Select which spreadsheet column corresponds to each inventory field, or assign a single vendor for this workbook.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Target Vendor for Workbook (Used when sheet does not have a Vendor column)
                </label>
                <select
                  value={defaultVendorId}
                  onChange={(e) => setDefaultVendorId(e.target.value)}
                  className="w-full sm:w-80 min-h-[40px] px-3 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      Vendor {v.vendorLetter} — {v.name} ({v.dotColor} Dot)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {[
                  { key: 'itemCode', label: 'Item Code / Item # (Required)' },
                  { key: 'itemName', label: 'Item Name / Description (Required)' },
                  { key: 'price', label: 'Price (Required)' },
                  { key: 'quantity', label: 'Quantity' },
                  { key: 'description', label: 'Secondary Notes / Material' },
                  { key: 'vendorName', label: 'Vendor Name Column (Optional)' },
                ].map((field) => (
                  <div
                    key={field.key}
                    className="p-3 rounded-xl border border-slate-200 flex flex-col gap-1"
                  >
                    <label className="text-xs font-bold text-slate-700">
                      {field.label}
                    </label>
                    <select
                      value={
                        (columnMapping as Record<string, string | undefined>)[
                          field.key
                        ] ?? ''
                      }
                      onChange={(e) =>
                        setColumnMapping({
                          ...columnMapping,
                          [field.key]: e.target.value || undefined,
                        })
                      }
                      className="min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs bg-white font-mono"
                    >
                      <option value="">— Not Mapped —</option>
                      {allHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStep(4)}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Next: Validate Data</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 & STEP 5: VALIDATE DATA & PREVIEW IMPORT */}
          {(wizardStep === 4 || wizardStep === 5) &&
            parsedWorkbook &&
            validationSummary && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {wizardStep === 4
                        ? 'Step 4: Data Validation & Error Resolution'
                        : 'Step 5: Final Import Preview'}
                    </h2>
                    <p className="text-xs text-slate-600">
                      Errors must be fixed inline or excluded before final import.
                    </p>
                  </div>

                  {/* Validation Summary Pills (Section 18 Step 5) */}
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {validationSummary.validRowCount} valid rows
                    </span>
                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200">
                      {validationSummary.warningCount} warnings
                    </span>
                    <span
                      className={`px-3 py-1 rounded-xl text-xs font-bold border ${
                        validationSummary.errorCount > 0
                          ? 'bg-red-50 text-red-800 border-red-300'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {validationSummary.errorCount} errors
                    </span>
                  </div>
                </div>

                {validationSummary.errorCount > 0 && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-900 flex items-center justify-between gap-3"
                  >
                    <span>
                      {validationSummary.errorCount} spreadsheet row(s) have validation errors. Edit the highlighted fields below or exclude the row to proceed.
                    </span>
                  </div>
                )}

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Row</th>
                        <th className="py-2.5 px-3">Item Code</th>
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3">Price ($)</th>
                        <th className="py-2.5 px-3">Qty</th>
                        <th className="py-2.5 px-3">Vendor</th>
                        <th className="py-2.5 px-3">Validation Status</th>
                        <th className="py-2.5 px-3 text-right">Include</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {validationSummary.rows.map((row) => {
                        const hasError = row.issues.some(
                          (i) => i.severity === 'ERROR'
                        );
                        return (
                          <tr
                            key={row.rowKey}
                            className={
                              row.excluded
                                ? 'opacity-45 bg-slate-50'
                                : hasError
                                ? 'bg-red-50/40'
                                : ''
                            }
                          >
                            <td className="py-2 px-3 font-mono text-slate-500">
                              {row.sheetName} #{row.rowIndex}
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={row.itemCode}
                                onChange={(e) =>
                                  handlePatchRowOverride(row.rowKey, {
                                    itemCode: e.target.value.toUpperCase(),
                                  })
                                }
                                placeholder="Code..."
                                className={`w-24 px-2 py-1 rounded border font-mono font-bold text-xs ${
                                  !row.itemCode
                                    ? 'border-red-400 bg-red-50'
                                    : 'border-slate-200 bg-white'
                                }`}
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={row.itemName}
                                onChange={(e) =>
                                  handlePatchRowOverride(row.rowKey, {
                                    itemName: e.target.value,
                                  })
                                }
                                className="w-44 px-2 py-1 rounded border border-slate-200 bg-white text-xs"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={String(row.rawPrice)}
                                onChange={(e) =>
                                  handlePatchRowOverride(row.rowKey, {
                                    rawPrice: e.target.value,
                                  })
                                }
                                className={`w-24 px-2 py-1 rounded border font-mono text-xs ${
                                  row.priceCents === null
                                    ? 'border-red-400 bg-red-50 text-red-900 font-bold'
                                    : 'border-slate-200 bg-white'
                                }`}
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={String(row.rawQuantity)}
                                onChange={(e) =>
                                  handlePatchRowOverride(row.rowKey, {
                                    rawQuantity: e.target.value,
                                  })
                                }
                                className="w-16 px-2 py-1 rounded border border-slate-200 bg-white font-mono text-xs"
                              />
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-700">
                              {row.vendorLetter} — {row.vendorName}
                            </td>
                            <td className="py-2 px-3">
                              {row.issues.length === 0 ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Valid ({formatCurrency(row.priceCents ?? 0)})
                                </span>
                              ) : (
                                <div className="space-y-0.5">
                                  {row.issues.map((iss, idx) => (
                                    <div
                                      key={idx}
                                      className={`flex items-center gap-1 font-semibold ${
                                        iss.severity === 'ERROR'
                                          ? 'text-red-700'
                                          : 'text-amber-700'
                                      }`}
                                    >
                                      {iss.severity === 'ERROR' ? (
                                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                                      ) : (
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                      )}
                                      <span>{iss.message}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="checkbox"
                                checked={!row.excluded}
                                onChange={(e) =>
                                  handlePatchRowOverride(row.rowKey, {
                                    excluded: !e.target.checked,
                                  })
                                }
                                className="w-4 h-4 rounded cursor-pointer"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setWizardStep(wizardStep === 5 ? 4 : 3)
                    }
                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>

                  {wizardStep === 4 ? (
                    <button
                      type="button"
                      disabled={!validationSummary.canProceed}
                      onClick={() => setWizardStep(5)}
                      className="px-5 py-2.5 rounded-xl bg-slate-900 disabled:bg-slate-300 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Next: Preview Import</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!validationSummary.canProceed}
                      onClick={handleExecuteImport}
                      className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        Step 6: Import {validationSummary.validRowCount} Valid Rows
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

          {/* STEP 6: IMPORT COMPLETE */}
          {wizardStep === 6 && completedBatchSummary && (
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Import Completed Successfully
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Batch ID{' '}
                  <span className="font-mono font-bold text-slate-900">
                    {completedBatchSummary.batchId}
                  </span>{' '}
                  • Imported {completedBatchSummary.importedCount} items from{' '}
                  <strong>{completedBatchSummary.fileName}</strong> with full workbook, tab, and row lineage preserved.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWizardStep(1);
                  setParsedWorkbook(null);
                  setCompletedBatchSummary(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                Import Another Spreadsheet
              </button>
            </div>
          )}
        </div>
      ) : (
        /* BULK PHOTO UPLOAD & AUTO-MATCHER (Section 20) */
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Bulk Photo Upload &amp; Sequential Code Matcher
              </h2>
              <p className="text-xs text-slate-600">
                Automatically matches sequential filenames (e.g. <code>A001.jpg → Item A001</code>) and allows manual reassignment.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSimulateSamplePhotoUpload}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>Test Batch (A004.jpg, A002.jpg, Z999.jpg)</span>
              </button>

              <label className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Upload Photos</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoFilesSelected}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Match Counts Summary (Section 20) */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-xs font-bold text-emerald-800">Matched</div>
              <div className="text-2xl font-mono font-extrabold text-emerald-950 mt-0.5">
                {lastPhotoStats ? lastPhotoStats.matched : matchedTotal}
              </div>
              <div className="text-[11px] text-emerald-700">
                Total matched in catalog: {matchedTotal}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-xs font-bold text-amber-900">Unmatched</div>
              <div className="text-2xl font-mono font-extrabold text-amber-950 mt-0.5">
                {lastPhotoStats ? lastPhotoStats.unmatched : unmatchedTotal}
              </div>
              <div className="text-[11px] text-amber-800">
                Total unmatched: {unmatchedTotal}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200">
              <div className="text-xs font-bold text-blue-900">Duplicates</div>
              <div className="text-2xl font-mono font-extrabold text-blue-950 mt-0.5">
                {lastPhotoStats ? lastPhotoStats.duplicates : duplicateTotal}
              </div>
              <div className="text-[11px] text-blue-800">
                Total duplicates: {duplicateTotal}
              </div>
            </div>
          </div>

          {/* Photo Grid with Manual Reassignment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {photos.slice(0, 18).map((photo) => (
              <div
                key={photo.id}
                className="p-3 rounded-xl border border-slate-200 flex items-center gap-3 bg-slate-50/60"
              >
                <img
                  src={photo.dataUrl}
                  alt={photo.fileName}
                  className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0 bg-white"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-bold text-xs text-slate-900 truncate">
                      {photo.fileName}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        photo.matchStatus === 'MATCHED'
                          ? 'bg-emerald-100 text-emerald-900'
                          : photo.matchStatus === 'DUPLICATE'
                          ? 'bg-blue-100 text-blue-900'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {photo.matchStatus}
                    </span>
                  </div>

                  <div>
                    <select
                      value={photo.matchedItemId ?? ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          reassignPhotoToItem(photo.id, e.target.value);
                        }
                      }}
                      aria-label={`Assign ${photo.fileName} to inventory item`}
                      className="w-full py-1 px-2 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                    >
                      <option value="">— Unassigned —</option>
                      {inventory
                        .filter((i) => i.tagType === 'HANG_TAG')
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.itemCode} — {item.itemName}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
