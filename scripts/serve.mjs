import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const path = resolve(root, relative);
    if (!path.startsWith(root + sep) || relative.split(/[\\/]/).some((part) => part.startsWith('.'))) {
      response.writeHead(403).end(); return;
    }
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': `${types[extname(path)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('BOBOBO: http://127.0.0.1:4173/'));
