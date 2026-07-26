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

const ALLOWED_GITLAB_HOSTS = ['gitlab.com', 'gitlab.nvidia.com', 'gitlab.internal'];

function isAllowedUrl(url) {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].indexOf(parsed.protocol) === -1) return false;
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_GITLAB_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
  } catch { return false; }
}

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: getHeaders(event), body: '' };
  if (event.httpMethod === 'GET') return ok(event, { ok: true, message: 'gitlab-proxy is alive' });
  if (event.httpMethod !== 'POST') return err(event, 405, 'Method not allowed');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err(event, 400, 'Invalid JSON body'); }
  const { target, token } = body;
  if (!target || !token) return err(event, 400, 'Missing "target" or "token"');
  if (!isAllowedUrl(target)) { console.error('gitlab-proxy: blocked URL:', target); return err(event, 403, 'Target URL not allowed'); }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(target, { headers: { 'PRIVATE-TOKEN': token }, signal: controller.signal });
    clearTimeout(timeout);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { statusCode: 200, headers: getHeaders(event), body: JSON.stringify({ status: res.status, data }) };
  } catch (e) {
    return { statusCode: 502, headers: getHeaders(event), body: JSON.stringify({ error: e.name === 'AbortError' ? 'Request timed out' : 'Upstream request failed' }) };
  }
};

module.exports = { handler };
