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

function maskValue(val) {
  if (!val || typeof val !== 'string') return val;
  if (val.length <= 8) return '••••••••';
  return val.slice(0, 4) + '••••' + val.slice(-4);
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
      const env = params.env;

      const snapshot = await db.collection('credentials')
        .select('soaAppId', 'env', 'apiName', 'xApiKey', 'clientId', 'clientSecret', 'aesKey', 'timestamp')
        .orderBy('timestamp', 'desc')
        .limit(200)
        .get();
      let credentials = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          soaAppId: data.soaAppId,
          env: data.env,
          apiName: data.apiName,
          xApiKey: maskValue(data.xApiKey),
          clientId: maskValue(data.clientId),
          clientSecret: maskValue(data.clientSecret),
          aesKey: maskValue(data.aesKey),
          timestamp: data.timestamp?.toDate?.().toISOString() ?? null,
        };
      });

      if (env) {
        credentials = credentials.filter((c) => c.env === env);
      }

      credentials.sort((a, b) => {
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return b.timestamp.localeCompare(a.timestamp);
      });

      return jsonRes(event, { credentials });
    }

    if (event.httpMethod === 'POST') {
      const { soaAppId, env, apiName, xApiKey, clientId, clientSecret, aesKey } =
        JSON.parse(event.body || '{}');

      if (!soaAppId || !env) {
        return errorRes(event, 400, 'soaAppId and env are required');
      }

      const ref = await db.collection('credentials').add({
        soaAppId,
        env,
        apiName: apiName || '',
        xApiKey: xApiKey || '',
        clientId: clientId || '',
        clientSecret: clientSecret || '',
        aesKey: aesKey || '',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return jsonRes(event, { id: ref.id });
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');

      if (!id) {
        return errorRes(event, 400, 'id is required');
      }

      await db.collection('credentials').doc(id).delete();
      return jsonRes(event, { ok: true });
    }

    return errorRes(event, 405, 'Method not allowed');
  } catch (err) {
    console.error('Function error:', err);
    return errorRes(event, 500, 'Internal server error');
  }
};

module.exports = { handler };
