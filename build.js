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
  'portal.html',
  'portal.css',
  'portal.js',
  'portal-config.js',
  'text-fx.js',
  '404.html',
  'login.js',
  'theme-init.js',
  'pwa.js',
  'manifest.webmanifest',
  'robots.txt',
  'app.js',
  'data-layer.js',
  'expense-tools.js',
  'budget-calculator.js',
  'firebase-config.js',
  'favicon.ico',
  'favicon.svg',
  'apple-touch-icon.png'
];

// Our own scripts are minified (whitespace and names only; no bundling, no code changes)
const esbuild = require('esbuild');

for (const file of filesToCopy) {
  const srcPath = path.join(rootDir, file);
  const destPath = path.join(publicDir, file);
  if (fs.existsSync(srcPath)) {
    if (file.endsWith('.js')) {
      const out = esbuild.transformSync(fs.readFileSync(srcPath, 'utf8'), { minify: true, target: 'es2019', legalComments: 'none', charset: 'utf8' });
      fs.writeFileSync(destPath, out.code);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
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

// 4. The service worker is stamped with a hash of everything it caches, so each deploy gets a fresh cache
const crypto = require('crypto');
const hash = crypto.createHash('sha1');
(function walk(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else hash.update(path.relative(publicDir, full)).update(fs.readFileSync(full));
  }
})(publicDir);
const buildId = hash.digest('hex').slice(0, 12);
const swSource = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
fs.writeFileSync(path.join(publicDir, 'sw.js'), esbuild.transformSync(swSource.replace('__BUILD_ID__', buildId), { minify: true, target: 'es2019', legalComments: 'none' }).code);

console.log('[build] Public directory prepared successfully at:', publicDir, '(service worker build', buildId + ')');
