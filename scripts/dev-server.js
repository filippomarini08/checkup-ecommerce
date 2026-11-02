// Local server for development without Cloudflare: serves /public and /api/check.
// Usage: node scripts/dev-server.js [port]
// Set FIXTURES=1 to answer /api/check from test/fixtures instead of the real web.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlla } from '../worker/index.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const fixtures = fileURLToPath(new URL('../test/fixtures/', import.meta.url));
const port = Number(process.argv[2] || 8787);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml' };

async function fixtureFetch(url) {
  const map = {
    'https://negozio-conforme.example/': 'negozio-conforme.html',
    'https://negozio-conforme.example/products/felpa-grigia': 'prodotto-conforme.html',
    'https://negozio-da-sistemare.example/': 'negozio-da-sistemare.html',
    'https://negozio-da-sistemare.example/prodotto/scarpa-rossa': 'prodotto-da-sistemare.html',
  };
  if (!map[url]) throw new Error('Il sito ha risposto con errore 404.');
  return { url, html: await readFile(join(fixtures, map[url]), 'utf8') };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/api/check') {
    try {
      const report = await controlla(url.searchParams.get('url'), process.env.FIXTURES ? fixtureFetch : undefined);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(report));
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ errore: e.message }));
    }
    return;
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch {
    const body = await readFile(join(root, '404.html')).catch(() => 'Not found');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end(body);
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
