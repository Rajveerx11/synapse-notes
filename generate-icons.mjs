import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, drawFn) {
  // RGBA buffer
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }

  // Scanlines with filter byte 0
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    scanlines[y * (width * 4 + 1)] = 0; // Filter: None
    rgba.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(scanlines);

  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bit depth
  ihdrData[9] = 6; // Color type: RGBA
  ihdrData[10] = 0; // Compression: Deflate
  ihdrData[11] = 0; // Filter: Adaptive
  ihdrData[12] = 0; // Interlace: None
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  typeBuf.copy(chunk, 4);
  data.copy(chunk, 8);

  const crc = crc32(Buffer.concat([typeBuf, data]));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    crc = crc ^ byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Synapse Notes icon drawing function
function drawSynapseIcon(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;

  // Rounded rectangle check
  const r = 0.22;
  const inRoundBox = (nx >= r || ny >= r) && 
                     (nx <= 1 - r || ny >= r) && 
                     (nx >= r || ny <= 1 - r) && 
                     (nx <= 1 - r || ny <= 1 - r);
  
  const cornerDist = (cx, cy) => Math.hypot(nx - cx, ny - cy);
  const inTopLeft = nx < r && ny < r ? cornerDist(r, r) <= r : true;
  const inTopRight = nx > 1 - r && ny < r ? cornerDist(1 - r, r) <= r : true;
  const inBottomLeft = nx < r && ny > 1 - r ? cornerDist(r, 1 - r) <= r : true;
  const inBottomRight = nx > 1 - r && ny > 1 - r ? cornerDist(1 - r, 1 - r) <= r : true;

  if (!inRoundBox || !inTopLeft || !inTopRight || !inBottomLeft || !inBottomRight) {
    return [0, 0, 0, 0]; // Transparent outside
  }

  // Accent Blue #2D6EF6 -> [45, 110, 246]
  let rColor = 45, gColor = 110, bColor = 246;

  // Inner lines (white note lines)
  // Line 1: y around 0.32, x from 0.28 to 0.72
  if (ny >= 0.30 && ny <= 0.36 && nx >= 0.28 && nx <= 0.72) {
    return [255, 255, 255, 255];
  }
  // Line 2: y around 0.48, x from 0.28 to 0.58
  if (ny >= 0.46 && ny <= 0.52 && nx >= 0.28 && nx <= 0.58) {
    return [255, 255, 255, 255];
  }
  // Line 3: y around 0.64, x from 0.28 to 0.68
  if (ny >= 0.62 && ny <= 0.68 && nx >= 0.28 && nx <= 0.68) {
    return [255, 255, 255, 255];
  }
  // Pen tip / Sparkle dot at (0.72, 0.65)
  if (Math.hypot(nx - 0.74, ny - 0.65) <= 0.08) {
    return [255, 255, 255, 255];
  }

  return [rColor, gColor, bColor, 255];
}

const iconsDir = path.resolve('./public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate icon-192.png
const png192 = createPNG(192, 192, drawSynapseIcon);
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), png192);

// Generate icon-512.png
const png512 = createPNG(512, 512, drawSynapseIcon);
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), png512);

// Generate favicon.ico / favicon.png
const png32 = createPNG(32, 32, drawSynapseIcon);
fs.writeFileSync(path.resolve('./public/favicon.ico'), png32);
fs.writeFileSync(path.resolve('./public/favicon.png'), png32);

console.log('✅ Generated favicon.ico, icon-192.png, icon-512.png successfully!');
