const ALLOWED_ORIGINS = [
  'https://amliaes.netlify.app',
  'http://localhost:5173',
  'http://localhost:8888',
];

function getAllowedOrigin(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0];
}

function corsHeaders(event) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(event),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function verifyApiKey(event) {
  const apiKey = process.env.API_SECRET_KEY;
  if (!apiKey) return true;
  const provided = event?.headers?.['x-api-key'] || event?.queryStringParameters?.apiKey || '';
  return provided === apiKey;
}

function jsonRes(event, data, status = 200) {
  return {
    statusCode: status,
    headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

function errorRes(event, status = 500, message = 'Internal server error') {
  return jsonRes(event, { error: message }, status);
}

module.exports = { corsHeaders, verifyApiKey, jsonRes, errorRes, ALLOWED_ORIGINS };
