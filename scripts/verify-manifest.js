const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Read FAZ-7.1A-GORSEL-ENVANTERI.md
const md = fs.readFileSync('docs/FAZ-7.1A-GORSEL-ENVANTERI.md', 'utf8');
const lines = md.split('\n');
const prevManifest = new Map();

for (const line of lines) {
  if (!line.startsWith('| `')) continue;
  const parts = line.split('|').map(s => s.trim());
  // parts[0] is empty, parts[1] is `filename`, parts[2] is size, ..., parts[6] is SHA256
  const file = parts[1].replace(/`/g, '');
  const size = parseInt(parts[2], 10);
  const sha = parts[6].replace(/`/g, '').toUpperCase();
  prevManifest.set(file, { size, sha });
}

console.log('Previous manifest entries loaded:', prevManifest.size);

// 2. Scan current public/uploads
const uploadsDir = path.resolve('public/uploads');
const currentFiles = [];

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full);
    } else if (entry.isFile()) {
      currentFiles.push(full);
    }
  }
}
scanDir(uploadsDir);

console.log('Current public/uploads files count:', currentFiles.length);

const currentManifest = new Map();
for (const fullPath of currentFiles) {
  const rel = path.relative(uploadsDir, fullPath).split(path.sep).join('/');
  const buffer = fs.readFileSync(fullPath);
  const sha = crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
  currentManifest.set(rel, { size: buffer.length, sha });
}

// Compare
const missing = [];
const diffHash = [];
const diffSize = [];
const extra = [];

for (const [rel, prev] of prevManifest.entries()) {
  if (!currentManifest.has(rel)) {
    missing.push(rel);
  } else {
    const curr = currentManifest.get(rel);
    if (curr.sha !== prev.sha) {
      diffHash.push({ file: rel, prevSha: prev.sha, currSha: curr.sha });
    }
    if (curr.size !== prev.size) {
      diffSize.push({ file: rel, prevSize: prev.size, currSize: curr.size });
    }
  }
}

for (const rel of currentManifest.keys()) {
  if (!prevManifest.has(rel)) {
    extra.push(rel);
  }
}

console.log('Missing files:', missing.length);
if (missing.length > 0) console.log(missing);

console.log('Hash differences:', diffHash.length);
if (diffHash.length > 0) console.log(diffHash);

console.log('Size differences:', diffSize.length);
if (diffSize.length > 0) console.log(diffSize);

console.log('Extra files:', extra.length);
if (extra.length > 0) console.log(extra);

console.log('Total exact 1:1 matches:', prevManifest.size - missing.length - diffHash.length);

