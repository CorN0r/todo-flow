import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'src-tauri', 'icons');
mkdirSync(iconsDir, { recursive: true });

// CRC32 for PNG chunks
const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcData = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

function createSolidPNG(width, height, r, g, b) {
  // Build raw unfiltered pixel data: filter byte (0) + RGBA pixels per row
  const rowLen = 1 + width * 4;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowLen;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const off = rowStart + 1 + x * 4;
      raw[off] = r;       // R
      raw[off + 1] = g;   // G
      raw[off + 2] = b;   // B
      raw[off + 3] = 255; // A
    }
  }

  const compressed = deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  return Buffer.concat([
    sig,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Colors: indigo #6366f1
const R = 99, G = 102, B = 241;

// Generate solid-color PNGs at required sizes
const sizes = [
  { size: 32, name: '32x32.png' },
  { size: 128, name: '128x128.png' },
  { size: 256, name: '128x128@2x.png' },
];

for (const { size, name } of sizes) {
  const png = createSolidPNG(size, size, R, G, B);
  writeFileSync(join(iconsDir, name), png);
  console.log(`  ${name}: ${png.length} bytes`);
}

// Generate ICO with multiple sizes
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const images = [];
let dataOffset = 6 + 16 * icoSizes.length; // ICO header + directory entries

for (const size of icoSizes) {
  // Create BMP data for ICO entry
  const bmpDataSize = 40 + (size * size * 4); // BITMAPINFOHEADER + pixel data
  const bmpData = Buffer.alloc(bmpDataSize);

  // BITMAPINFOHEADER
  bmpData.writeUInt32LE(40, 0);           // header size
  bmpData.writeInt32LE(size, 4);          // width
  bmpData.writeInt32LE(size * 2, 8);     // height (doubled: image + AND mask)
  bmpData.writeUInt16LE(1, 12);           // planes
  bmpData.writeUInt16LE(32, 14);          // bpp
  bmpData.writeUInt32LE(0, 16);           // BI_RGB
  bmpData.writeUInt32LE(size * size * 4, 20); // image size

  // Pixel data: BGRA, bottom-up
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const off = 40 + (y * size + x) * 4;
      bmpData[off] = B;       // Blue
      bmpData[off + 1] = G;   // Green
      bmpData[off + 2] = R;   // Red
      bmpData[off + 3] = 255; // Alpha
    }
  }

  images.push({
    w: size === 256 ? 0 : size,
    h: size === 256 ? 0 : size,
    size: bmpData.length,
    offset: dataOffset,
    data: bmpData,
  });
  dataOffset += bmpData.length;
}

// ICO header
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(icoSizes.length, 4);

// Directory entries
const dir = Buffer.alloc(16 * icoSizes.length);
for (let i = 0; i < images.length; i++) {
  const off = i * 16;
  dir[off] = images[i].w;
  dir[off + 1] = images[i].h;
  dir[off + 2] = 0;  // color count
  dir[off + 3] = 0;  // reserved
  dir.writeUInt16LE(1, off + 4);  // planes
  dir.writeUInt16LE(32, off + 6); // bpp
  dir.writeUInt32LE(images[i].size, off + 8);
  dir.writeUInt32LE(images[i].offset, off + 12);
}

const ico = Buffer.concat([icoHeader, dir, ...images.map((img) => img.data)]);
writeFileSync(join(iconsDir, 'icon.ico'), ico);
console.log(`  icon.ico: ${ico.length} bytes (${icoSizes.length} sizes)`);

console.log('\nSolid indigo icons generated successfully!');
console.log('Note: Replace with a custom designed icon for production use.');
