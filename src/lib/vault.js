/**
 * vault.js - Vault state management (in-memory only, never persisted)
 * Provides a simple module-level store for the session vault state.
 */

// All state is module-level — dies when page reloads, never touches storage.
let _password = null;
let _manifest = null;
let _blobUrls = new Set();
let _favorites = new Set(); // doc IDs pinned for this session
let _lastActivity = Date.now();

export function setVaultSession(password, manifest) {
  _password = password;
  _manifest = manifest;
  _lastActivity = Date.now();
}

export function getPassword() {
  return _password;
}

export function getManifest() {
  return _manifest;
}

export function isUnlocked() {
  return _password !== null && _manifest !== null;
}

export function touchActivity() {
  _lastActivity = Date.now();
}

export function getLastActivity() {
  return _lastActivity;
}

export function registerBlobUrl(url) {
  _blobUrls.add(url);
  return url;
}

export function revokeBlobUrl(url) {
  if (_blobUrls.has(url)) {
    URL.revokeObjectURL(url);
    _blobUrls.delete(url);
  }
}

export function lockVault() {
  _password = null;
  _manifest = null;
  _favorites.clear();
  // Revoke all blob URLs
  for (const url of _blobUrls) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  _blobUrls.clear();
}

export function toggleFavorite(docId) {
  if (_favorites.has(docId)) {
    _favorites.delete(docId);
  } else {
    _favorites.add(docId);
  }
}

export function isFavorite(docId) {
  return _favorites.has(docId);
}

export function getFavorites() {
  return new Set(_favorites);
}

/**
 * Flatten all documents from manifest for search
 */
export function getAllDocuments() {
  if (!_manifest) return [];
  const docs = [];
  for (const domain of _manifest.domains) {
    for (const doc of domain.documents) {
      docs.push({ ...doc, domainId: domain.id, domainTitle: domain.title });
    }
  }
  return docs;
}

/**
 * Get expiry status for a document
 * Returns: null | { daysLeft: number, status: 'ok' | 'warning' | 'expired' }
 */
export function getExpiryStatus(doc) {
  if (!doc.expiry) return null;
  const expiry = new Date(doc.expiry);
  const now = new Date();
  const daysLeft = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { daysLeft, status: 'expired', expiryDate: doc.expiry };
  if (daysLeft <= 30) return { daysLeft, status: 'warning', expiryDate: doc.expiry };
  return { daysLeft, status: 'ok', expiryDate: doc.expiry };
}
