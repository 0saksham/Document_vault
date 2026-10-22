#!/usr/bin/env node
/**
 * check-secrets.mjs - Pre-commit and pre-build security & secrets safety check
 *
 * Verifies that:
 * 1. .gitignore properly ignores data/, vault-data.json, and vault-map.json
 * 2. At runtime, reads real values from local vault-data.json and file names from vault-map.json,
 *    and FAILS if any of those values appear in any tracked file, in README, in templates, in src, or in dist/.
 *    CRITICAL: It prints ONLY the file path where a violation was found, NEVER the secret value.
 * 3. public/vault/ contains ONLY .enc ciphertext files (no plaintext documents or JSON)
 * 4. No unencrypted document files (PDFs, doc files) exist in src/, public/, or dist/
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const violations = [];

// 1. Verify .gitignore rules
const gitignorePath = path.join(ROOT, '.gitignore');
if (!fs.existsSync(gitignorePath)) {
  violations.push('Missing .gitignore file at repository root');
} else {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  const requiredIgnores = ['data/', 'vault-data.json', 'vault-map.json'];
  for (const req of requiredIgnores) {
    if (!gitignoreContent.includes(req)) {
      violations.push(`.gitignore must include "${req}" to prevent accidental commits`);
    }
  }
}

// 2. Read real secrets from vault-data.json (if exists)
const secretsToFind = new Set();
const vaultDataPath = path.join(ROOT, 'vault-data.json');
if (fs.existsSync(vaultDataPath)) {
  try {
    const vaultData = JSON.parse(fs.readFileSync(vaultDataPath, 'utf8'));
    function extractStrings(obj) {
      if (!obj || typeof obj !== 'object') return;
      for (const [key, val] of Object.entries(obj)) {
        if (key === '_comment') continue;
        if (typeof val === 'string' && val.trim().length >= 2) {
          secretsToFind.add(val.trim());
        } else if (typeof val === 'object' && val !== null) {
          extractStrings(val);
        }
      }
    }
    extractStrings(vaultData);
  } catch {}
}

// 3. Read real file paths and file names from vault-map.json (if exists)
const fileNamesToFind = new Set();
const vaultMapPath = path.join(ROOT, 'vault-map.json');
if (fs.existsSync(vaultMapPath)) {
  try {
    const vaultMap = JSON.parse(fs.readFileSync(vaultMapPath, 'utf8'));
    for (const [key, val] of Object.entries(vaultMap)) {
      if (typeof val === 'string' && val.trim().length > 0) {
        const trimmed = val.trim();
        fileNamesToFind.add(trimmed); // full relative path, e.g. "Identity proof/aadhar.pdf"
        const base = path.basename(trimmed);
        if (base && base.length >= 4) {
          fileNamesToFind.add(base); // filename, e.g. "aadhar.pdf"
        }
      }
    }
  } catch {}
}

// 4. Collect target files to inspect
const targetFiles = new Set();

// README.md
const readmePath = path.join(ROOT, 'README.md');
if (fs.existsSync(readmePath)) targetFiles.add(readmePath);

// Helper to recursively collect files
function collectFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full);
    } else {
      targetFiles.add(full);
    }
  }
}

collectFiles(path.join(ROOT, 'templates'));
collectFiles(path.join(ROOT, 'src'));
collectFiles(path.join(ROOT, 'dist'));

// Tracked files in git
try {
  const tracked = execSync('git ls-files', { encoding: 'utf8', cwd: ROOT, stdio: ['pipe', 'pipe', 'ignore'] })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  for (const f of tracked) {
    targetFiles.add(path.join(ROOT, f));
  }
} catch {}

// 5. Inspect target files for secret values & file names
// Note: We MUST NOT print the secret values found, ONLY the file path.
for (const filePath of targetFiles) {
  if (!fs.existsSync(filePath)) continue;

  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  // Skip git-ignored configuration files themselves (they exist locally by design)
  if (rel === 'vault-data.json' || rel === 'vault-map.json') continue;
  if (rel === 'package-lock.json') continue;
  if (rel.startsWith('scripts/')) continue;
  if (rel.startsWith('data/')) continue;
  // Skip binary/encrypted vault files in public/vault and dist/vault, and pdfjs library assets
  if ((rel.startsWith('public/vault/') || rel.startsWith('dist/vault/')) && rel.endsWith('.enc')) continue;
  if (rel.startsWith('public/pdfjs/') || rel.startsWith('dist/pdfjs/')) continue;
  if (rel.startsWith('.git/')) continue;
  if (rel.startsWith('node_modules/')) continue;

  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    continue; // binary file
  }

  // Check secrets from vault-data.json
  let hasSecret = false;
  for (const secret of secretsToFind) {
    if (content.includes(secret)) {
      hasSecret = true;
      break;
    }
  }
  if (hasSecret) {
    violations.push(`Sensitive personal secret detected in: ${rel}`);
  }

  // Check file names from vault-map.json
  let hasFileName = false;
  for (const fname of fileNamesToFind) {
    if (content.includes(fname)) {
      hasFileName = true;
      break;
    }
  }
  if (hasFileName) {
    violations.push(`Source document file name or path detected in: ${rel}`);
  }
}

// 6. Check public/vault directory (must only contain .enc files)
const vaultDir = path.join(ROOT, 'public', 'vault');
if (fs.existsSync(vaultDir)) {
  const files = fs.readdirSync(vaultDir);
  for (const f of files) {
    if (!f.endsWith('.enc')) {
      violations.push(`Unencrypted / non-.enc file found in public/vault: ${f}`);
    }
  }
}

// 7. Check that no unencrypted document files (.pdf, .doc) exist in src/, public/, or dist/
const DOCUMENT_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx)$/i;
function scanForDocs(dir, dirName) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'vault') scanForDocs(full, dirName);
    } else {
      if (DOCUMENT_EXTENSIONS.test(entry.name)) {
        violations.push(`Plain document file found in ${dirName}: ${path.relative(ROOT, full).replace(/\\/g, '/')}`);
      }
    }
  }
}
scanForDocs(path.join(ROOT, 'src'), 'src/');
scanForDocs(path.join(ROOT, 'public'), 'public/');
if (fs.existsSync(path.join(ROOT, 'dist'))) {
  scanForDocs(path.join(ROOT, 'dist'), 'dist/');
}

// Report results (WITHOUT printing secret values, ONLY file paths)
if (violations.length > 0) {
  console.error('\n🚨 SECRETS SAFETY CHECK FAILED:');
  for (const v of violations) {
    console.error(`   ❌ ${v}`);
  }
  console.error('\n⛔ Plain documents and secrets must never be committed or included in the build.');
  console.error('   Fix the issues listed above before proceeding.\n');
  process.exit(1);
} else {
  console.log('✅ Secrets safety check passed — no plain documents or tracked secrets detected.');
}
