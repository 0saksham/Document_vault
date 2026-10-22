/**
 * zip.js - In-memory ZIP builder (pure JS, no external library needed for simple use)
 * Builds a ZIP file in memory using the DEFLATE-less STORED method for simplicity
 * and to avoid requiring a WASM/native dependency at runtime.
 * Files are written uncompressed — encryption is the security layer, not compression.
 */

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })());
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function writeUint16LE(view, offset, val) { view.setUint16(offset, val, true); }
function writeUint32LE(view, offset, val) { view.setUint32(offset, val, true); }

function dosDate() {
  const d = new Date();
  return ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
}
function dosTime() {
  const d = new Date();
  return (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
}

/**
 * Build a ZIP ArrayBuffer from an array of { name: string, data: ArrayBuffer }
 */
export function buildZip(files) {
  const enc = new TextEncoder();
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const data = new Uint8Array(file.data);
    const crc = crc32(data);
    const size = data.length;

    // Local file header (30 bytes + name)
    const localHeader = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(localHeader);
    writeUint32LE(lv, 0, 0x04034B50);  // signature
    writeUint16LE(lv, 4, 20);           // version needed
    writeUint16LE(lv, 6, 0);            // flags
    writeUint16LE(lv, 8, 0);            // compression = STORED
    writeUint16LE(lv, 10, dosTime());
    writeUint16LE(lv, 12, dosDate());
    writeUint32LE(lv, 14, crc);
    writeUint32LE(lv, 18, size);        // compressed size
    writeUint32LE(lv, 22, size);        // uncompressed size
    writeUint16LE(lv, 26, nameBytes.length);
    writeUint16LE(lv, 28, 0);           // extra field length
    new Uint8Array(localHeader).set(nameBytes, 30);

    localHeaders.push({ header: localHeader, data: file.data, offset });

    // Central directory entry (46 bytes + name)
    const central = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(central);
    writeUint32LE(cv, 0, 0x02014B50);  // central dir signature
    writeUint16LE(cv, 4, 20);           // version made by
    writeUint16LE(cv, 6, 20);           // version needed
    writeUint16LE(cv, 8, 0);            // flags
    writeUint16LE(cv, 10, 0);           // compression
    writeUint16LE(cv, 12, dosTime());
    writeUint16LE(cv, 14, dosDate());
    writeUint32LE(cv, 16, crc);
    writeUint32LE(cv, 20, size);
    writeUint32LE(cv, 24, size);
    writeUint16LE(cv, 28, nameBytes.length);
    writeUint16LE(cv, 30, 0);           // extra length
    writeUint16LE(cv, 32, 0);           // comment length
    writeUint16LE(cv, 34, 0);           // disk start
    writeUint16LE(cv, 36, 0);           // internal attributes
    writeUint32LE(cv, 38, 0);           // external attributes
    writeUint32LE(cv, 42, offset);      // local header offset
    new Uint8Array(central).set(nameBytes, 46);
    centralHeaders.push(central);

    offset += 30 + nameBytes.length + size;
  }

  // End of central directory
  const cdOffset = offset;
  const cdSize = centralHeaders.reduce((sum, h) => sum + h.byteLength, 0);
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  writeUint32LE(ev, 0, 0x06054B50);  // end of central dir signature
  writeUint16LE(ev, 4, 0);            // disk number
  writeUint16LE(ev, 6, 0);            // disk with central dir
  writeUint16LE(ev, 8, files.length);
  writeUint16LE(ev, 10, files.length);
  writeUint32LE(ev, 12, cdSize);
  writeUint32LE(ev, 16, cdOffset);
  writeUint16LE(ev, 20, 0);           // comment length

  // Concatenate all buffers
  const totalSize = offset + cdSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;

  for (const { header, data } of localHeaders) {
    result.set(new Uint8Array(header), pos); pos += header.byteLength;
    result.set(new Uint8Array(data), pos); pos += data.byteLength;
  }
  for (const c of centralHeaders) {
    result.set(new Uint8Array(c), pos); pos += c.byteLength;
  }
  result.set(new Uint8Array(eocd), pos);

  return result.buffer;
}
