const ALLOWED_ORIGINS = ['https://amliaes.netlify.app', 'http://localhost:5173', 'http://localhost:8888'];
function getHeaders(event) {
  const origin = (event && event.headers && (event.headers.origin || event.headers.Origin)) || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Content-Type': 'application/json',
  };
}
function ok(event, data, status) { return { statusCode: status || 200, headers: getHeaders(event), body: JSON.stringify(data) }; }
function err(event, status, msg) { return ok(event, { error: msg || 'Internal server error' }, status || 500); }

const LIB_PASSWORD = process.env.LIB_PASSWORD || '';

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: getHeaders(event), body: '' };
  if (event.httpMethod !== 'POST') return err(event, 405, 'Method not allowed');
  if (!LIB_PASSWORD) return err(event, 500, 'Auth not configured');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err(event, 400, 'Invalid JSON'); }
  const { password } = body;
  if (!password) return err(event, 400, 'password is required');
  return ok(event, { valid: password === LIB_PASSWORD });
};

module.exports = { handler };
