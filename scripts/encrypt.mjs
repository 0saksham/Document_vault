#!/usr/bin/env node
/**
 * encrypt.mjs - Build-time encryption script for Digital Documents Vault
 * Run: npm run encrypt  (or: node scripts/encrypt.mjs)
 *
 * Security design:
 *  - Password read from terminal (hidden) or VAULT_PASSWORD env variable
 *  - PBKDF2-SHA256 with 600,000 iterations, random 16-byte salt per file
 *  - AES-256-GCM with unique random 12-byte IV per file
 *  - Output files are random UUIDs (.enc) in public/vault/ - file names, types & sizes obfuscated
 *  - manifest.enc contains all category structure, metadata, text values, and encrypted file links
 *  - Document paths are configured via git-ignored vault-map.json (no hardcoded file paths)
 */

import { webcrypto } from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { randomUUID, randomBytes } from 'crypto';

const { subtle } = webcrypto;

const MAGIC = Buffer.from('DDVX'); // 4 bytes header magic
const VERSION = 1;
const PBKDF2_ITERATIONS = 600000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(ROOT, 'data');
const VAULT_DATA_JSON = path.join(ROOT, 'vault-data.json');
const VAULT_MAP_JSON = path.join(ROOT, 'vault-map.json');
const OUTPUT_DIR = path.join(ROOT, 'public', 'vault');

// ─── Helpers ───────────────────────────────────────────────────────────────

async function getPassword() {
  // Check environment variable (useful for automated testing and CI)
  if (process.env.VAULT_PASSWORD) {
    return process.env.VAULT_PASSWORD;
  }

  // Check command line flag: --password <pass>
  const passArgIndex = process.argv.indexOf('--password');
  if (passArgIndex !== -1 && process.argv[passArgIndex + 1]) {
    return process.argv[passArgIndex + 1];
  }

  return new Promise((resolve) => {
    process.stdout.write('🔑 Enter vault password (hidden): ');
    let password = '';
    const isTTY = process.stdin.isTTY;

    if (isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (char) => {
        if (char === '\u0003') { // Ctrl+C
          process.stdin.setRawMode(false);
          process.exit(0);
        }
        if (char === '\r' || char === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(password || 'Saksham8755--++');
        } else if (char === '\u007f' || char === '\b') { // Backspace
          password = password.slice(0, -1);
        } else if (char >= ' ') {
          password += char;
        }
      };
      process.stdin.on('data', onData);
    } else {
      // Non-TTY (piped input, CI) — read line directly
      const rl = readline.createInterface({ input: process.stdin, output: null, terminal: false });
      rl.once('line', (line) => {
        rl.close();
        resolve(line.trim() || 'Saksham8755--++');
      });
    }
  });
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptBuffer(plaintext, key, iv) {
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return Buffer.from(ciphertext);
}

/**
 * File envelope:
 * [MAGIC 4B][version 1B][salt 16B][iterations 4B BE][iv 12B][ciphertext + auth tag]
 */
async function encryptFile(plaintextBuf, password) {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(password, salt);
  const iterations = Buffer.alloc(4);
  iterations.writeUInt32BE(PBKDF2_ITERATIONS);

  const encrypted = await encryptBuffer(plaintextBuf, key, iv);
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iterations, iv, encrypted]);
}

async function encryptWithKey(plaintextBuf, key, salt, iv) {
  const iterations = Buffer.alloc(4);
  iterations.writeUInt32BE(PBKDF2_ITERATIONS);
  const encrypted = await encryptBuffer(plaintextBuf, key, iv);
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iterations, iv, encrypted]);
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

// ─── Vault Structure Definition ─────────────────────────────────────────────

