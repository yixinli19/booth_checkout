/**
 * Pure TypeScript OpenXML (.xlsx) Reader and Writer.
 * Supports reading and writing multi-sheet .xlsx workbooks (PKZIP + SpreadsheetML)
 * while preserving sheet names, column ordering, and row ordering.
 */

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: Array<{
    rowIndex: number; // 1-based Excel row index (e.g. 2 for first data row)
    valuesByHeader: Record<string, string | number>;
    rawCells: (string | number)[];
  }>;
}

export interface ParsedWorkbook {
  fileName: string;
  sheets: ParsedSheet[];
}

export interface SheetExportSpec {
  sheetName: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

// CRC-32 Table for PKZIP
const CRC32_TABLE = new Uint32Array(256);
(function initCrc32() {
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    CRC32_TABLE[i] = c >>> 0;
  }
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function columnIndexToLetter(colIdxZeroBased: number): string {
  let n = colIdxZeroBased + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

export function columnLetterToIndex(colLetters: string): number {
  let result = 0;
  const upper = colLetters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64);
  }
  return result - 1;
}

/**
 * Creates an uncompressed PKZIP archive from a list of { path, content } entries.
 * Method 0 (STORE) is 100% compliant with OpenXML (.xlsx) and opens in Excel, Sheets, and Numbers.
 */
function createZipArchive(files: Array<{ path: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Signature
    lv.setUint16(4, 20, true); // Version needed
    lv.setUint16(6, 0, true); // Flags
    lv.setUint16(8, 0, true); // Compression method: 0 = STORE
    lv.setUint16(10, 0, true); // Mod time
    lv.setUint16(12, 0x21, true); // Mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // Extra field len
    localHeader.set(nameBytes, 30);

    // Central directory header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0, true); // Flags
    cv.setUint16(10, 0, true); // Compression: 0 = STORE
    cv.setUint16(12, 0, true); // Mod time
    cv.setUint16(14, 0x21, true); // Mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, file.data);
    centralParts.push(centralHeader);
    offset += localHeader.length + file.data.length;
  }

  let centralSize = 0;
  for (const cp of centralParts) centralSize += cp.length;

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLen = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);
  return out;
}

/**
 * Generates a valid binary .xlsx file (Uint8Array) from one or more sheets.
 */
