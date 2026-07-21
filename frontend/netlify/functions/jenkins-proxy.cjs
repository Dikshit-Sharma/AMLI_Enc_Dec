const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function authHeader(username, token) {
  return 'Basic ' + Buffer.from(username + ':' + token).toString('base64');
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

  const { jenkinsUrl, username, token, action, jobName } = body;
  if (!jenkinsUrl || !username || !token) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'jenkinsUrl, username, and token required' }) };
  }

  const base = jenkinsUrl.replace(/\/+$/, '');
  const auth = authHeader(username, token);

  try {
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
      body: JSON.stringify({ error: 'Unknown action. Use list_jobs, job_detail, or test_connection' }),
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
