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
      const params = event.queryStringParameters || {};

      if (params.history) {
        const snap = await db.collection('bsa').doc(params.history)
          .collection('history').orderBy('timestamp', 'desc').limit(50).get();
        const versions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ versions }),
        };
      }

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
      const { id, api, consumers, bulkUpdate } = JSON.parse(event.body || '{}');

      if (!id && !bulkUpdate) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'id is required' }),
        };
      }

      if (bulkUpdate && bulkUpdate.ids?.length > 0) {
        const batch = db.batch();
        for (const entryId of bulkUpdate.ids) {
          const docRef = db.collection('bsa').doc(entryId);
          const docSnap = await docRef.get();
          if (docSnap.exists) {
            const old = docSnap.data();
            const newConsumers = (old.consumers || []).map(c => {
              if (bulkUpdate.newSpoc !== undefined) return { ...c, spoc: bulkUpdate.newSpoc };
              return c;
            });
            batch.update(docRef, {
              consumers: newConsumers,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            const historyRef = docRef.collection('history').doc();
            batch.set(historyRef, {
              before: { consumers: old.consumers },
              after: { consumers: newConsumers },
              changeType: 'bulk-edit',
              detail: bulkUpdate.newSpoc !== undefined ? `SPOC → ${bulkUpdate.newSpoc}` : '',
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
        await batch.commit();
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ok: true, updated: bulkUpdate.ids.length }),
        };
      }

      const docRef = db.collection('bsa').doc(id);
      const docSnap = await docRef.get();
      const oldData = docSnap.exists ? docSnap.data() : null;

      const updateData = {};
      if (api !== undefined) updateData.api = api;
      if (consumers !== undefined) updateData.consumers = consumers;
      updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await docRef.update(updateData);

      if (oldData) {
        const historyRef = docRef.collection('history').doc();
        await historyRef.set({
          before: { api: oldData.api, consumers: oldData.consumers },
          after: { api: updateData.api || oldData.api, consumers: updateData.consumers || oldData.consumers },
          changeType: 'edit',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

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