export function writeXlsxWorkbook(sheets: SheetExportSpec[]): Uint8Array {
  const encoder = new TextEncoder();
  const safeSheets =
    sheets.length > 0
      ? sheets
      : [{ sheetName: 'Sheet1', headers: ['Empty'], rows: [] }];

  const contentTypesOverrides = safeSheets
    .map(
      (_, idx) =>
        `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${contentTypesOverrides}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookSheetsXml = safeSheets
    .map((s, idx) => {
      // Clean Excel sheet name (max 31 chars, no []:*?/\ chars)
      const cleanName =
        s.sheetName.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) ||
        `Sheet${idx + 1}`;
      return `<sheet name="${escapeXml(cleanName)}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`;
    })
    .join('');

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheetsXml}</sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${safeSheets
    .map(
      (_, idx) =>
        `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
    )
    .join('')}
</Relationships>`;

  const files: Array<{ path: string; data: Uint8Array }> = [
    { path: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { path: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { path: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { path: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
  ];

  safeSheets.forEach((sheet, idx) => {
    const allRows: Array<Array<string | number | null | undefined>> = [
      sheet.headers,
      ...sheet.rows,
    ];

    const rowXmlParts: string[] = [];
    allRows.forEach((rowCells, rIdx) => {
      const rowNum = rIdx + 1;
      const cellParts: string[] = [];
      rowCells.forEach((cellVal, cIdx) => {
        if (cellVal === null || cellVal === undefined || cellVal === '') {
          return;
        }
        const cellRef = `${columnIndexToLetter(cIdx)}${rowNum}`;
        if (typeof cellVal === 'number' && Number.isFinite(cellVal)) {
          cellParts.push(`<c r="${cellRef}" t="n"><v>${cellVal}</v></c>`);
        } else {
          cellParts.push(
            `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(String(cellVal))}</t></is></c>`
          );
        }
      });
      rowXmlParts.push(`<row r="${rowNum}">${cellParts.join('')}</row>`);
    });

    const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXmlParts.join('')}</sheetData>
</worksheet>`;

    files.push({
      path: `xl/worksheets/sheet${idx + 1}.xml`,
      data: encoder.encode(worksheetXml),
    });
  });

  return createZipArchive(files);
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(compressed));
    writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
  throw new Error('DecompressionStream is required to inflate compressed .xlsx entries.');
}

async function extractZipEntries(zipBytes: Uint8Array): Promise<Map<string, string>> {
  const decoder = new TextDecoder('utf-8');
  const entries = new Map<string, string>();
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);

  // Locate End of Central Directory (EOCD) signature 0x06054b50 from end
  let eocdPos = -1;
  for (let i = zipBytes.length - 22; i >= Math.max(0, zipBytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }

  if (eocdPos === -1) {
    throw new Error('Invalid .xlsx archive: ZIP Central Directory not found.');
  }

  const totalEntries = view.getUint16(eocdPos + 10, true);
  let cdPos = view.getUint32(eocdPos + 16, true);

  for (let i = 0; i < totalEntries; i++) {
    if (cdPos + 46 > zipBytes.length || view.getUint32(cdPos, true) !== 0x02014b50) {
      break;
    }
    const compressionMethod = view.getUint16(cdPos + 10, true);
    const compressedSize = view.getUint32(cdPos + 20, true);
    const fileNameLen = view.getUint16(cdPos + 28, true);
    const extraLen = view.getUint16(cdPos + 30, true);
    const commentLen = view.getUint16(cdPos + 32, true);
    const localHeaderOffset = view.getUint32(cdPos + 42, true);

    const fileName = decoder.decode(
      zipBytes.subarray(cdPos + 46, cdPos + 46 + fileNameLen)
    );

    // Read local header to skip its variable-length extra field
    const localFileNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
    const rawSlice = zipBytes.subarray(dataStart, dataStart + compressedSize);

    let uncompressed: Uint8Array;
    if (compressionMethod === 0) {
      uncompressed = rawSlice;
    } else if (compressionMethod === 8) {
      uncompressed = await inflateRawBytes(rawSlice);
    } else {
      throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
    }

    entries.set(fileName.replace(/^\//, ''), decoder.decode(uncompressed));
    cdPos += 46 + fileNameLen + extraLen + commentLen;
  }

  return entries;
}

function parseSharedStringsXml(xml: string): string[] {
  const strings: string[] = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let siMatch: RegExpExecArray | null;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const inner = siMatch[1];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tMatch: RegExpExecArray | null;
    let combined = '';
    while ((tMatch = tRegex.exec(inner)) !== null) {
      combined += unescapeXml(tMatch[1]);
    }
    strings.push(combined);
  }
  return strings;
}

function parseWorksheetXml(xml: string, sharedStrings: string[]): ParsedSheet['rows'] & { headers: string[] } {
  const parsedRows: Array<{ rowIndex: number; cellsByCol: Map<number, string | number> }> = [];
  let maxColIndex = -1;

  const rowRegex = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  let fallbackRowIdx = 0;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    fallbackRowIdx++;
    const rowAttrs = rowMatch[1];
    const rowBody = rowMatch[2];
    const rAttrMatch = /\br="(\d+)"/.exec(rowAttrs);
    const rowIndex = rAttrMatch ? parseInt(rAttrMatch[1], 10) : fallbackRowIdx;

    const cellsByCol = new Map<number, string | number>();
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    let nextColIdx = 0;

    while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
      const cAttrs = cellMatch[1];
      const cBody = cellMatch[2] ?? '';
      const refMatch = /\br="([A-Za-z]+)\d+"/.exec(cAttrs);
      const colIdx = refMatch ? columnLetterToIndex(refMatch[1]) : nextColIdx;
      nextColIdx = colIdx + 1;

      const typeMatch = /\bt="([^"]+)"/.exec(cAttrs);
      const cellType = typeMatch ? typeMatch[1] : 'n';

      let cellValue: string | number = '';
      if (cellType === 'inlineStr') {
        const tMatch = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(cBody);
        cellValue = tMatch ? unescapeXml(tMatch[1]) : '';
      } else {
        const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cBody);
        const rawV = vMatch ? unescapeXml(vMatch[1]) : '';
        if (cellType === 's') {
          const sIdx = parseInt(rawV, 10);
          cellValue = sharedStrings[sIdx] ?? rawV;
        } else if (cellType === 'str' || cellType === 'b') {
          cellValue = rawV;
        } else if (rawV !== '') {
          const num = Number(rawV);
          cellValue = Number.isFinite(num) ? num : rawV;
        }
      }

      if (cellValue !== '') {
        cellsByCol.set(colIdx, cellValue);
        if (colIdx > maxColIndex) maxColIndex = colIdx;
      }
    }

    if (cellsByCol.size > 0) {
      parsedRows.push({ rowIndex, cellsByCol });
    }
  }

  if (parsedRows.length === 0 || maxColIndex < 0) {
    const empty = [] as unknown as ParsedSheet['rows'] & { headers: string[] };
    empty.headers = [];
    return empty;
  }

  // First non-empty row is headers
  const headerRow = parsedRows[0];
  const headers: string[] = [];
  for (let c = 0; c <= maxColIndex; c++) {
    const hVal = headerRow.cellsByCol.get(c);
    headers.push(hVal !== undefined && String(hVal).trim() !== '' ? String(hVal).trim() : `Column ${c + 1}`);
  }

  const dataRows: ParsedSheet['rows'] = [];
  for (let i = 1; i < parsedRows.length; i++) {
    const r = parsedRows[i];
    const valuesByHeader: Record<string, string | number> = {};
    const rawCells: (string | number)[] = [];
    let hasNonEmpty = false;

    for (let c = 0; c <= maxColIndex; c++) {
      const val = r.cellsByCol.get(c) ?? '';
      if (val !== '') hasNonEmpty = true;
      valuesByHeader[headers[c]] = val;
      rawCells.push(val);
    }

    if (hasNonEmpty) {
      dataRows.push({
        rowIndex: r.rowIndex,
        valuesByHeader,
        rawCells,
      });
    }
  }

  const result = dataRows as ParsedSheet['rows'] & { headers: string[] };
  result.headers = headers;
  return result;
}

function parseCsvWorkbook(fileName: string, csvText: string): ParsedWorkbook {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  const parseCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  if (lines.length === 0) {
    return { fileName, sheets: [{ sheetName: 'Sheet1', headers: [], rows: [] }] };
  }

  const headers = parseCsvLine(lines[0]).map((h, idx) => h || `Column ${idx + 1}`);
  const rows: ParsedSheet['rows'] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const valuesByHeader: Record<string, string | number> = {};
    headers.forEach((h, idx) => {
      valuesByHeader[h] = cells[idx] ?? '';
    });
    rows.push({
      rowIndex: i + 1,
      valuesByHeader,
      rawCells: cells,
    });
  }

  return {
    fileName,
    sheets: [
      {
        sheetName: fileName.replace(/\.(csv|tsv|xlsx)$/i, '') || 'Inventory',
        headers,
        rows,
      },
    ],
  };
}

/**
 * Parses an uploaded .xlsx or .csv file into sheets, preserving exact tab names,
 * header ordering, and 1-based row numbers.
 */
export async function parseWorkbookBuffer(
  fileName: string,
  buffer: ArrayBuffer | Uint8Array
): Promise<ParsedWorkbook> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Check PKZIP magic header (0x50 0x4b 0x03 0x04)
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = await extractZipEntries(bytes);
    const sharedStringsXml = entries.get('xl/sharedStrings.xml');
    const sharedStrings = sharedStringsXml ? parseSharedStringsXml(sharedStringsXml) : [];

    // Map relationship IDs from xl/_rels/workbook.xml.rels
    const relsMap = new Map<string, string>();
    const workbookRels = entries.get('xl/_rels/workbook.xml.rels') ?? '';
    const relRegex = /<Relationship\b[^>]*?\bId="([^"]+)"[^>]*?\bTarget="([^"]+)"/g;
    let relMatch: RegExpExecArray | null;
    while ((relMatch = relRegex.exec(workbookRels)) !== null) {
      let target = relMatch[2].replace(/^\//, '');
      if (!target.startsWith('xl/')) {
        target = `xl/${target}`;
      }
      relsMap.set(relMatch[1], target);
    }

    const workbookXml = entries.get('xl/workbook.xml') ?? '';
    const sheetMeta: Array<{ name: string; path: string }> = [];
    const sheetRegex = /<sheet\b([^>]*)\/?>/g;
    let sheetMatch: RegExpExecArray | null;
    let idx = 1;
    while ((sheetMatch = sheetRegex.exec(workbookXml)) !== null) {
      const attrs = sheetMatch[1];
      const nameMatch = /\bname="([^"]+)"/.exec(attrs);
      const rIdMatch = /\br:id="([^"]+)"/.exec(attrs);
      const name = nameMatch ? unescapeXml(nameMatch[1]) : `Sheet${idx}`;
      const rId = rIdMatch ? rIdMatch[1] : `rId${idx}`;
      const targetPath = relsMap.get(rId) ?? `xl/worksheets/sheet${idx}.xml`;
      sheetMeta.push({ name, path: targetPath });
      idx++;
    }

    if (sheetMeta.length === 0) {
      for (const key of entries.keys()) {
        if (key.startsWith('xl/worksheets/sheet') && key.endsWith('.xml')) {
          sheetMeta.push({ name: `Sheet${sheetMeta.length + 1}`, path: key });
        }
      }
    }

    const sheets: ParsedSheet[] = sheetMeta.map((meta) => {
      const sheetXml = entries.get(meta.path) ?? '';
      const parsed = parseWorksheetXml(sheetXml, sharedStrings);
      return {
        sheetName: meta.name,
        headers: parsed.headers,
        rows: parsed,
      };
    });

    return { fileName, sheets };
  }

  // Fallback for CSV/text files
  const text = new TextDecoder('utf-8').decode(bytes);
  return parseCsvWorkbook(fileName, text);
}