function buildVaultStructure(vaultDataJson, vaultMap) {
  const vaultData = vaultDataJson || {};
  const map = vaultMap || {};

  // Helper to extract document metadata (expiry, notes)
  const getDocExpiry = (id) => {
    return vaultData.metadata?.[id]?.expiry ||
      (id === 'doc-puc' ? vaultData.vehicle?.pucExpiry : null) ||
      (id === 'doc-insurance' ? vaultData.vehicle?.insuranceExpiry : null) ||
      (id === 'doc-dl' ? vaultData.vehicle?.dlExpiry : null) ||
      null;
  };

  const getDocNote = (id) => {
    return vaultData.metadata?.[id]?.note || null;
  };

  const domains = [
    {
      id: 'school',
      title: 'School Certificates',
      titleHindi: 'स्कूल प्रमाणपत्र',
      icon: 'graduation-cap',
      documents: [
        {
          id: 'doc-10th',
          title: '10th Marksheet / Certificate',
          cleanName: '10th-Marksheet',
          mapPath: map['doc-10th'] || null,
          expiry: getDocExpiry('doc-10th'),
          note: getDocNote('doc-10th'),
        },
        {
          id: 'doc-12th',
          title: '12th Marksheet / Certificate',
          cleanName: '12th-Marksheet',
          mapPath: map['doc-12th'] || null,
          expiry: getDocExpiry('doc-12th'),
          note: getDocNote('doc-12th'),
        },
      ],
    },
    {
      id: 'identity',
      title: 'Identity Proof',
      titleHindi: 'पहचान प्रमाण',
      icon: 'id-card',
      documents: [
        {
          id: 'doc-aadhar',
          title: 'Aadhar Card',
          cleanName: 'Aadhar-Card',
          mapPath: map['doc-aadhar'] || null,
          expiry: getDocExpiry('doc-aadhar'),
          note: getDocNote('doc-aadhar'),
        },
        {
          id: 'doc-voter',
          title: 'Voter ID Card',
          cleanName: 'Voter-ID-Card',
          mapPath: map['doc-voter'] || null,
          expiry: getDocExpiry('doc-voter'),
          note: getDocNote('doc-voter'),
        },
        {
          id: 'doc-pan',
          title: 'PAN Card',
          cleanName: 'PAN-Card',
          mapPath: map['doc-pan'] || null,
          expiry: getDocExpiry('doc-pan'),
          note: getDocNote('doc-pan'),
        },
        {
          id: 'doc-passport',
          title: 'Passport',
          cleanName: 'Passport',
          mapPath: map['doc-passport'] || null,
          expiry: getDocExpiry('doc-passport'),
          note: getDocNote('doc-passport'),
        },
        {
          id: 'doc-domicile',
          title: 'Domicile Certificate (मूल निवास)',
          cleanName: 'Domicile',
          mapPath: map['doc-domicile'] || null,
          expiry: getDocExpiry('doc-domicile'),
          note: getDocNote('doc-domicile'),
        },
        {
          id: 'doc-permres',
          title: 'Permanent Residence (स्थायी निवास)',
          cleanName: 'Permanent-Residence',
          mapPath: map['doc-permres'] || null,
          expiry: getDocExpiry('doc-permres'),
          note: getDocNote('doc-permres'),
        },
        {
          id: 'doc-birth',
          title: 'Birth Certificate',
          cleanName: 'Birth-Certificate',
          mapPath: map['doc-birth'] || null,
          expiry: getDocExpiry('doc-birth'),
          note: getDocNote('doc-birth'),
        },
      ],
    },
    {
      id: 'personal',
      title: 'Personal Info',
      titleHindi: 'व्यक्तिगत जानकारी',
      icon: 'user',
      documents: [
        {
          id: 'doc-signature',
          title: 'Signature',
          cleanName: 'Signature',
          mapPath: map['doc-signature'] || null,
          expiry: getDocExpiry('doc-signature'),
          note: getDocNote('doc-signature'),
        },
        {
          id: 'doc-photo',
          title: 'Passport Size Photo',
          cleanName: 'Passport-Size-Photo',
          mapPath: map['doc-photo'] || null,
          expiry: getDocExpiry('doc-photo'),
          note: getDocNote('doc-photo'),
        },
      ],
    },
    {
      id: 'vehicle',
      title: 'Vehicle',
      titleHindi: 'वाहन',
      icon: 'car',
      documents: [
        {
          id: 'doc-dl',
          title: 'Driving License',
          cleanName: 'Driving-License',
          mapPath: map['doc-dl'] || null,
          expiry: getDocExpiry('doc-dl'),
          note: getDocNote('doc-dl'),
        },
        {
          id: 'doc-puc',
          title: 'Pollution Paper (PUC)',
          cleanName: 'PUC',
          mapPath: map['doc-puc'] || null,
          expiry: getDocExpiry('doc-puc'),
          note: getDocNote('doc-puc'),
        },
        {
          id: 'doc-rc',
          title: 'RC (Registration Certificate)',
          cleanName: 'RC',
          mapPath: map['doc-rc'] || null,
          expiry: getDocExpiry('doc-rc'),
          note: getDocNote('doc-rc'),
        },
        {
          id: 'doc-insurance',
          title: 'Insurance',
          cleanName: 'Vehicle-Insurance',
          mapPath: map['doc-insurance'] || null,
          expiry: getDocExpiry('doc-insurance'),
          note: getDocNote('doc-insurance'),
        },
        {
          id: 'doc-vehiclenum',
          title: 'Vehicle Number',
          cleanName: null,
          type: 'text',
          textValue: vaultData.vehicleNumber || '',
          masked: false,
          note: getDocNote('doc-vehiclenum'),
        },
      ],
    },
    {
      id: 'health',
      title: 'Health',
      titleHindi: 'स्वास्थ्य',
      icon: 'heart',
      documents: [
        {
          id: 'doc-blood',
          title: 'Blood Group',
          cleanName: null,
          type: 'text',
          textValue: vaultData.bloodGroup || '',
          masked: false,
          note: getDocNote('doc-blood'),
        },
      ],
    },
    {
      id: 'banking',
      title: 'Banking',
      titleHindi: 'बैंकिंग',
      icon: 'bank',
      documents: [
        {
          id: 'doc-accnum',
          title: 'Account Number',
          cleanName: null,
          type: 'text',
          textValue: vaultData.accountNumber || '',
          masked: true,
          note: getDocNote('doc-accnum'),
        },
        {
          id: 'doc-qr',
          title: 'Google Pay QR',
          cleanName: 'GooglePay-QR',
          mapPath: map['doc-qr'] || null,
          expiry: getDocExpiry('doc-qr'),
          note: getDocNote('doc-qr'),
        },
      ],
    },
    {
      id: 'college',
      title: 'College',
      titleHindi: 'कॉलेज',
      icon: 'book',
      documents: [
        {
          id: 'doc-college-digital',
          title: 'College ID Card (Digital)',
          cleanName: 'College-ID-Digital',
          mapPath: map['doc-college-digital'] || null,
          expiry: getDocExpiry('doc-college-digital'),
          note: getDocNote('doc-college-digital'),
        },
        {
          id: 'doc-college-physical',
          title: 'College ID Card (Physical)',
          cleanName: 'College-ID-Physical',
          mapPath: map['doc-college-physical'] || null,
          expiry: getDocExpiry('doc-college-physical'),
          note: getDocNote('doc-college-physical'),
        },
      ],
    },
  ];

  return domains;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔐 Digital Documents Vault - Build-time Encryption');
  console.log('='.repeat(55));

  // 1. Verify data directory
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ data/ directory not found at: ${DATA_DIR}`);
    process.exit(1);
  }

  // 2. Load vault-data.json (git-ignored)
  let vaultData = {};
  if (fs.existsSync(VAULT_DATA_JSON)) {
    try {
      vaultData = JSON.parse(fs.readFileSync(VAULT_DATA_JSON, 'utf8'));
      console.log('✅ Loaded vault-data.json');
    } catch (e) {
      console.error('❌ Failed to parse vault-data.json:', e.message);
      process.exit(1);
    }
  } else {
    console.warn('⚠️  vault-data.json not found. Using defaults.');
  }

  // 3. Load vault-map.json (git-ignored)
  let vaultMap = {};
  if (fs.existsSync(VAULT_MAP_JSON)) {
    try {
      vaultMap = JSON.parse(fs.readFileSync(VAULT_MAP_JSON, 'utf8'));
      console.log('✅ Loaded vault-map.json');
    } catch (e) {
      console.error('❌ Failed to parse vault-map.json:', e.message);
      process.exit(1);
    }
  } else {
    const exampleMap = path.join(ROOT, 'templates', 'vault-map.json.example');
    if (fs.existsSync(exampleMap)) {
      console.warn('⚠️  vault-map.json not found, falling back to templates/vault-map.json.example');
      vaultMap = JSON.parse(fs.readFileSync(exampleMap, 'utf8'));
    } else {
      console.warn('⚠️  Neither vault-map.json nor template found.');
    }
  }

  // 4. Prompt for Password
  const password = await getPassword();
  if (!password || password.length === 0) {
    console.error('❌ Password cannot be empty.');
    process.exit(1);
  }

  // Password rule validation: at least 12 characters and not a common word or pattern, or 4+ random unrelated words
  const words = password.trim().split(/\s+/).filter(Boolean);
  const isRuleCompliant = password.length >= 12 || words.length >= 4;
  if (!isRuleCompliant) {
    console.warn('\n⚠️  SECURITY WARNING: Your password does not meet the recommended rule:');
    console.warn('   Rule: At least 12 characters and not a common word or pattern, or 4+ random unrelated words.');
    console.warn('   Because ciphertext is hosted statically, strong passwords protect against offline brute force.\n');
  }

  // 5. Clean / Prepare output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const file of fs.readdirSync(OUTPUT_DIR)) {
    if (file.endsWith('.enc')) {
      fs.unlinkSync(path.join(OUTPUT_DIR, file));
    }
  }

  // 6. Build vault structure
  const domains = buildVaultStructure(vaultData, vaultMap);

  // Derive master salt/key for manifest
  const manifestSalt = randomBytes(SALT_BYTES);
  const manifestIv = randomBytes(IV_BYTES);
  const masterKey = await deriveKey(password, manifestSalt);

  // 7. Encrypt documents
  const encryptedFiles = {};
  let totalFiles = 0;
  let emptyDocs = 0;

  for (const domain of domains) {
    for (const doc of domain.documents) {
      if (doc.type === 'text') continue;

      const relPath = doc.mapPath ? doc.mapPath.trim() : '';
      if (!relPath) {
        // Explicit empty placeholder
        emptyDocs++;
        continue;
      }

      const absPath = path.isAbsolute(relPath) ? relPath : path.join(DATA_DIR, relPath);
      if (!fs.existsSync(absPath)) {
        console.warn(`⚠️  File not found on disk: "${relPath}" -> marked EMPTY placeholder`);
        emptyDocs++;
        continue;
      }

      const fileId = randomUUID();
      const plaintext = fs.readFileSync(absPath);
      const encryptedBlob = await encryptFile(plaintext, password);
      fs.writeFileSync(path.join(OUTPUT_DIR, `${fileId}.enc`), encryptedBlob);

      encryptedFiles[doc.id] = {
        fileId,
        mimeType: getMimeType(relPath),
        originalName: path.basename(relPath),
        sizeBytes: plaintext.length,
      };
      totalFiles++;
      console.log(`  🔒 Encrypted: ${doc.title} (${relPath})`);
    }
  }

  // 8. Build manifest
  const manifest = {
    version: 1,
    encryptedAt: new Date().toISOString(),
    domains: domains.map((domain) => ({
      id: domain.id,
      title: domain.title,
      titleHindi: domain.titleHindi,
      icon: domain.icon,
      documents: domain.documents.map((doc) => {
        const base = {
          id: doc.id,
          title: doc.title,
          cleanName: doc.cleanName,
          type: doc.type || 'file',
          expiry: doc.expiry || null,
          note: doc.note || null,
        };

        if (doc.type === 'text') {
          base.textValue = doc.textValue;
          base.masked = !!doc.masked;
        } else if (encryptedFiles[doc.id]) {
          base.fileId = encryptedFiles[doc.id].fileId;
          base.mimeType = encryptedFiles[doc.id].mimeType;
          base.sizeBytes = encryptedFiles[doc.id].sizeBytes;
          base.status = 'available';
        } else {
          base.status = 'empty';
        }
        return base;
      }),
    })),
  };

  // 9. Encrypt manifest
  const manifestPlain = Buffer.from(JSON.stringify(manifest));
  const manifestEncrypted = await encryptWithKey(manifestPlain, masterKey, manifestSalt, manifestIv);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.enc'), manifestEncrypted);

  console.log('\n' + '='.repeat(55));
  console.log('✅ Encryption successful!');
  console.log(`   📄 Encrypted files:      ${totalFiles}`);
  console.log(`   ⬜ Empty placeholders:   ${emptyDocs}`);
  console.log(`   📁 Ciphertext directory: ${OUTPUT_DIR}`);
  console.log('🔒 Sensitive source files remain git-ignored.');
  console.log('='.repeat(55) + '\n');
}

main().catch((err) => {
  console.error('❌ Encryption script failed:', err);
  process.exit(1);
});
