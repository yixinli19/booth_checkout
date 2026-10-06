/**
 * Pure TypeScript, zero-dependency, offline-first ISO/IEC 18004 QR Code Generator.
 * Generates phone-scannable QR matrices and SVG strings completely client-side.
 */

interface QrVersionSpec {
  version: number;
  size: number;
  ecCodewordsPerBlock: number;
  g1Blocks: number;
  g1DataCodewords: number;
  g2Blocks: number;
  g2DataCodewords: number;
  alignmentCenters: number[];
}

// ISO/IEC 18004 EC Level L specifications for Versions 1-10
const VERSION_SPECS: QrVersionSpec[] = [
  { version: 1, size: 21, ecCodewordsPerBlock: 7, g1Blocks: 1, g1DataCodewords: 19, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [] },
  { version: 2, size: 25, ecCodewordsPerBlock: 10, g1Blocks: 1, g1DataCodewords: 34, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 18] },
  { version: 3, size: 29, ecCodewordsPerBlock: 15, g1Blocks: 1, g1DataCodewords: 55, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 22] },
  { version: 4, size: 33, ecCodewordsPerBlock: 20, g1Blocks: 1, g1DataCodewords: 80, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 26] },
  { version: 5, size: 37, ecCodewordsPerBlock: 26, g1Blocks: 1, g1DataCodewords: 108, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 30] },
  { version: 6, size: 41, ecCodewordsPerBlock: 18, g1Blocks: 2, g1DataCodewords: 68, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 34] },
  { version: 7, size: 45, ecCodewordsPerBlock: 20, g1Blocks: 2, g1DataCodewords: 78, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 22, 38] },
  { version: 8, size: 49, ecCodewordsPerBlock: 24, g1Blocks: 2, g1DataCodewords: 97, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 24, 42] },
  { version: 9, size: 53, ecCodewordsPerBlock: 30, g1Blocks: 2, g1DataCodewords: 116, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 26, 46] },
  { version: 10, size: 57, ecCodewordsPerBlock: 18, g1Blocks: 2, g1DataCodewords: 68, g2Blocks: 2, g2DataCodewords: 69, alignmentCenters: [6, 28, 50] },
];

