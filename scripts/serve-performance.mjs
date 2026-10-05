import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
createServer((req, res) => {
  try {
    const path = resolve(root, `.${decodeURIComponent(new URL(req.url, 'http://localhost').pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const file = extname(path) ? path : resolve(root, 'index.html');
    const content = readFileSync(file);
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Accept-Encoding');
    if (/gzip/.test(req.headers['accept-encoding'] ?? '')) { res.setHeader('Content-Encoding', 'gzip'); res.end(gzipSync(content)); }
    else res.end(content);
  } catch { res.writeHead(404).end(); }
}).listen(4175, '127.0.0.1');
