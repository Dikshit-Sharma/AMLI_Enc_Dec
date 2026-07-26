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

const FIREBASE_SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (admin.apps.length === 0) { admin.initializeApp({ credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT) }); }
const db = admin.firestore();

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: getHeaders(event), body: '' };
  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const { tokenHash, baseUrl } = params;
      if (!tokenHash || !baseUrl) return err(event, 400, 'tokenHash and baseUrl required');
      const snap = await db.collection('api-lib-cache').where('tokenHash', '==', tokenHash).where('baseUrl', '==', baseUrl).get();
      const projects = [];
      snap.forEach(doc => { const d = doc.data(); projects.push({ id: d.projectId, projectName: d.projectName, projectUrl: d.projectUrl, endpoints: d.endpoints || [] }); });
      return ok(event, { projects });
    }
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { tokenHash, baseUrl, projects } = body;
      if (!tokenHash || !baseUrl || !Array.isArray(projects)) return err(event, 400, 'tokenHash, baseUrl, and projects array required');
      const batch = db.batch();
      for (const p of projects) {
        const docId = tokenHash + '_' + p.id;
        batch.set(db.collection('api-lib-cache').doc(docId), { tokenHash, baseUrl, projectId: p.id, projectName: p.name, projectUrl: p.webUrl, endpoints: p.endpoints || [], scannedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
      await batch.commit();
      return ok(event, { ok: true, count: projects.length });
    }
    return err(event, 405, 'Method not allowed');
  } catch (e) { console.error('api-lib-cache error:', e); return err(event, 500, 'Internal server error'); }
};

module.exports = { handler };
