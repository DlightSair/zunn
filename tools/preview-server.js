/** Dev-only: serves src/renderer with a stubbed IPC bridge for browser preview. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'src', 'renderer');
const PORT = Number(process.env.PORT) || 4600;


const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};


http
  .createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.resolve(ROOT, `.${rel === '/' ? '/__preview.html' : rel}`);
    if (!file.startsWith(path.resolve(ROOT))) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  })
  .listen(PORT, () => console.log(`[nexus] UI preview on http://localhost:${PORT}`));
