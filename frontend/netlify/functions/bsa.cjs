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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const snapshot = await db.collection('bsa')
        .orderBy('api', 'asc')
        .limit(2000)
        .get();
      const entries = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const body = JSON.stringify({ entries });
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body,
      };
    }

    if (event.httpMethod === 'POST') {
      const { api, consumers } = JSON.parse(event.body || '{}');

      if (!api) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'api is required' }),
        };
      }

      const ref = await db.collection('bsa').add({
        api,
        consumers: consumers || [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ref.id }),
      };
    }

    if (event.httpMethod === 'PUT') {
      const { id, api, consumers } = JSON.parse(event.body || '{}');

      if (!id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'id is required' }),
        };
      }

      const updateData = {};
      if (api !== undefined) updateData.api = api;
      if (consumers !== undefined) updateData.consumers = consumers;
      updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection('bsa').doc(id).update(updateData);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true }),
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

      await db.collection('bsa').doc(id).delete();

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
    console.error('BSA function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

module.exports = { handler };
