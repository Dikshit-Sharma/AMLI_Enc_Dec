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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const snapshot = await db
        .collection('artifacts')
        .orderBy('timestamp', 'desc')
        .get();

      const artifacts = snapshot.docs.map((doc) => {
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
        body: JSON.stringify({ artifacts }),
      };
    }

    if (event.httpMethod === 'POST') {
      const { artifacts } = JSON.parse(event.body || '{}');
      if (!Array.isArray(artifacts) || artifacts.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'artifacts array is required' }),
        };
      }

      const ids = [];
      for (const art of artifacts) {
        const ref = await db.collection('artifacts').add({
          ...art,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        ids.push(ref.id);
      }

      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, count: ids.length }),
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
