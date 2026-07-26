const { corsHeaders, verifyApiKey, jsonRes, errorRes } = require('./auth');

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }

  if (!verifyApiKey(event)) {
    return errorRes(event, 401, 'Unauthorized');
  }

  if (event.httpMethod !== 'POST') {
    return errorRes(event, 405, 'Method not allowed');
  }

  if (!GROQ_API_KEY) {
    return errorRes(event, 500, 'AI not configured on server');
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return errorRes(event, 400, 'Invalid JSON');
  }

  const { messages, model, temperature, max_tokens } = body;
  if (!messages || !Array.isArray(messages)) {
    return errorRes(event, 400, 'messages array is required');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || 'llama-3.3-70b-versatile',
        messages,
        temperature: temperature ?? 0.2,
        max_tokens: max_tokens ?? 2048,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
      console.error('Groq API error:', res.status, text.slice(0, 500));
      return errorRes(event, res.status, 'AI request failed');
    }

    return jsonRes(event, data);
  } catch (err) {
    console.error('Groq proxy error:', err.message);
    return errorRes(event, 502, 'AI service unavailable');
  }
};

module.exports = { handler };
