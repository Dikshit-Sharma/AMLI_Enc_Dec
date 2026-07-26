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

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: getHeaders(event), body: '' };
  if (event.httpMethod !== 'POST') return err(event, 405, 'Method not allowed');
  if (!GROQ_API_KEY) return err(event, 500, 'AI not configured on server');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err(event, 400, 'Invalid JSON'); }
  const { messages, model, temperature, max_tokens } = body;
  if (!messages || !Array.isArray(messages)) return err(event, 400, 'messages array is required');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
      body: JSON.stringify({ model: model || 'llama-3.3-70b-versatile', messages, temperature: temperature != null ? temperature : 0.2, max_tokens: max_tokens != null ? max_tokens : 2048 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    var data;
    try { data = JSON.parse(text); } catch (_e) { data = { raw: text }; }
    if (!res.ok) { console.error('Groq API error:', res.status); return err(event, 502, 'AI request failed'); }
    return ok(event, data);
  } catch (e) { console.error('Groq proxy error:', e.message); return err(event, 502, 'AI service unavailable'); }
};

module.exports = { handler };
