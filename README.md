# 🔐 Digital Documents Vault

> **Your life's paperwork, one secure place.**  
> आपके सारे दस्तावेज़, एक सुरक्षित जगह।

A password-protected, client-side-encrypted personal document vault.  
All encryption/decryption happens **entirely in your browser** using the Web Crypto API.  
Plain documents are never sent anywhere; only ciphertext is hosted.

> ⚠️ **IMPORTANT SECURITY NOTE (OneDrive & Cloud Sync)**:  
> Keep your project folder and unencrypted working directory **outside OneDrive or cloud sync folders**. Having your plain source `data/` folder automatically syncing to OneDrive or other third-party cloud storage creates an unencrypted remote copy, which is the user's own risk.

---

## 🗺️ File Mapping

The vault organizes documents across 7 life domains:

| Domain | Document | Type | Status |
|--------|----------|------|--------|
| School Certificates | 10th Marksheet / Certificate | Document | ✅ Available |
| School Certificates | 12th Marksheet / Certificate | Document | ✅ Available |
| Identity Proof | Aadhar Card | Document | ✅ Available |
| Identity Proof | Voter ID Card | Document | ✅ Available |
| Identity Proof | PAN Card | Document | ✅ Available |
| Identity Proof | Passport | Document | ⬜ Empty placeholder |
| Identity Proof | Domicile Certificate | Document | ✅ Available |
| Identity Proof | Permanent Residence | Document | ✅ Available |
| Identity Proof | Birth Certificate | Document | ✅ Available |
| Personal Info | Signature | Document | ✅ Available |
| Personal Info | Passport Size Photo | Document | ✅ Available |
| Vehicle | Driving License | Document | ✅ Available |
| Vehicle | Pollution Paper (PUC) | Document | ⬜ Empty placeholder |
| Vehicle | RC | Document | ✅ Available |
| Vehicle | Insurance | Document | ✅ Available |
| Vehicle | Vehicle Number | Text value | ✅ Text |
| Health | Blood Group | Text value | ✅ Text |
| Banking | Account Number | Text value | ✅ Text |
| Banking | Google Pay QR | Image document | ✅ Available |
| College | College ID Card (Digital) | Document | ✅ Available |
| College | College ID Card (Physical) | Document | ✅ Available |

**Empty documents** (Passport, PUC): appear as greyed-out "Not added yet" placeholders with an indicator showing they can be added later.

---

## ⚙️ Setup & First Run

### Prerequisites
- Node.js >= 22 (as specified in `package.json` engines)
- Your documents in the `data/` folder (git-ignored)

### 1. Install dependencies
```bash
npm install
```

### 2. Place your documents
Organize your files inside the `data/` directory (created at the repository root):
```
data/
├── school certificates/
├── Identity proof/
├── personal info/
├── Vehicle section/
├── Banking/
└── College/
```

### 3. Create your `vault-data.json` and `vault-map.json`
Both configuration files are git-ignored and must stay local. Committable starter templates are provided in `templates/`.

**Windows PowerShell:**
```powershell
Copy-Item templates/vault-data.json.example vault-data.json
Copy-Item templates/vault-map.json.example vault-map.json
```

**Windows Command Prompt (cmd):**
```cmd
copy templates\vault-data.json.example vault-data.json
copy templates\vault-map.json.example vault-map.json
```

---

## 📋 Configuration Format

### `vault-data.json` Format
Stores personal plaintext values and document-specific metadata (such as expiry dates and notes).  
All fields are encrypted into the encrypted manifest when running the build-time script:

```json
{
  "_comment": "Sensitive personal values and document metadata. Keep this file git-ignored.",
  "vehicleNumber": "XX00XX0000",
  "bloodGroup": "",
  "accountNumber": "000000000000",
  "metadata": {
    "doc-insurance": {
      "expiry": "YYYY-MM-DD",
      "note": ""
    },
    "doc-puc": {
      "expiry": "YYYY-MM-DD",
      "note": ""
    },
    "doc-dl": {
      "expiry": "YYYY-MM-DD",
      "note": ""
    },
    "doc-passport": {
      "expiry": "YYYY-MM-DD",
      "note": ""
    }
  }
}
```

- **`expiry`** *(optional string)*: Document expiration date formatted as `YYYY-MM-DD`. The web app automatically computes days remaining and displays an ok / warning / expired badge.
- **`note`** *(optional string)*: Private remarks or policy numbers shown in the document card / modal.

---

## ➕ Adding Passport, Driving License, or PUC Later

You **do not need to modify any script or application code** to add missing documents later. Simply edit `vault-map.json`:

1. Save your document file inside `data/` (e.g. `data/Identity proof/passport.pdf`).
2. Open `vault-map.json` and update the document ID's mapped relative path:
   ```json
   {
     "doc-passport": "Identity proof/passport.pdf",
     "doc-dl": "Vehicle section/driving_license.pdf",
     "doc-puc": "Vehicle section/puc.pdf"
   }
   ```
   *(Empty string `""` or `null` leaves the document as an empty placeholder).*
3. If applicable, add an expiry date or note in `vault-data.json`:
   ```json
   "metadata": {
     "doc-passport": { "expiry": "YYYY-MM-DD", "note": "" }
   }
   ```
4. Re-encrypt and commit only the ciphertext:
   ```bash
   npm run encrypt
   git add public/vault/
   git commit -m "Update encrypted documents"
   git push
   ```

---

## 🔐 Encrypting Your Vault

Run the build-time encryption command:
```bash
npm run encrypt
```

You will be prompted for your password in the terminal (input is masked and never written to disk).  
This generates unique random UUID `.enc` files and an encrypted `manifest.enc` in `public/vault/`.

---

## 💻 Local Development

