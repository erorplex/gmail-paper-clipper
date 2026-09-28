// Renders the extension icons (rounded square with a paperclip) as PNGs without dependencies.
// Usage: node scripts/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [15, 118, 110]; // teal
const FG = [255, 255, 255];
const SIZES = [16, 32, 48, 128];
const SAMPLES = 4;

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundedRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function distToSegment(x, y, ax, ay, bx, by) {
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
}

// Paperclip as one wire: straight segments joined by half circles, tilted 45°.
// Everything in unit coordinates (0..1).
const WIRE = 0.06;
const PARTS = [
  { line: [0.43, 0.36, 0.43, 0.62] },
  { arc: [0.5, 0.62, 0.07, 'down'] },
  { line: [0.57, 0.62, 0.57, 0.3] },
  { arc: [0.45, 0.3, 0.12, 'up'] },
  { line: [0.33, 0.3, 0.33, 0.66] },
  { arc: [0.5, 0.66, 0.17, 'down'] },
  { line: [0.67, 0.66, 0.67, 0.26] },
];

function distToArc(x, y, cx, cy, r, side) {
  const onSide = side === 'down' ? y >= cy : y <= cy;
  if (onSide) return Math.abs(Math.hypot(x - cx, y - cy) - r);
  return Math.min(Math.hypot(x - (cx - r), y - cy), Math.hypot(x - (cx + r), y - cy));
}

function sample(x, y) {
  if (!insideRoundedRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.22)) return null;
  const a = Math.PI / 4;
  const rx = 0.5 + (x - 0.5) * Math.cos(a) + (y - 0.5) * Math.sin(a);
  const ry = 0.5 - (x - 0.5) * Math.sin(a) + (y - 0.5) * Math.cos(a);
  const d = Math.min(
    ...PARTS.map((p) => (p.line ? distToSegment(rx, ry, ...p.line) : distToArc(rx, ry, ...p.arc)))
  );
  return d <= WIRE / 2 ? FG : BG;
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const color = sample((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size);
          if (!color) continue;
          acc[0] += color[0];
          acc[1] += color[1];
          acc[2] += color[2];
          acc[3] += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (acc[3]) {
        rgba[i] = Math.round(acc[0] / acc[3]);
        rgba[i + 1] = Math.round(acc[1] / acc[3]);
        rgba[i + 2] = Math.round(acc[2] / acc[3]);
      }
      rgba[i + 3] = Math.round((acc[3] / SAMPLES ** 2) * 255);
    }
  }
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png(size, rgba));
}
console.log(`icons written to ${outDir}`);
