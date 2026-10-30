/**
 * Serves public/ like static-server.js, but signs a demo student in so Lighthouse can audit the real
 * screens (it cannot sign in with Google). The three Firebase scripts on index.html are swapped for a
 * stub with sample data kept in localStorage. Never used for the live site.
 * Usage: node audit-server.js [port]   (SITE_DIR picks another checkout)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createServer, readRenderConfig } = require('./static-server');
const { installStub } = require('../e2e/fixtures');

const SITE = process.env.SITE_DIR || path.join(__dirname, '../..');
const fakeFirestore = fs.readFileSync(path.join(__dirname, 'fake-firestore.js'), 'utf8');

function iso(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sampleData() {
  const cats = ['food', 'groceries', 'transport', 'textbooks', 'entertainment'];
  const notes = ['Canteen lunch', 'Veg and fruit', 'Metro card', 'Notebook', 'Movie night', 'Chai'];
  const expenses = Array.from({ length: 40 }, (_, i) => ({
    id: `a${i}`, amount: [120, 340.5, 60, 450, 200, 15][i % 6], category: cats[i % 5], date: iso(Math.floor(i * 1.6)),
    note: notes[i % 6], createdAt: i, paymentMethod: ['UPI', 'Cash', 'Card'][i % 3],
  }));
  return {
    expensetrack_expenses: expenses,
    expensetrack_settings: { notify80: true },
    expensetrack_goals: [{ id: 'g1', name: 'New laptop', target: 60000, saved: 21000, contributions: [], createdAt: 1 }],
  };
}

const stubScript = `${fakeFirestore}\n;(${installStub.toString()})(${JSON.stringify({ useFirestore: false, seed: sampleData(), signedOut: false, signInError: null })});`;

const server = createServer();
const original = server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request', (req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  if (!fs.existsSync(path.join(SITE, 'public', 'index.html'))) return original(req, res);
  const extra = {};
  readRenderConfig().headers.filter((h) => h.path === '/*').forEach((h) => { extra[h.name] = h.value; });
  if (url === '/__stub.js') {
    res.writeHead(200, { ...extra, 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(stubScript);
  }
  if (url === '/__session.js') {
    res.writeHead(200, { ...extra, 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end("try{localStorage.setItem('expensetrack_user_session',JSON.stringify({uid:'test-uid'}))}catch(e){}");
  }
  if (url === '/' || url === '/index.html' || url === '/dashboard') {
    let html = fs.readFileSync(path.join(SITE, 'public', 'index.html'), 'utf8');
    html = html.replace('<head>', '<head>\n  <script src="/__session.js"></script>'); // a signed-in browser, so the page does not bounce to sign-in
    html = html.replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"[^>]*><\/script>\s*/g, '');
    // works for the original page (plain script tags) and the current one (deferred)
    html = html.replace(/<script src="firebase-config\.js"( defer)?><\/script>/, '<script src="/__stub.js"></script>\n  <script src="firebase-config.js"$1></script>');
    res.writeHead(200, { ...extra, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(html);
  }
  return original(req, res);
});

const port = Number(process.argv[2]) || 4190;
server.listen(port, '127.0.0.1', () => console.log(`Audit server on http://127.0.0.1:${port}`));
