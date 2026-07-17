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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function streamJson(data) {
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  return new Response(
    new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(encoded);
        ctrl.close();
      },
    }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } }
  );
}

function formatArtifact(doc, summary) {
  const d = doc.data();
  const art = {
    id: doc.id,
    apiName: d.apiName,
    jiraTicket: d.jiraTicket,
    env: d.env,
    encryption: d.encryption,
    aesKey: d.aesKey,
    algo: d.algo,
    numRequests: d.numRequests,
    extraRequests: d.extraRequests,
    timestamp: d.timestamp?.toDate?.()?.toISOString() ?? null,
  };
  if (!summary) {
    art.curl = d.curl;
    art.response = d.response;
  }
  return art;
}

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

module.exports = {
  fetch: async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    try {
      if (req.method === 'GET') {
        const url = new URL(req.url);
        const params = url.searchParams;

        const id = params.get('id');
        if (id) {
          const doc = await db.collection('artifacts').doc(id).get();
          if (!doc.exists) return json({ error: 'Not found' }, 404);
          return json({ artifact: formatArtifact(doc, false) });
        }

        if (params.get('extract-credentials') === '1') {
          const snapshot = await db.collection('artifacts').orderBy('timestamp', 'desc').get();
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
          return json({ credentials: grouped, totalArtifacts: snapshot.docs.length });
        }

        const summary = params.get('summary') === '1';
        const search = params.get('search')?.toLowerCase();
        const limit = params.get('limit')
          ? Math.min(parseInt(params.get('limit')), 100)
          : 50;
        const cursor = params.get('cursor') || null;

        let total = 0;
        try {
          const countSnap = await db.collection('artifacts').count().get();
          total = countSnap.data().count;
        } catch (_) { /* count may not be available */ }

        const fetchLimit = search ? 500 : limit;
        let query = db.collection('artifacts').orderBy('timestamp', 'desc').limit(fetchLimit);
        if (cursor) query = query.startAfter(new Date(cursor));

        const snapshot = await query.get();
        let artifacts = snapshot.docs.map((doc) => formatArtifact(doc, summary));

        if (search) {
          artifacts = artifacts.filter((art) =>
            art.apiName?.toLowerCase().includes(search) ||
            art.jiraTicket?.toLowerCase().includes(search) ||
            art.env?.toLowerCase().includes(search) ||
            (!summary && art.curl?.toLowerCase().includes(search))
          );
        }

        const nextCursor =
          snapshot.docs.length === fetchLimit
            ? snapshot.docs[snapshot.docs.length - 1]
                .data().timestamp?.toDate?.()?.toISOString() ?? null
            : null;

        return streamJson({ artifacts, nextCursor, total });
      }

      if (req.method === 'POST') {
        const { artifacts } = await req.json();
        if (!Array.isArray(artifacts) || artifacts.length === 0) {
          return json({ error: 'artifacts array is required' }, 400);
        }

        const ids = [];
        for (const art of artifacts) {
          const ref = await db.collection('artifacts').add({
            ...art,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
          ids.push(ref.id);
        }

        return json({ ids, count: ids.length });
      }

      return json({ error: 'Method not allowed' }, 405);
    } catch (err) {
      console.error('Function error:', err);
      return json({ error: err.message }, 500);
    }
  },
};
