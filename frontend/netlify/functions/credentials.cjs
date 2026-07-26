const admin = require('firebase-admin');

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

let db;
try {
  const FIREBASE_SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error('FIREBASE_SERVICE_ACCOUNT env var is not set');
  }
  if (Object.keys(FIREBASE_SERVICE_ACCOUNT).length === 0) {
    console.error('FIREBASE_SERVICE_ACCOUNT parsed to empty object');
  }
  if (admin.apps.length === 0) { admin.initializeApp({ credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT) }); }
  db = admin.firestore();
} catch (initErr) {
  console.error('Firebase admin init error:', initErr.message, initErr.stack);
}

function maskValue(val) {
  if (!val || typeof val !== 'string') return val;
  if (val.length <= 8) return '••••••••';
  return val.slice(0, 4) + '••••' + val.slice(-4);
}

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: getHeaders(event), body: '' };
  if (!db) return err(event, 500, 'Firebase not initialized. Check FIREBASE_SERVICE_ACCOUNT env var.');
  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const env = params.env;
      const snapshot = await db.collection('credentials').select('soaAppId', 'env', 'apiName', 'xApiKey', 'clientId', 'clientSecret', 'aesKey', 'timestamp').orderBy('timestamp', 'desc').limit(200).get();
      let credentials = snapshot.docs.map((doc) => {
        const data = doc.data();
        return { id: doc.id, soaAppId: data.soaAppId, env: data.env, apiName: data.apiName, xApiKey: maskValue(data.xApiKey), clientId: maskValue(data.clientId), clientSecret: maskValue(data.clientSecret), aesKey: maskValue(data.aesKey), timestamp: data.timestamp?.toDate?.().toISOString() ?? null };
      });
      if (env) credentials = credentials.filter((c) => c.env === env);
      credentials.sort((a, b) => { if (!a.timestamp) return 1; if (!b.timestamp) return -1; return b.timestamp.localeCompare(a.timestamp); });
      return ok(event, { credentials });
    }
    if (event.httpMethod === 'POST') {
      const { soaAppId, env, apiName, xApiKey, clientId, clientSecret, aesKey } = JSON.parse(event.body || '{}');
      if (!soaAppId || !env) return err(event, 400, 'soaAppId and env are required');
      const ref = await db.collection('credentials').add({ soaAppId, env, apiName: apiName || '', xApiKey: xApiKey || '', clientId: clientId || '', clientSecret: clientSecret || '', aesKey: aesKey || '', timestamp: admin.firestore.FieldValue.serverTimestamp() });
      return ok(event, { id: ref.id });
    }
    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      if (!id) return err(event, 400, 'id is required');
      await db.collection('credentials').doc(id).delete();
      return ok(event, { ok: true });
    }
    return err(event, 405, 'Method not allowed');
  } catch (e) { console.error('credentials error:', e); return err(event, 500, e.message || 'Internal server error'); }
};

module.exports = { handler };
