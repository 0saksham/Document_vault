/**
 * crypto.js - Browser-side decryption using Web Crypto API
 * Mirrors the encryption format from scripts/encrypt.mjs
 * File format: [MAGIC 4B][version 1B][salt 16B][iterations 4B BE][iv 12B][ciphertext+GCM tag]
 */

const MAGIC = new Uint8Array([0x44, 0x44, 0x56, 0x58]); // 'DDVX'
const HEADER_SIZE = 4 + 1 + 16 + 4 + 12; // magic + version + salt + iterations + iv = 37

export class DecryptionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecryptionError';
  }
}

function checkMagic(buf) {
  for (let i = 0; i < 4; i++) {
    if (buf[i] !== MAGIC[i]) throw new DecryptionError('Invalid file format');
  }
}

function readHeader(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  checkMagic(buf);
  // version = buf[4]
  const salt = buf.slice(5, 21);       // 16 bytes
  const iterView = new DataView(arrayBuffer, 21, 4);
  const iterations = iterView.getUint32(0, false); // big-endian
  const iv = buf.slice(25, 37);        // 12 bytes
  const ciphertext = buf.slice(37);    // rest = ciphertext + 16-byte GCM auth tag
  return { salt, iterations, iv, ciphertext };
}

async function deriveKey(password, salt, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, hash: 'SHA-256', iterations },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

/**
 * Decrypt a single .enc file buffer.
 * Returns the decrypted ArrayBuffer.
 * Throws DecryptionError on wrong password or corrupt data.
 */
export async function decryptBuffer(encryptedArrayBuffer, password) {
  const { salt, iterations, iv, ciphertext } = readHeader(encryptedArrayBuffer);
  const key = await deriveKey(password, salt, iterations);
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return decrypted;
  } catch {
    throw new DecryptionError('Wrong password or corrupted data');
  }
}

/**
 * Decrypt the manifest.enc file and return the parsed manifest object.
 * This is the canonical password-verification step.
 */
export async function decryptManifest(manifestArrayBuffer, password) {
  let decrypted;
  try {
    decrypted = await decryptBuffer(manifestArrayBuffer, password);
  } catch (e) {
    throw new DecryptionError('Wrong password');
  }
  const text = new TextDecoder().decode(decrypted);
  try {
    return JSON.parse(text);
  } catch {
    throw new DecryptionError('Manifest corrupted');
  }
}

/**
 * Fetch and decrypt an .enc file, returning a Blob URL.
 * The caller is responsible for revoking the URL (call revokeObjectURL).
 */
export async function fetchAndDecrypt(fileId, mimeType, password) {
  const url = `/vault/${fileId}.enc`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`File not found: ${fileId}`);
  const encBuf = await response.arrayBuffer();
  const plainBuf = await decryptBuffer(encBuf, password);
  const blob = new Blob([plainBuf], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Fetch and decrypt, returning raw ArrayBuffer (for ZIP building, etc.)
 */
export async function fetchAndDecryptRaw(fileId, password) {
  const url = `/vault/${fileId}.enc`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`File not found: ${fileId}`);
  const encBuf = await response.arrayBuffer();
  return decryptBuffer(encBuf, password);
}
