const admin = require('firebase-admin');

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
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const env = params.env;

      let query = db.collection('credentials').orderBy('timestamp', 'desc');

      if (env) {
        query = query.where('env', '==', env);
      }

      const snapshot = await query.get();

      const credentials = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate?.().toISOString() ?? null,
        };
      });

      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials }),
      };
    }

    if (event.httpMethod === 'POST') {
      const { soaAppId, env, apiName, xApiKey, clientId, clientSecret, aesKey } =
        JSON.parse(event.body || '{}');

      if (!soaAppId || !env) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'soaAppId and env are required' }),
        };
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

      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ref.id }),
      };
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');

      if (!id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'id is required' }),
        };
      }

      await db.collection('credentials').doc(id).delete();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

module.exports = { handler };
