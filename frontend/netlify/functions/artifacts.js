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
      const params = event.queryStringParameters || {};
      const limit = params.limit ? Math.min(parseInt(params.limit), 200) : null;
      const cursor = params.cursor || null;

      let total = 0;
      try {
        const countSnap = await db.collection('artifacts').count().get();
        total = countSnap.data().count;
      } catch (_) { /* count aggregation may not be available */ }

      let query = db.collection('artifacts').orderBy('timestamp', 'desc');
      if (limit) query = query.limit(limit);
      if (cursor) query = query.startAfter(new Date(cursor));

      const snapshot = await query.get();

      const artifacts = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate?.().toISOString() ?? null,
        };
      });

      const nextCursor =
        limit && snapshot.docs.length === limit
          ? snapshot.docs[snapshot.docs.length - 1]
              .data()
              .timestamp?.toDate?.()
              ?.toISOString() ?? null
          : null;

      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifacts, nextCursor, total }),
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
