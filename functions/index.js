const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

exports.artifacts = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    if (req.method === 'GET') {
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

      res.json({ artifacts });
      return;
    }

    if (req.method === 'POST') {
      const { artifacts } = req.body;
      if (!Array.isArray(artifacts) || artifacts.length === 0) {
        res.status(400).json({ error: 'artifacts array is required' });
        return;
      }

      const ids = [];
      for (const art of artifacts) {
        const ref = await db.collection('artifacts').add({
          ...art,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        ids.push(ref.id);
      }

      res.json({ ids, count: ids.length });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Function error:', err);
    res.status(500).json({ error: err.message });
  }
});
