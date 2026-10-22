import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const srcCmaps = path.join(ROOT, 'node_modules', 'pdfjs-dist', 'cmaps');
const srcFonts = path.join(ROOT, 'node_modules', 'pdfjs-dist', 'standard_fonts');

const destBase = path.join(ROOT, 'public', 'pdfjs');
const destCmaps = path.join(destBase, 'cmaps');
const destFonts = path.join(destBase, 'standard_fonts');

fs.mkdirSync(destCmaps, { recursive: true });
fs.mkdirSync(destFonts, { recursive: true });

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  for (const file of fs.readdirSync(src)) {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    if (fs.statSync(srcPath).isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(srcCmaps, destCmaps);
copyDir(srcFonts, destFonts);
console.log('✅ pdfjs assets (cmaps & standard_fonts) copied to public/pdfjs/');
