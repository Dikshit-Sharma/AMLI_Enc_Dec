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

function authHeader(token) {
  return 'Basic ' + Buffer.from(token + ':' + token).toString('base64');
}

async function fetchJenkins(url, auth) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': auth },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Jenkins returned ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJenkinsXml(url, auth) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': auth },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractEnv(name) {
  const lower = name.toLowerCase();
  if (lower.includes('prod') || lower.includes('production')) return 'PROD';
  if (lower.includes('uat') || lower.includes('staging') || lower.includes('stage')) return 'UAT';
  if (lower.includes('dev') || lower.includes('develop') || lower.includes('test') || lower.includes('qa')) return 'DEV';
  return 'OTHER';
}

function extractRepoUrl(configXml) {
  if (!configXml) return null;
  const urlMatch = configXml.match(/<url>(.*?)<\/url>/i);
  return urlMatch ? urlMatch[1].trim() : null;
}

function extractBranch(configXml) {
  if (!configXml) return null;
  const branchMatch = configXml.match(/<branches>.*?<name>\*\*(.*?)\*\*<\/name>.*?<\/branches>/is);
  if (branchMatch) return branchMatch[1].trim();
  const masterMatch = configXml.match(/<name>\*\*(master|main)\*\*<\/name>/i);
  return masterMatch ? masterMatch[1] : null;
}

function extractPropertyFiles(configXml) {
  if (!configXml) return [];
  const files = [];
  const patterns = [
    /--spring\.config\.(?:name|location)=["']?([^\s"'&]+)/gi,
    /-DpropertyFile=["']?([^\s"'&]+)/gi,
    /-Dconfig\.file=["']?([^\s"'&]+)/gi,
    /config\/([\w.-]+\.(?:properties|yml|yaml))/gi,
    /([\w.-]+\.properties)/gi,
    /([\w.-]+\.ya?ml)/gi,
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(configXml)) !== null) {
      const f = m[1].trim();
      if (!files.includes(f) && !f.includes('pom.xml') && !f.includes('package.json')) {
        files.push(f);
      }
    }
  }
  return files;
}

function extractParametersFromBuild(buildData) {
  const params = [];
  const actions = buildData?.actions || [];
  for (const action of actions) {
    if (action._class === 'hudson.model.ParametersAction' && action.parameters) {
      for (const p of action.parameters) {
        params.push({ name: p.name, value: p.value });
      }
    }
  }
  return params;
}

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { action } = body;

  try {
    if (action === 'save_connection') {
      const { jenkinsUrl, label, jobs } = body;
      if (!jenkinsUrl) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'jenkinsUrl required' }) };
      }
      const docRef = await db.collection('jenkins_connections').add({
        jenkinsUrl,
        label: label || jenkinsUrl,
        jobs: jobs || [],
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docRef.id, saved: true }),
      };
    }

    if (action === 'load_connection') {
      const { id } = body;
      let snap;
      if (id) {
        snap = await db.collection('jenkins_connections').doc(id).get();
        if (!snap.exists) {
          return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Connection not found' }) };
        }
        return {
          statusCode: 200,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: snap.id, ...snap.data() }),
        };
      }
      snap = await db.collection('jenkins_connections')
        .orderBy('fetchedAt', 'desc')
        .limit(1)
        .get();
      if (snap.empty) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ data: null }) };
      }
      const doc = snap.docs[0];
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id, ...doc.data() }),
      };
    }

    if (action === 'list_connections') {
      const snap = await db.collection('jenkins_connections')
        .orderBy('fetchedAt', 'desc')
        .limit(20)
        .get();
      const connections = snap.docs.map(d => ({
        id: d.id,
        jenkinsUrl: d.data().jenkinsUrl,
        label: d.data().label || d.data().jenkinsUrl,
        fetchedAt: d.data().fetchedAt?.toDate?.()?.toISOString() || null,
        jobCount: (d.data().jobs || []).length,
      }));
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connections }),
      };
    }

    if (action === 'delete_connection') {
      const { id } = body;
      if (!id) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'id required' }) };
      }
      await db.collection('jenkins_connections').doc(id).delete();
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted: true }),
      };
    }

    if (action === 'update_connection') {
      const { id, jobs } = body;
      if (!id) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'id required' }) };
      }
      await db.collection('jenkins_connections').doc(id).update({
        jobs: jobs || [],
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ updated: true }),
      };
    }

    const { jenkinsUrl, token, jobName } = body;
    if (!jenkinsUrl || !token) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'jenkinsUrl and token required' }) };
    }

    const base = jenkinsUrl.replace(/\/+$/, '');
    const auth = authHeader(token);

    if (action === 'list_jobs') {
      const data = await fetchJenkins(`${base}/api/json?tree=jobs[name,url,color,lastSuccessfulBuild[number,timestamp]]`, auth);
      const jobs = (data.jobs || []).map(j => ({
        name: j.name,
        url: j.url,
        color: j.color,
        env: extractEnv(j.name),
        lastBuildNumber: j.lastSuccessfulBuild?.number || null,
        lastBuildTimestamp: j.lastSuccessfulBuild?.timestamp || null,
      }));
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ jobs }) };
    }

    if (action === 'job_detail') {
      if (!jobName) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'jobName required' }) };
      }
      const encodedName = encodeURIComponent(jobName);
      const jobData = await fetchJenkins(`${base}/job/${encodedName}/api/json`, auth);
      const configXml = await fetchJenkinsXml(`${base}/job/${encodedName}/config.xml`, auth);

      let lastBuildData = null;
      if (jobData.lastSuccessfulBuild?.number) {
        try {
          lastBuildData = await fetchJenkins(`${base}/job/${encodedName}/${jobData.lastSuccessfulBuild.number}/api/json`, auth);
        } catch (_) {}
      }

      const parameters = lastBuildData ? extractParametersFromBuild(lastBuildData) : [];
      const envFromParams = parameters.find(p => p.name?.toLowerCase() === 'env' || p.name?.toLowerCase() === 'environment');

      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: jobData.name,
          url: jobData.url,
          description: jobData.description || '',
          env: envFromParams?.value || extractEnv(jobData.name),
          repoUrl: extractRepoUrl(configXml),
          branch: extractBranch(configXml),
          propertyFiles: extractPropertyFiles(configXml || ''),
          parameters,
          lastBuild: jobData.lastSuccessfulBuild?.number || null,
          lastBuildTimestamp: jobData.lastSuccessfulBuild?.timestamp || null,
          buildable: jobData.buildable,
          inQueue: jobData.inQueue,
          configXml: configXml ? configXml.slice(0, 5000) : null,
        }),
      };
    }

    if (action === 'test_connection') {
      const data = await fetchJenkins(`${base}/api/json?tree=nodeName`, auth);
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connected: true, nodeName: data.nodeName || 'Jenkins' }),
      };
    }

    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Unknown action' }),
    };
  } catch (err) {
    console.error('Jenkins proxy error:', err);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

module.exports = { handler };
