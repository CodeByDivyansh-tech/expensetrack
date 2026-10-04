const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');

// 1. Clean and recreate public/
if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true, force: true });
}
fs.mkdirSync(publicDir, { recursive: true });

// 2. Individual website files to copy
const filesToCopy = [
  'index.html',
  'login.html',
  'app.js',
  'data-layer.js',
  'budget-calculator.js',
  'firebase-config.js',
  'favicon.ico',
  'favicon.svg',
  'apple-touch-icon.png'
];

for (const file of filesToCopy) {
  const srcPath = path.join(rootDir, file);
  const destPath = path.join(publicDir, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
  } else {
    console.warn(`[build] Warning: ${file} was not found.`);
  }
}

// 3. Asset and style directories
const dirsToCopy = [
  { src: 'assets', dest: 'assets' },
  { src: 'dist', dest: 'dist' }
];

for (const item of dirsToCopy) {
  const srcPath = path.join(rootDir, item.src);
  const destPath = path.join(publicDir, item.dest);
  if (fs.existsSync(srcPath)) {
    fs.cpSync(srcPath, destPath, { recursive: true });
  } else {
    console.warn(`[build] Warning: directory ${item.src} was not found.`);
  }
}

console.log('[build] Public directory prepared successfully at:', publicDir);
