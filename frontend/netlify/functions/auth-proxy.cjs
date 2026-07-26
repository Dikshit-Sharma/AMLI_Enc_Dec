const { corsHeaders, jsonRes, errorRes } = require('./auth');

const LIB_PASSWORD = process.env.LIB_PASSWORD || '';

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return errorRes(event, 405, 'Method not allowed');
  }

  if (!LIB_PASSWORD) {
    return errorRes(event, 500, 'Auth not configured');
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return errorRes(event, 400, 'Invalid JSON');
  }

  const { password } = body;
  if (!password) {
    return errorRes(event, 400, 'password is required');
  }

  const valid = password === LIB_PASSWORD;
  return jsonRes(event, { valid });
};

module.exports = { handler };
