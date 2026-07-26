const admin = require('firebase-admin');
const { corsHeaders, verifyApiKey, jsonRes, errorRes } = require('./auth');

const FIREBASE_SERVICE_ACCOUNT = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT || '{}'
);

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT),
  });
}

const db = admin.firestore();

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }

  if (!verifyApiKey(event)) {
    return errorRes(event, 401, 'Unauthorized');
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const { tokenHash, baseUrl } = params;
      if (!tokenHash || !baseUrl) {
        return errorRes(event, 400, 'tokenHash and baseUrl required');
      }

      const snap = await db.collection('api-lib-cache')
        .where('tokenHash', '==', tokenHash)
        .where('baseUrl', '==', baseUrl)
        .get();

      const projects = [];
      snap.forEach(doc => {
        const d = doc.data();
        projects.push({
          id: d.projectId,
          projectName: d.projectName,
          projectUrl: d.projectUrl,
          endpoints: d.endpoints || [],
        });
      });

      return jsonRes(event, { projects });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { tokenHash, baseUrl, projects } = body;
      if (!tokenHash || !baseUrl || !Array.isArray(projects)) {
        return errorRes(event, 400, 'tokenHash, baseUrl, and projects array required');
      }

      const batch = db.batch();
      for (const p of projects) {
        const docId = tokenHash + '_' + p.id;
        const ref = db.collection('api-lib-cache').doc(docId);
        batch.set(ref, {
          tokenHash: tokenHash,
          baseUrl: baseUrl,
          projectId: p.id,
          projectName: p.name,
          projectUrl: p.webUrl,
          endpoints: p.endpoints || [],
          scannedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();

      return jsonRes(event, { ok: true, count: projects.length });
    }

    return errorRes(event, 405, 'Method not allowed');
  } catch (err) {
    console.error('Function error:', err);
    return errorRes(event, 500, 'Internal server error');
  }
};

module.exports = { handler };
