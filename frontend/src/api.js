const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/artifacts';

export async function fetchArtifacts() {
  const res = await fetch(BASE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch artifacts: ${res.statusText}`);
  }
  const { artifacts } = await res.json();
  return artifacts;
}

export async function addArtifacts(artifacts) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifacts }),
  });
  if (!res.ok) {
    throw new Error(`Failed to add artifacts: ${res.statusText}`);
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
