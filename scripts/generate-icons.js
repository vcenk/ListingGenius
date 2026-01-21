#!/usr/bin/env node

/**
 * Generate simple PNG icons for the Chrome extension
 * These are basic colored square icons with a gradient effect
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Icon sizes needed
const SIZES = [16, 48, 128];

// Colors
const PRIMARY_COLOR = [99, 102, 241]; // #6366f1
const DARKER_COLOR = [79, 70, 229];   // #4f46e5

/**
 * Create PNG file data
 */
function createPNG(width, height, getPixel) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk (image header)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);  // bit depth
  ihdrData.writeUInt8(6, 9);  // color type (RGBA)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk (image data)
  const rawData = Buffer.alloc(height * (1 + width * 4));

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawData[rowStart] = 0; // filter type: none

    for (let x = 0; x < width; x++) {
      const pixelStart = rowStart + 1 + x * 4;
      const [r, g, b, a] = getPixel(x, y, width, height);
      rawData[pixelStart] = r;
      rawData[pixelStart + 1] = g;
      rawData[pixelStart + 2] = b;
      rawData[pixelStart + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Create a PNG chunk
 */
function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typeBuffer = Buffer.from(type);
  const combined = Buffer.concat([typeBuffer, data]);

  const crc = crc32(combined);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

/**
 * CRC32 implementation for PNG
 */
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  CRC_TABLE[n] = c;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Get pixel color for the icon
 * Creates a gradient rocket-themed icon
 */
function getIconPixel(x, y, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) / 2;

  // Distance from center
  const dx = x - centerX;
  const dy = y - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Outside the circle
  if (distance > maxRadius - 1) {
    // Anti-aliasing at edge
    if (distance > maxRadius) {
      return [0, 0, 0, 0]; // Transparent
    }
    const alpha = Math.round((maxRadius - distance) * 255);
    const gradient = (x + y) / (width + height);
    const r = Math.round(PRIMARY_COLOR[0] * (1 - gradient * 0.2) + DARKER_COLOR[0] * gradient * 0.2);
    const g = Math.round(PRIMARY_COLOR[1] * (1 - gradient * 0.2) + DARKER_COLOR[1] * gradient * 0.2);
    const b = Math.round(PRIMARY_COLOR[2] * (1 - gradient * 0.2) + DARKER_COLOR[2] * gradient * 0.2);
    return [r, g, b, alpha];
  }

  // Inside the circle - gradient from top-left to bottom-right
  const gradient = (x + y) / (width + height);
  const r = Math.round(PRIMARY_COLOR[0] * (1 - gradient * 0.3) + DARKER_COLOR[0] * gradient * 0.3);
  const g = Math.round(PRIMARY_COLOR[1] * (1 - gradient * 0.3) + DARKER_COLOR[1] * gradient * 0.3);
  const b = Math.round(PRIMARY_COLOR[2] * (1 - gradient * 0.3) + DARKER_COLOR[2] * gradient * 0.3);

  // Draw a simple "L" letter for ListingGenius
  const letterSize = width * 0.5;
  const letterX = centerX - letterSize / 2;
  const letterY = centerY - letterSize / 2;
  const letterThickness = Math.max(2, width * 0.15);

  // Vertical bar of L
  if (x >= letterX && x < letterX + letterThickness &&
      y >= letterY && y < letterY + letterSize) {
    return [255, 255, 255, 255];
  }

  // Horizontal bar of L
  if (x >= letterX && x < letterX + letterSize * 0.7 &&
      y >= letterY + letterSize - letterThickness && y < letterY + letterSize) {
    return [255, 255, 255, 255];
  }

  // Small sparkle in top-right
  const sparkleX = centerX + maxRadius * 0.5;
  const sparkleY = centerY - maxRadius * 0.5;
  const sparkleDist = Math.sqrt((x - sparkleX) ** 2 + (y - sparkleY) ** 2);
  const sparkleRadius = maxRadius * 0.1;
  if (sparkleDist < sparkleRadius) {
    const sparkleAlpha = Math.round((1 - sparkleDist / sparkleRadius) * 200);
    return [255, 255, 255, sparkleAlpha];
  }

  return [r, g, b, 255];
}

// Generate icons
const iconsDir = path.join(__dirname, '..', 'assets', 'icons');

for (const size of SIZES) {
  const png = createPNG(size, size, getIconPixel);
  const filename = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Generated: ${filename}`);
}

console.log('All icons generated successfully!');
