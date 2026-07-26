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

function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

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

      if (params.id) {
        const doc = await db.collection('clipboards').doc(params.id).get();
        if (!doc.exists) {
          return errorRes(event, 404, 'Clipboard not found');
        }
        return jsonRes(event, { id: doc.id, ...doc.data() });
      }

      const snapshot = await db.collection('clipboards')
        .orderBy('updatedAt', 'desc')
        .limit(50)
        .get();
      const clipboards = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      return jsonRes(event, { clipboards });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      if (body.action === 'create') {
        let id = generateId();
        let attempts = 0;
        while (attempts < 5) {
          const exists = await db.collection('clipboards').doc(id).get();
          if (!exists.exists) break;
          id = generateId();
          attempts++;
        }

        const data = {
          title: body.title || 'Untitled Clipboard',
          content: '',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          version: 0,
        };

        await db.collection('clipboards').doc(id).set(data);
        return jsonRes(event, { id, ...data });
      }

      if (body.action === 'update' && body.id) {
        const updateData = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          version: admin.firestore.FieldValue.increment(1),
        };
        if (body.title !== undefined) updateData.title = body.title;
        if (body.content !== undefined) updateData.content = body.content;

        await db.collection('clipboards').doc(body.id).update(updateData);
        return jsonRes(event, { ok: true });
      }

      return errorRes(event, 400, 'Invalid action');
    }

    if (event.httpMethod === 'DELETE') {
      const body = JSON.parse(event.body || '{}');
      if (!body.id) {
        return errorRes(event, 400, 'id is required');
      }
      await db.collection('clipboards').doc(body.id).delete();
      return jsonRes(event, { ok: true });
    }

    return errorRes(event, 405, 'Method not allowed');
  } catch (err) {
    console.error('Clipboard function error:', err);
    return errorRes(event, 500, 'Internal server error');
  }
};

module.exports = { handler };
