const admin = require('firebase-admin');

const ALLOWED_ORIGINS = ['https://amliaes.netlify.app', 'http://localhost:5173', 'http://localhost:8888'];
function getHeaders(event) {
  const origin = (event && event.headers && (event.headers.origin || event.headers.Origin)) || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: getHeaders(event), body: '' };
  const report = { timestamp: new Date().toISOString() };
  try {
    report.envSet = !!process.env.FIREBASE_SERVICE_ACCOUNT;
    report.envLength = (process.env.FIREBASE_SERVICE_ACCOUNT || '').length;
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    report.saKeys = Object.keys(sa);
    report.projectId = sa.project_id || 'NOT_FOUND';
    if (admin.apps.length === 0) {
      admin.initializeApp({ credential: admin.credential.cert(sa) });
    }
    report.adminInitialized = true;
    const db = admin.firestore();
    report.firestoreCreated = true;
    const snap = await db.collection('credentials').limit(1).get();
    report.querySuccess = true;
    report.docCount = snap.docs.length;
    return { statusCode: 200, headers: getHeaders(event), body: JSON.stringify(report) };
  } catch (e) {
    report.error = e.message;
    report.stack = e.stack;
    return { statusCode: 500, headers: getHeaders(event), body: JSON.stringify(report) };
  }
};

module.exports = { handler };
