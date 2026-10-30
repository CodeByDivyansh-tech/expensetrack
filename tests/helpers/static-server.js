/**
 * Serves public/ the way Render does: clean-URL rewrites from render.yaml, the same response
 * headers (including the Content-Security-Policy), and 404.html for unknown paths.
 * Usage: node static-server.js [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../public');
const YAML = fs.readFileSync(path.join(__dirname, '../../render.yaml'), 'utf8');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

/** Headers and rewrites exactly as written in render.yaml. */
function readRenderConfig() {
  const unquote = (s) => s.trim().replace(/^"(.*)"$/s, '$1');
  const headers = [];
  const headerRe = /- path: (\S+)\s+name: (.+)\s+value: (.+)/g;
  for (const m of YAML.matchAll(headerRe)) headers.push({ path: m[1], name: m[2].trim(), value: unquote(m[3]) });
  const rewrites = {};
  const rewriteRe = /- type: rewrite\s+source: (\S+)\s+destination: (\S+)/g;
  for (const m of YAML.matchAll(rewriteRe)) rewrites[m[1]] = m[2];
  return { headers, rewrites };
}

function createServer() {
  const { headers, rewrites } = readRenderConfig();
  return http.createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath === '/') urlPath = '/index.html';
    if (rewrites[urlPath]) urlPath = rewrites[urlPath];
    let file = path.join(ROOT, urlPath);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    let status = 200;
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(ROOT, '404.html');
      status = 404;
    }
    const out = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
    headers.forEach((h) => { out[h.name] = h.value; });
    res.writeHead(status, out);
    fs.createReadStream(file).pipe(res);
  });
}

if (require.main === module) {
  const port = Number(process.argv[2]) || 4173;
  createServer().listen(port, '127.0.0.1', () => console.log(`Serving public/ on http://127.0.0.1:${port}`));
}

module.exports = { createServer, readRenderConfig };
