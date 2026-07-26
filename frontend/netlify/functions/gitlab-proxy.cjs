const { corsHeaders, verifyApiKey, errorRes } = require('./auth');

const ALLOWED_GITLAB_HOSTS = [
  'gitlab.com',
  'gitlab.nvidia.com',
  'gitlab.internal',
];

function isAllowedUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_GITLAB_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }

  if (!verifyApiKey(event)) {
    return errorRes(event, 401, 'Unauthorized');
  }

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: corsHeaders(event),
      body: JSON.stringify({ ok: true, message: 'gitlab-proxy is alive' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return errorRes(event, 405, 'Method not allowed');
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return errorRes(event, 400, 'Invalid JSON body');
  }

  const { target, token } = body;
  if (!target || !token) {
    return errorRes(event, 400, 'Missing "target" or "token"');
  }

  if (!isAllowedUrl(target)) {
    console.error('GitLab proxy: blocked URL:', target);
    return errorRes(event, 403, 'Target URL not allowed');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(target, { headers: { 'PRIVATE-TOKEN': token }, signal: controller.signal });
    clearTimeout(timeout);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: res.status, data }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: corsHeaders(event),
      body: JSON.stringify({
        error: err.name === 'AbortError' ? 'Request timed out' : 'Upstream request failed',
      }),
    };
  }
};

module.exports = { handler };
