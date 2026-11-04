const fs = require('fs');
const path = require('path');

const md = fs.readFileSync('docs/FAZ-7.1A-GORSEL-ENVANTERI.md', 'utf8');
const lines = md.split('\n');
const prevFiles = new Set();

for (const line of lines) {
  if (!line.startsWith('| `')) continue;
  const parts = line.split('|').map((s) => s.trim());
  const file = parts[1].replace(/`/g, '');
  prevFiles.add(file);
}

const uploadsDir = path.resolve('public/uploads');
function scanDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full);
    } else if (entry.isFile()) {
      const rel = path.relative(uploadsDir, full).split(path.sep).join('/');
      if (!prevFiles.has(rel)) {
        console.log('Removing extra test file:', rel);
        fs.unlinkSync(full);
      }
    }
  }
}
scanDir(uploadsDir);
console.log('Cleanup completed.');

