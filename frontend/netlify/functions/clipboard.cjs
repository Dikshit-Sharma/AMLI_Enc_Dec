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

const CONVEX_URL = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || '';

async function convexQuery(path, args) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Convex query error ${res.status}: ${t}`); }
  return (await res.json()).value;
}

async function convexMutation(path, args) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Convex mutation error ${res.status}: ${t}`); }
  return (await res.json()).value;
}

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: getHeaders(event), body: '' };
  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      if (params.id) {
        const doc = await convexQuery('clipboards:get', { clipboardId: params.id });
        if (!doc) return err(event, 404, 'Clipboard not found');
        return ok(event, { id: doc.id, title: doc.title, content: doc.content, version: doc.version });
      }
      const rows = await convexQuery('clipboards:getAll', {});
      return ok(event, { clipboards: rows });
    }
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (body.action === 'create') {
        const result = await convexMutation('clipboards:create', { title: body.title || 'Untitled Clipboard' });
        return ok(event, { id: result.id, title: body.title || 'Untitled Clipboard', content: '', version: 0 });
      }
      if (body.action === 'update' && body.id) {
        const args = { clipboardId: body.id };
        if (body.title !== undefined) args.title = body.title;
        if (body.content !== undefined) args.content = body.content;
        await convexMutation('clipboards:update', args);
        return ok(event, { ok: true });
      }
      return err(event, 400, 'Invalid action');
    }
    if (event.httpMethod === 'DELETE') {
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return err(event, 400, 'id is required');
      await convexMutation('clipboards:remove', { clipboardId: body.id });
      return ok(event, { ok: true });
    }
    return err(event, 405, 'Method not allowed');
  } catch (e) { console.error('clipboard proxy error:', e); return err(event, 500, e.message); }
};

module.exports = { handler };