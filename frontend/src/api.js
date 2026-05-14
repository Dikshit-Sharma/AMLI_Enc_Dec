const ARTIFACTS_URL = import.meta.env.VITE_API_BASE_URL || '/api/artifacts';
const CREDENTIALS_URL = '/api/credentials';

export async function fetchArtifacts({ limit, cursor } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit);
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  const res = await fetch(qs ? `${ARTIFACTS_URL}?${qs}` : ARTIFACTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch artifacts: ${res.statusText}`);
  }
  return res.json();
}

export async function addArtifacts(artifacts) {
  const res = await fetch(ARTIFACTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifacts }),
  });
  if (!res.ok) {
    throw new Error(`Failed to add artifacts: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchCredentials(env) {
  const params = new URLSearchParams();
  if (env) params.set('env', env);
  const res = await fetch(`${CREDENTIALS_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch credentials: ${res.statusText}`);
  }
  return res.json();
}

export async function addCredential(data) {
  const res = await fetch(CREDENTIALS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Failed to add credential: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteCredential(id) {
  const res = await fetch(CREDENTIALS_URL, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    throw new Error(`Failed to delete credential: ${res.statusText}`);
  }
  return res.json();
}

export function toDate(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp === 'object' && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  if (typeof timestamp === 'string') {
    return new Date(timestamp);
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  return null;
}
