const packageJson = require('../../package.json');

function json(res, statusCode, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store'
  });
  res.end(data);
}

function handleApi(req, res) {
  if (req.method === 'GET' && req.url === '/api/health') {
    return json(res, 200, { ok: true, service: 'soccer-manager', timestamp: new Date().toISOString() });
  }
  if (req.method === 'GET' && req.url === '/api/version') {
    return json(res, 200, { name: packageJson.name, version: packageJson.version, architecture: 'frontend + node backend' });
  }
  return json(res, 404, { error: 'API route not found' });
}

module.exports = { handleApi };
