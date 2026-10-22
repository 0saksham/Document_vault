#!/usr/bin/env node
/**
 * test-acceptance.mjs - Automated Acceptance Tests for Digital Documents Vault
 * Run: npm test  (or: node scripts/test-acceptance.mjs)
 */

import { webcrypto } from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const { subtle } = webcrypto;
const ROOT = process.cwd();
const VAULT_DIR = path.join(ROOT, 'public', 'vault');
const DIST_DIR = path.join(ROOT, 'dist');
const DATA_DIR = path.join(ROOT, 'data');
const VAULT_DATA_FILE = path.join(ROOT, 'vault-data.json');

const TEST_PASSWORD = process.env.VAULT_PASSWORD || 'Saksham8755--++';
const WRONG_PASSWORD = 'wrong-password-attempt-12345';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// Crypto decryption helper mimicking src/lib/crypto.js
async function decryptPayload(arrayBuffer, password) {
  const buf = Buffer.from(arrayBuffer);
  const magic = buf.subarray(0, 4).toString('utf8');
  if (magic !== 'DDVX') {
    throw new Error('Invalid vault file format (bad magic)');
  }
  const version = buf[4];
  const salt = buf.subarray(5, 21);
  const iterations = buf.readUInt32BE(21);
  const iv = buf.subarray(25, 37);
  const ciphertextAndTag = buf.subarray(37);

  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, hash: 'SHA-256', iterations },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertextAndTag
  );
  return Buffer.from(decrypted);
}

