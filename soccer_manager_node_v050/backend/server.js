const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi } = require('./routes/api');

const PORT = Number(process.env.PORT || 3000);
const frontendDir = path.resolve(__dirname, '..', 'frontend');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp'
};

function safeFilePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const relative = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  const resolved = path.resolve(frontendDir, relative);
  return resolved.startsWith(frontendDir + path.sep) || resolved === path.join(frontendDir, 'index.html') ? resolved : null;
}

function sendFile(res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      const fallback = path.join(frontendDir, 'index.html');
      return fs.readFile(fallback, (fallbackErr, data) => {
        if (fallbackErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Erro ao carregar o frontend.');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res);
  const filePath = safeFilePath(req.url);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }
  sendFile(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Soccer Manager rodando em http://0.0.0.0:${PORT}`);
});