```bash
npm run dev
```

Open `http://localhost:5173` in your browser. Enter your password to unlock Layer 1.

---

## 🏗️ Production Build

```bash
npm run build
```

This automatically runs `scripts/check-secrets.mjs` first to verify that no plaintext documents or tracked sensitive files exist, then runs Vite to generate the static build in `dist/`.

---

## 🚀 Deployment to Antideploy (Static Site)

1. Push your repository to GitHub (ensure only ciphertext in `public/vault/*.enc`, source code, and templates are pushed).
2. On [antideploy.com](https://antideploy.com):
   - Connect your GitHub repository.
   - In the Antideploy deployment console, verify your build settings:
     - **Build command**: `npm run build`
     - **Output folder**: `dist`
3. Trigger deploy. The site is 100% static with zero backend or server components.

> **Note on repository visibility**: If your Antideploy plan uses a public repository, that is safe because the repository contains **only AES-256-GCM ciphertext** and no plaintext data. Your password strength protects the ciphertext. If available, a private repository adds defense-in-depth.

---

## 🔑 Password Rule

- **Rule**: Your password **must be at least 12 characters and not a common word or pattern, or 4+ random unrelated words**.
- **Crucial Warning**: If you forget your password, your documents **cannot be recovered** from the web copy. You must retain your offline original files and re-encrypt with a new password.
- Store your master vault passphrase in a reputable password manager.

---

## ⚠️ Honest Limitations

| Limitation | Details |
|---|---|
| **Offline Brute-Force Risk** | Anyone who can access the repository or website can download the `.enc` ciphertext files and attempt offline brute-force attacks directly using specialized hardware, completely bypassing the web app. Therefore, **only password strength and the 600,000 PBKDF2 iterations protect the data**. |
| **Git History Retention** | If a ciphertext file was committed in an earlier commit with a weaker or older password, **changing your password later does not protect old git history**. An attacker who clones the repo can inspect past commits to obtain older ciphertexts. |
| **File Sizes & Count Visible** | While document names and internal structures are obfuscated into random UUIDs, file sizes and total document counts remain visible as metadata from the `.enc` files. |
| **Client-Side Cooldown Only** | The lock screen delay after failed password attempts is a client-side UX safeguard; offline attackers can skip it entirely. |
| **No Server Audit Log** | Because the site is completely static with no server, there is no centralized logging to detect if someone attempts to access the site. |

---

## 🛡️ Git Safety Checklist

Run before **every** push:
```bash
git status
```

Verify that **none** of the following appear as tracked or untracked changes to commit:
- `data/` folder
- `vault-data.json`
- `vault-map.json`
- Any unencrypted `.pdf`, `.jpg`, `.png`, or documents

The automated pre-build check (`npm run check-secrets`) blocks builds if any plain documents or tracked secrets are found.

> 🚨 **Incident response**: If an unencrypted document was ever committed to git, treat that document as leaked, delete the repository, generate a new one, and replace the compromised document credentials where applicable.

---

## 📁 Repository Structure

```
├── templates/
│   ├── vault-data.json.example   ← Committable template for personal values & metadata
│   └── vault-map.json.example    ← Committable template for mapping document IDs
├── scripts/
│   ├── encrypt.mjs               ← Run: npm run encrypt
│   ├── check-secrets.mjs         ← Run: npm run check-secrets / runs in build
│   └── generate-icons.mjs        ← PWA icon generator
├── src/
│   ├── components/
│   │   ├── LockScreen.jsx        ← Password entry with PBKDF2 key derivation & rate limiter
│   │   ├── DomainGrid.jsx        ← 7 Life domains grid
│   │   ├── DocumentList.jsx      ← Cards with copy, preview, download, zip, expiry
│   │   ├── PreviewModal.jsx      ← Zoom/pan/rotate viewer for PDF and images
│   │   ├── TopBar.jsx            ← Header with search, quick actions, lock button
│   │   ├── ExpiryBadge.jsx       ← Expiry status indicator badge
│   │   └── ToastContainer.jsx    ← Animated feedback toasts
│   ├── lib/
│   │   ├── crypto.js             ← Web Crypto API AES-256-GCM decryption
│   │   ├── vault.js              ← Pure in-memory session store & auto-lock timers
│   │   └── zip.js                ← Pure JS zip packager
│   ├── App.jsx                   ← Main application router & state controller
│   ├── main.jsx
│   └── index.css
├── public/
│   ├── vault/                    ← Contains ONLY *.enc ciphertext (safe to commit)
│   ├── favicon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   └── robots.txt
├── index.html
├── vite.config.js
├── package.json                  ← Defines engines: { "node": "22" }
├── .gitignore                    ← Ignores data/, vault-data.json, vault-map.json, dist/
└── README.md
```

---

## 🧪 Acceptance Test Suite

To verify the vault's security and functionality:

1. **Wrong password test**: Enter an incorrect password on the lock screen. Verify that an error appears, nothing decrypts, and retry delay is enforced.
2. **Ciphertext inspection**: Inspect `public/vault/` and `dist/`: confirm zero readable document names, zero plain account numbers, zero unencrypted files.
3. **Empty placeholder test**: Verify that missing documents (Passport, Driving License, PUC) display the "Not added yet" placeholder.
4. **Interactive preview**: Click any available PDF or image document; test zoom, pan, rotate, and single-click download.
5. **Auto-lock test**: Allow the 5-minute inactivity timer to elapse (or click the lock icon); confirm that memory is cleared, Blob URLs are revoked, and the lock screen reappears.
6. **Responsive mobile test**: Test the layout at 360px viewport width to confirm full usability.
7. **Secrets check**: Run `npm run check-secrets` and verify it blocks unencrypted files.
