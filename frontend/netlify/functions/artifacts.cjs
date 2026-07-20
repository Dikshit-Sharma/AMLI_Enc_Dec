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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonRes(data, status = 200) {
  return {
    statusCode: status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

const SUMMARY_FIELDS = ['apiName', 'jiraTicket', 'env', 'encryption', 'aesKey', 'algo', 'numRequests', 'timestamp'];

const CREDENTIAL_KEYS = [
  'x-api-key', 'x-apigw-api-id', 'xapigwapiid',
  'clientid', 'client_id', 'client-id',
  'clientsecret', 'client_secret', 'client-secret',
  'appid', 'soaappid',
];

function parseCurlForHeaders(curlString) {
  const headers = {};
  if (!curlString) return headers;
  const headerRegex = /-(?:H|-header)\s+["']([^"']+)["']/g;
  let match;
  while ((match = headerRegex.exec(curlString)) !== null) {
    const [key, ...values] = match[1].split(':');
    if (key && values.length) {
      headers[key.trim()] = values.join(':').trim();
    }
  }
  return headers;
}

function parseCurlBody(curlString) {
  if (!curlString) return null;
  const bodyMatch = curlString.match(/-(?:d|-data(?:-raw)?)\s+["']({[\s\S]+?})["']/);
  if (!bodyMatch) return null;
  try {
    return JSON.parse(bodyMatch[1]);
  } catch {
    return null;
  }
}

function findCredentialsInObject(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 3) return {};
  const found = {};
  for (const [key, value] of Object.entries(obj)) {
    const lk = key.toLowerCase();
    if (typeof value === 'string' && value.length > 0) {
      for (const ck of CREDENTIAL_KEYS) {
        if (lk === ck) found[ck] = value;
      }
    }
    if (typeof value === 'object') {
      const nested = findCredentialsInObject(value, depth + 1);
      Object.assign(found, nested);
    }
  }
  return found;
}

function tryParseJson(str) {
  if (!str || typeof str !== 'string') return null;
  try { return JSON.parse(str); } catch { return null; }
}

function extractCredentialsFromArtifact(doc) {
  const d = doc.data();
  const art = { id: doc.id, ...d };
  if (!art.env) return null;
  const found = {};
  const headers = parseCurlForHeaders(art.curl);
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    for (const ck of CREDENTIAL_KEYS) {
      if (lk === ck) found[ck] = v;
    }
  }
  const body = parseCurlBody(art.curl);
  if (body) Object.assign(found, findCredentialsInObject(body));
  const responseObj = tryParseJson(art.response);
  if (responseObj) Object.assign(found, findCredentialsInObject(responseObj));
  if (Array.isArray(art.extraRequests)) {
    for (const extra of art.extraRequests) {
      if (extra.response) {
        const extraRes = tryParseJson(extra.response);
        if (extraRes) Object.assign(found, findCredentialsInObject(extraRes));
      }
    }
  }
  const xApiKey = found['x-api-key'] || found['x-apigw-api-id'] || found['xapigwapiid'] || '';
  const clientId = found['clientid'] || found['client_id'] || found['client-id'] || '';
  const clientSecret = found['clientsecret'] || found['client_secret'] || found['client-secret'] || '';
  const aesKey = art.aesKey || found['aeskey'] || '';
  const appId = found['soaappid'] || found['appid'] || '';
  if (!xApiKey && !clientId && !clientSecret && !aesKey) return null;
  return {
    id: `art_${art.id}`,
    soaAppId: appId || art.jiraTicket || 'Unknown',
    apiName: art.apiName || '',
    env: art.env,
    xApiKey, clientId, clientSecret, aesKey,
    _source: 'artifact',
  };
}

function deduplicate(list) {
  const seen = new Set();
  return list.filter((item) => {
    const key = `${item.xApiKey}|${item.clientId}|${item.clientSecret}|${item.aesKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const handler = async (event) => {
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  try {
    if (method === 'GET') {
      if (params.id) {
        const doc = await db.collection('artifacts').doc(params.id).get();
        if (!doc.exists) return jsonRes({ error: 'Not found' }, 404);
        const data = doc.data();
        return jsonRes({
          artifact: {
            id: doc.id,
            ...data,
            timestamp: data.timestamp?.toDate?.().toISOString() ?? null,
          },
        });
      }

      if (params.stats === '1') {
        let total = 0;
        try {
          const countSnap = await db.collection('artifacts').count().get();
          total = countSnap.data().count;
        } catch (_) {}

        const envCounts = {};
        const dateCounts = {};
        const dateEnvCounts = {};
        const monthEnvCounts = {};
        const apiCounts = {};

        const MAX_DOCS = 5000;
        const snap = await db.collection('artifacts')
          .select('env', 'apiName', 'timestamp')
          .orderBy('timestamp', 'desc')
          .limit(MAX_DOCS)
          .get();

        const recent = [];
        for (const d of snap.docs) {
          const data = d.data();
          const env = data.env || 'DEV';
          envCounts[env] = (envCounts[env] || 0) + 1;

          const ts = data.timestamp?.toDate?.();
          if (ts) {
            const dateStr = ts.toISOString().slice(0, 10);
            dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
            const deKey = dateStr + '|' + env;
            dateEnvCounts[deKey] = (dateEnvCounts[deKey] || 0) + 1;
            const monthStr = ts.toISOString().slice(0, 7);
            const meKey = monthStr + '|' + env;
            monthEnvCounts[meKey] = (monthEnvCounts[meKey] || 0) + 1;
          }

          const apiName = data.apiName || 'Unknown';
          const ak = apiName + '|' + env;
          apiCounts[ak] = (apiCounts[ak] || 0) + 1;

          if (recent.length < 5) {
            recent.push({ id: d.id, ...data, timestamp: data.timestamp?.toDate?.().toISOString() ?? null });
          }
        }

        const activity = Object.entries(dateCounts).map(([date, count]) => ({ date, count }));
        const dailyVelocity = Object.entries(dateEnvCounts).map(([key, count]) => {
          const [date, env] = key.split('|');
          return { date, env, count };
        });
        const velocity = Object.entries(monthEnvCounts).map(([key, count]) => {
          const [month, env] = key.split('|');
          return { month, env, count };
        });
        const topApis = Object.entries(apiCounts)
          .map(([key, count]) => {
            const [apiName, env] = key.split('|');
            return { apiName, env, count };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 20);
        const sampledCount = snap.docs.length;

        const body = JSON.stringify({ total, envCounts, recent, activity, dailyVelocity, velocity, topApis, sampledCount });
        console.log('stats size:', body.length, 'sampled:', sampledCount);
        if (body.length > 5_000_000) {
          console.error('stats payload still too large:', body.length);
          return jsonRes({
            total, envCounts, recent: [],
            activity: [], dailyVelocity: [], velocity: [], topApis: [],
            sampledCount, _truncated: true,
          });
        }
        return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body };
      }

      if (params['extract-credentials'] === '1') {
        const snapshot = await db.collection('artifacts')
          .select('apiName', 'jiraTicket', 'env', 'aesKey', 'curl', 'response', 'extraRequests')
          .orderBy('timestamp', 'desc')
          .limit(200)
          .get();
        const grouped = { DEV: [], UAT: [], PROD: [] };
        for (const doc of snapshot.docs) {
          const entry = extractCredentialsFromArtifact(doc);
          if (entry && ['DEV', 'UAT', 'PROD'].includes(entry.env)) {
            grouped[entry.env].push(entry);
          }
        }
        for (const env of Object.keys(grouped)) {
          grouped[env] = deduplicate(grouped[env]);
        }
        const credBody = JSON.stringify({ credentials: grouped, totalArtifacts: snapshot.docs.length });
        console.log('extract-credentials size:', credBody.length);
        if (credBody.length > 5_000_000) {
          console.error('extract-credentials payload too large:', credBody.length);
          return jsonRes({ credentials: { DEV: [], UAT: [], PROD: [] }, totalArtifacts: 0, _truncated: true });
        }
        return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: credBody };
      }

      const search = params.search?.toLowerCase();
      const pageSize = params.limit
        ? Math.min(parseInt(params.limit), 50)
        : 20;
      const cursor = params.cursor || null;

      let total = 0;
      try {
        const countSnap = await db.collection('artifacts').count().get();
        total = countSnap.data().count;
      } catch (_) {}

      if (search) {
        const fetchLimit = 500;
        let q = db.collection('artifacts').select(...SUMMARY_FIELDS).orderBy('timestamp', 'desc').limit(fetchLimit);
        if (cursor) q = q.startAfter(new Date(cursor));
        const snapshot = await q.get();
        let artifacts = snapshot.docs.map((doc) => {
          const data = doc.data();
          return { id: doc.id, ...data, timestamp: data.timestamp?.toDate?.().toISOString() ?? null };
        });
        artifacts = artifacts.filter((a) =>
          a.apiName?.toLowerCase().includes(search) ||
          a.jiraTicket?.toLowerCase().includes(search) ||
          a.env?.toLowerCase().includes(search)
        );
        return jsonRes({ artifacts, nextCursor: null, total });
      }

      let q = db.collection('artifacts').select(...SUMMARY_FIELDS).orderBy('timestamp', 'desc').limit(pageSize);
      if (cursor) q = q.startAfter(new Date(cursor));
      const snapshot = await q.get();
      const artifacts = snapshot.docs.map((doc) => {
        const data = doc.data();
        return { id: doc.id, ...data, timestamp: data.timestamp?.toDate?.().toISOString() ?? null };
      });
      const nextCursor =
        snapshot.docs.length === pageSize
          ? snapshot.docs[snapshot.docs.length - 1]
              .data().timestamp?.toDate?.()?.toISOString() ?? null
          : null;

      const listBody = JSON.stringify({ artifacts, nextCursor, total });
      console.log('list size:', listBody.length, 'count:', artifacts.length);
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: listBody };
    }

    if (method === 'POST') {
      const { artifacts } = JSON.parse(event.body || '{}');
      if (!Array.isArray(artifacts) || artifacts.length === 0) {
        return jsonRes({ error: 'artifacts array is required' }, 400);
      }

      const ids = [];
      for (const art of artifacts) {
        const ref = await db.collection('artifacts').add({
          ...art,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        ids.push(ref.id);
      }

      return jsonRes({ ids, count: ids.length });
    }

    return jsonRes({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Function error:', err);
    return jsonRes({ error: err.message }, 500);
  }
};

module.exports = { handler };
