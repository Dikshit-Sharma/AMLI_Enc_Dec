const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// ─── API LIB: store/retrieve scan results per project ─────
exports.apiLib = functions.region('us-central1').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    if (req.method === 'POST') {
      const { tokenHash, baseUrl, projects } = req.body;
      if (!tokenHash || !baseUrl || !Array.isArray(projects)) {
        res.status(400).json({ error: 'tokenHash, baseUrl, and projects[] required' });
        return;
      }

      const batch = db.batch();
      for (const proj of projects) {
        if (!proj.id) continue;
        const docRef = db.collection('api-lib-cache').doc(`${tokenHash}_${proj.id}`);
        batch.set(docRef, {
          tokenHash,
          baseUrl,
          projectId: proj.id,
          projectName: proj.name || '',
          projectUrl: proj.webUrl || '',
          endpoints: proj.endpoints || [],
          scannedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      res.json({ ok: true, count: projects.length });
      return;
    }

    if (req.method === 'GET') {
      const tokenHash = (req.query.tokenHash || '').trim();
      const baseUrl = (req.query.baseUrl || '').trim();
      if (!tokenHash || !baseUrl) {
        res.status(400).json({ error: 'tokenHash and baseUrl query params required' });
        return;
      }

      const snapshot = await db
        .collection('api-lib-cache')
        .where('tokenHash', '==', tokenHash)
        .where('baseUrl', '==', baseUrl)
        .get();

      const projects = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          projectId: d.projectId,
          projectName: d.projectName,
          projectUrl: d.projectUrl,
          endpoints: d.endpoints || [],
          scannedAt: d.scannedAt?.toDate?.().toISOString() ?? null,
        };
      });

      res.json({ projects, count: projects.length });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('apiLib error:', err);
    res.status(500).json({ error: err.message });
  }
});

exports.artifacts = functions.region('us-central1').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    if (req.method === 'GET') {
      const search = (req.query.search || '').trim().toLowerCase();
      const rawLimit = req.query.limit ? parseInt(req.query.limit) : 0;
      const cursor = req.query.cursor || null;

      // If search is present, fetch ALL and filter server-side
      if (search) {
        const snapshot = await db
          .collection('artifacts')
          .orderBy('timestamp', 'desc')
          .get();

        let artifacts = snapshot.docs.map((doc) => {
          const data = doc.data();
          return { id: doc.id, ...data, timestamp: data.timestamp?.toDate?.().toISOString() ?? null };
        });

        artifacts = artifacts.filter(a =>
          (a.apiName && a.apiName.toLowerCase().includes(search)) ||
          (a.jiraTicket && a.jiraTicket.toLowerCase().includes(search)) ||
          (a.env && a.env.toLowerCase().includes(search)) ||
          (a.curl && a.curl.toLowerCase().includes(search))
        );

        res.json({ artifacts, total: artifacts.length });
        return;
      }

      // No limit → return ALL artifacts (for no-pagination frontend)
      if (!rawLimit || rawLimit <= 0) {
        const snapshot = await db
          .collection('artifacts')
          .orderBy('timestamp', 'desc')
          .get();

        const artifacts = snapshot.docs.map((doc) => {
          const data = doc.data();
          return { id: doc.id, ...data, timestamp: data.timestamp?.toDate?.().toISOString() ?? null };
        });

        res.json({ artifacts, total: artifacts.length });
        return;
      }

      // Paginated: limit + cursor
      const limit = Math.min(rawLimit, 100);
      let query = db
        .collection('artifacts')
        .orderBy('timestamp', 'desc')
        .limit(limit + 1);

      if (cursor) {
        const cursorDoc = await db.collection('artifacts').doc(cursor).get();
        if (cursorDoc.exists) query = query.startAfter(cursorDoc);
      }

      const snapshot = await query.get();
      const docs = snapshot.docs.slice(0, limit);
      const nextCursor = snapshot.docs.length > limit ? snapshot.docs[limit].id : null;

      const artifacts = docs.map((doc) => {
        const data = doc.data();
        return { id: doc.id, ...data, timestamp: data.timestamp?.toDate?.().toISOString() ?? null };
      });

      res.json({ artifacts, nextCursor, total: null });
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