// GF(256) log/exp tables with primitive polynomial 0x11D
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomon(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = buildGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

export interface QrMatrixResult {
  version: number;
  size: number;
  modules: boolean[][];
  encodedText: string;
}

export function generateQrMatrix(text: string): QrMatrixResult {
  const utf8Bytes = new TextEncoder().encode(text);

  // Pick smallest version that fits utf8Bytes in Byte mode
  let spec = VERSION_SPECS[VERSION_SPECS.length - 1];
  for (const candidate of VERSION_SPECS) {
    const totalDataCap =
      candidate.g1Blocks * candidate.g1DataCodewords +
      candidate.g2Blocks * candidate.g2DataCodewords;
    const headerBits = candidate.version <= 9 ? 4 + 8 : 4 + 16;
    const maxBytes = Math.floor((totalDataCap * 8 - headerBits) / 8);
    if (utf8Bytes.length <= maxBytes) {
      spec = candidate;
      break;
    }
  }

  const totalDataCodewords =
    spec.g1Blocks * spec.g1DataCodewords + spec.g2Blocks * spec.g2DataCodewords;

  // Build bit stream: Mode 0100 (Byte), char count, payload bytes, terminator, pad
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  pushBits(0b0100, 4);
  const countBits = spec.version <= 9 ? 8 : 16;
  const payloadBytes =
    utf8Bytes.length <= totalDataCodewords - 2
      ? utf8Bytes
      : utf8Bytes.slice(0, totalDataCodewords - 3);
  pushBits(payloadBytes.length, countBits);

  for (const byte of payloadBytes) {
    pushBits(byte, 8);
  }

  // Terminator up to 4 zero bits
  const maxBits = totalDataCodewords * 8;
  const terminatorLen = Math.min(4, maxBits - bits.length);
  pushBits(0, terminatorLen);

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const dataCodewords = new Uint8Array(totalDataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[i * 8 + b];
    }
    dataCodewords[i] = byte;
  }

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  for (let i = bits.length / 8; i < totalDataCodewords; i++) {
    dataCodewords[i] = padBytes[padIdx % 2];
    padIdx++;
  }

  // Split into blocks and compute EC
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let b = 0; b < spec.g1Blocks; b++) {
    const block = dataCodewords.slice(offset, offset + spec.g1DataCodewords);
    offset += spec.g1DataCodewords;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomon(block, spec.ecCodewordsPerBlock));
  }
  for (let b = 0; b < spec.g2Blocks; b++) {
    const block = dataCodewords.slice(offset, offset + spec.g2DataCodewords);
    offset += spec.g2DataCodewords;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomon(block, spec.ecCodewordsPerBlock));
  }

  // Interleave data and EC codewords
  const interleaved: number[] = [];
  const maxDataLen = Math.max(spec.g1DataCodewords, spec.g2DataCodewords);
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) {
        interleaved.push(block[i]);
      }
    }
  }
  for (let i = 0; i < spec.ecCodewordsPerBlock; i++) {
    for (const block of ecBlocks) {
      interleaved.push(block[i]);
    }
  }

  // Construct matrix
  const size = spec.size;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false)
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false)
  );

  const setFunctionModule = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = dark;
      isFunction[r][c] = true;
    }
  };

  // Finder patterns + separators
  const drawFinder = (topR: number, leftC: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = topR + dr;
        const c = leftC + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunctionModule(r, c, inOuter && (onBorder || inCenter));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const centers = spec.alignmentCenters;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      ) {
        continue; // Overlaps finder
      }
      const cr = centers[i];
      const cc = centers[j];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunctionModule(cr + dr, cc + dc, dist !== 1);
        }
      }
    }
  }

  // Dark module and reserved format areas
  setFunctionModule(4 * spec.version + 9, 8, true);

  for (let i = 0; i <= 8; i++) {
    if (!isFunction[8][i]) setFunctionModule(8, i, false);
    if (!isFunction[i][8]) setFunctionModule(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
    if (!isFunction[size - 1 - i][8]) setFunctionModule(size - 1 - i, 8, false);
  }

  // Version information for V >= 7
  if (spec.version >= 7) {
    let rem = spec.version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const verBits = (spec.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((verBits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunctionModule(a, b, bit);
      setFunctionModule(b, a, bit);
    }
  }

  // Place data bits in upward/downward 2-column zig-zag
  let bitIdx = 0;
  const totalBits = interleaved.length * 8;
  let upward = true;

  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5; // Skip vertical timing pattern
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let dc = 0; dc < 2; dc++) {
        const c = rightCol - dc;
        if (!isFunction[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            const byte = interleaved[Math.floor(bitIdx / 8)];
            dark = ((byte >>> (7 - (bitIdx % 8))) & 1) !== 0;
            bitIdx++;
          }
          // Apply Mask 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) {
            dark = !dark;
          }
          modules[r][c] = dark;
        }
      }
    }
    upward = !upward;
  }

  // Draw Format Info for EC Level L (01) and Mask 0 (000) => 0x77c4
  const formatBits = 0x77c4;
  for (let i = 0; i <= 5; i++) setFunctionModule(8, i, ((formatBits >>> i) & 1) !== 0);
  setFunctionModule(8, 7, ((formatBits >>> 6) & 1) !== 0);
  setFunctionModule(8, 8, ((formatBits >>> 7) & 1) !== 0);
  setFunctionModule(7, 8, ((formatBits >>> 8) & 1) !== 0);
  for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, ((formatBits >>> i) & 1) !== 0);

  for (let i = 0; i < 8; i++) {
    setFunctionModule(8, size - 1 - i, ((formatBits >>> i) & 1) !== 0);
  }
  for (let i = 8; i < 15; i++) {
    setFunctionModule(size - 15 + i, 8, ((formatBits >>> i) & 1) !== 0);
  }

  return {
    version: spec.version,
    size,
    modules,
    encodedText: text,
  };
}

export function generateQrSvgString(text: string, quietZone = 3): string {
  const matrix = generateQrMatrix(text);
  const totalSize = matrix.size + quietZone * 2;
  const rects: string[] = [];

  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.modules[r][c]) {
        rects.push(`<rect x="${c + quietZone}" y="${r + quietZone}" width="1" height="1" />`);
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" shape-rendering="crispEdges" role="img" aria-label="Payment QR Code">`,
    `<rect width="${totalSize}" height="${totalSize}" fill="#ffffff" />`,
    `<g fill="#0f172a">${rects.join('')}</g>`,
    `</svg>`,
  ].join('');
}