async function runTests() {
  console.log('\n🧪 Running Acceptance Tests for Digital Documents Vault');
  console.log('='.repeat(65));

  // Dynamically load expected values from local vault-data.json
  let localVaultData = {};
  if (fs.existsSync(VAULT_DATA_FILE)) {
    try {
      localVaultData = JSON.parse(fs.readFileSync(VAULT_DATA_FILE, 'utf8'));
    } catch {}
  }

  // ─── Test 1: Re-encrypt vault with test password ────────────────────────
  console.log('\n[1/8] Encryption and Build verification');
  try {
    execSync(`node scripts/encrypt.mjs --password "${TEST_PASSWORD}"`, {
      cwd: ROOT,
      stdio: 'pipe',
    });
    assert(fs.existsSync(path.join(VAULT_DIR, 'manifest.enc')), 'manifest.enc was generated');
  } catch (err) {
    assert(false, `Encryption script failed: ${err.message}`);
  }

  // ─── Test 2: Wrong password rejection ───────────────────────────────────
  console.log('\n[2/8] Wrong password rejection (crypto integrity)');
  const manifestRaw = fs.readFileSync(path.join(VAULT_DIR, 'manifest.enc'));
  let wrongPasswordFailed = false;
  try {
    await decryptPayload(manifestRaw, WRONG_PASSWORD);
  } catch {
    wrongPasswordFailed = true;
  }
  assert(wrongPasswordFailed, 'Wrong password fails decryption (throws auth error, nothing leaked)');

  // ─── Test 3: Correct password manifest decryption ───────────────────────
  console.log('\n[3/8] Correct password decryption and structure verification');
  let manifest = null;
  try {
    const decryptedManifestBuf = await decryptPayload(manifestRaw, TEST_PASSWORD);
    manifest = JSON.parse(decryptedManifestBuf.toString('utf8'));
    assert(manifest && Array.isArray(manifest.domains), 'Manifest successfully decrypted with correct password');
    assert(manifest.domains.length === 7, `Contains all 7 Life Domains (found ${manifest.domains.length})`);
  } catch (err) {
    assert(false, `Correct password decryption failed: ${err.message}`);
  }

  // ─── Test 4: Document placeholder and availability mapping ──────────────
  console.log('\n[4/8] Document status verification (Section 3 mappings)');
  if (manifest) {
    const allDocs = manifest.domains.flatMap((d) => d.documents);
    const docMap = new Map(allDocs.map((d) => [d.id, d]));

    // Check placeholders (Passport, DL, PUC)
    const passport = docMap.get('doc-passport');
    const dl = docMap.get('doc-dl');
    const puc = docMap.get('doc-puc');

    assert(passport && passport.status === 'empty', 'Passport shows as empty placeholder (not found)');
    assert(dl && dl.status === 'empty', 'Driving License shows as empty placeholder (not found)');
    assert(puc && puc.status === 'empty', 'PUC shows as empty placeholder (not found)');

    // Check available documents
    const aadhar = docMap.get('doc-aadhar');
    const pan = docMap.get('doc-pan');
    const rc = docMap.get('doc-rc');
    const qr = docMap.get('doc-qr');

    assert(aadhar && aadhar.status === 'available', 'Aadhar Card shows as available');
    assert(pan && pan.status === 'available', 'PAN Card shows as available');
    assert(rc && rc.status === 'available', 'Vehicle RC shows as available');
    assert(qr && qr.status === 'available', 'Google Pay QR shows as available');

    // Check text documents against local vault-data.json
    const vehNum = docMap.get('doc-vehiclenum');
    const blood = docMap.get('doc-blood');
    const acc = docMap.get('doc-accnum');
    assert(
      vehNum && vehNum.textValue === (localVaultData.vehicleNumber || ''),
      'Vehicle number matches vault-data.json and decrypted correctly in manifest'
    );
    assert(
      blood && blood.textValue === (localVaultData.bloodGroup || ''),
      'Blood group matches vault-data.json and decrypted correctly in manifest'
    );
    assert(
      acc && acc.textValue === (localVaultData.accountNumber || '') && acc.masked,
      'Account number is masked and decrypted correctly in manifest'
    );

    // Decrypt a real file document and compare with source
    if (aadhar && aadhar.fileId) {
      const encFilePath = path.join(VAULT_DIR, `${aadhar.fileId}.enc`);
      const encBytes = fs.readFileSync(encFilePath);
      const decBytes = await decryptPayload(encBytes, TEST_PASSWORD);
      const originalBytes = fs.readFileSync(path.join(DATA_DIR, 'Identity proof', 'aadhar.pdf'));
      assert(
        decBytes.equals(originalBytes),
        'Decrypted Aadhar PDF matches source aadhar.pdf byte-for-byte'
      );
    }
  }

  // ─── Test 5: Inspect dist/ and public/vault for plaintext leaks ──────────
  console.log('\n[5/8] Ciphertext inspection (no plain text/document leaks)');
  const vaultFiles = fs.readdirSync(VAULT_DIR);
  const nonEncInVault = vaultFiles.filter((f) => !f.endsWith('.enc'));
  assert(nonEncInVault.length === 0, 'public/vault/ contains ONLY .enc files');

  const plainNames = ['aadhar', 'PanCarde', 'GooglePay', 'signature', 'Domicile'];
  const vaultNamesMatch = vaultFiles.some((f) =>
    plainNames.some((name) => f.toLowerCase().includes(name.toLowerCase()))
  );
  assert(!vaultNamesMatch, 'No plain document names in public/vault/ filenames');

  // Verify dist/ inspection
  if (fs.existsSync(DIST_DIR)) {
    const distFiles = [];
    function scanDistFiles(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) scanDistFiles(full);
        else distFiles.push(full);
      }
    }
    scanDistFiles(DIST_DIR);

    const pdfInDist = distFiles.filter((f) => f.toLowerCase().endsWith('.pdf'));
    assert(pdfInDist.length === 0, 'No unencrypted PDF files in dist/ bundle');

    const secretsToCheck = [localVaultData.accountNumber, localVaultData.vehicleNumber]
      .filter((v) => v && v.length >= 4);

    let secretsInDist = false;
    for (const file of distFiles) {
      if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.json')) {
        const text = fs.readFileSync(file, 'utf8');
        for (const s of secretsToCheck) {
          if (text.includes(s)) secretsInDist = true;
        }
      }
    }
    assert(!secretsInDist, 'No sensitive plaintext values from vault-data.json in dist/ JS/HTML bundles');
  }

  // ─── Test 6: Package engines and Gitignore configuration ────────────────
  console.log('\n[6/8] Configuration and Templates integrity');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert(pkg.engines && pkg.engines.node === '22', 'package.json contains "engines": { "node": "22" }');

  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert(gitignore.includes('vault-data.json'), '.gitignore includes vault-data.json');
  assert(gitignore.includes('vault-map.json'), '.gitignore includes vault-map.json');
  assert(gitignore.includes('data/'), '.gitignore includes data/');

  assert(fs.existsSync(path.join(ROOT, 'templates', 'vault-data.json.example')), 'templates/vault-data.json.example exists');
  assert(fs.existsSync(path.join(ROOT, 'templates', 'vault-map.json.example')), 'templates/vault-map.json.example exists');
  assert(!fs.existsSync(path.join(DATA_DIR, 'vault-data.json.example')), 'vault-data.json.example was removed from data/');

  // Check template placeholder cleanliness
  const templateData = fs.readFileSync(path.join(ROOT, 'templates', 'vault-data.json.example'), 'utf8');
  assert(templateData.includes('"vehicleNumber": "XX00XX0000"'), 'template vault-data has placeholder vehicleNumber XX00XX0000');
  assert(templateData.includes('"accountNumber": "000000000000"'), 'template vault-data has placeholder accountNumber 000000000000');
  assert(!templateData.includes('HDFC ERGO') && !templateData.includes('LMV'), 'template vault-data has no invented notes');

  // ─── Test 7: Secrets Check blocks forbidden files ───────────────────────
  console.log('\n[7/8] Secrets checker enforcement');
  try {
    execSync('node scripts/check-secrets.mjs', { cwd: ROOT, stdio: 'pipe' });
    assert(true, 'scripts/check-secrets.mjs passes on clean workspace');
  } catch (e) {
    assert(false, `scripts/check-secrets.mjs failed on clean workspace: ${e.message}`);
  }

  // Test that loose PDF in public/ is blocked
  const testPdf = path.join(ROOT, 'public', 'unencrypted-leak-test.pdf');
  fs.writeFileSync(testPdf, 'dummy pdf content');
  let blocked = false;
  try {
    execSync('node scripts/check-secrets.mjs', { cwd: ROOT, stdio: 'pipe' });
  } catch {
    blocked = true;
  }
  fs.unlinkSync(testPdf); // clean up
  assert(blocked, 'scripts/check-secrets.mjs successfully BLOCKS when an unencrypted document is found');

  // ─── Test 8: README rules compliance ────────────────────────────────────
  console.log('\n[8/8] README requirements validation');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert(!readme.includes('tr0ub4dor&3'), 'Weak password example "tr0ub4dor&3" removed from README');
  assert(!readme.includes('Mango-River'), 'Example passwords removed from README');
  assert(
    readme.includes('at least 12 characters and not a common word or pattern, or 4+ random unrelated words'),
    'Password rule updated to: at least 12 characters and not a common word or pattern, or 4+ random unrelated words'
  );
  assert(readme.includes('Copy-Item') && readme.includes('copy templates\\'), 'Windows PowerShell and cmd commands provided');
  assert(readme.includes('vault-map.json'), 'vault-map.json documented for adding documents later');
  assert(readme.includes('"vehicleNumber": "XX00XX0000"'), 'README vault-data.json uses XX00XX0000 placeholder');
  assert(readme.includes('"accountNumber": "000000000000"'), 'README vault-data.json uses 000000000000 placeholder');
  assert(!readme.includes('HDFC ERGO') && !readme.includes('LMV + MCWG'), 'README has no invented notes or dates');
  assert(readme.includes('offline brute-force') || readme.includes('brute-force offline'), 'Offline brute-force limitation clearly stated');
  assert(readme.includes('old git history') || readme.includes('git history'), 'Changing password does not protect old git history stated');
  assert(readme.includes('Plain documents are never sent anywhere; only ciphertext is hosted.'), 'Reworded security claim present');
  assert(readme.includes('OneDrive'), 'OneDrive risk warning documented');

  // Summary
  console.log('\n' + '='.repeat(65));
  console.log(`ACCEPTANCE TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(65) + '\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
