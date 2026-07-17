import { db } from './firebase';
import {
  collection, getDocs, getDoc, doc, query, orderBy, limit as fsLimit,
} from 'firebase/firestore';

function convertTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  return null;
}

function convertDoc(d) {
  const data = d.data();
  return {
    id: d.id,
    ...data,
    timestamp: convertTimestamp(data.timestamp),
  };
}

export async function fetchArtifactsFs({ limit: lim, cursor, search } = {}) {
  const constraints = [orderBy('timestamp', 'desc')];
  if (lim) constraints.push(fsLimit(lim));

  const q = query(collection(db, 'artifacts'), ...constraints);
  const snapshot = await getDocs(q);
  let artifacts = snapshot.docs.map(convertDoc);

  if (search) {
    const s = search.toLowerCase();
    artifacts = artifacts.filter((a) =>
      a.apiName?.toLowerCase().includes(s) ||
      a.jiraTicket?.toLowerCase().includes(s) ||
      a.env?.toLowerCase().includes(s) ||
      a.curl?.toLowerCase().includes(s)
    );
  }

  return { artifacts };
}

export async function fetchArtifactByIdFs(id) {
  const snap = await getDoc(doc(db, 'artifacts', id));
  if (!snap.exists()) return null;
  return convertDoc(snap);
}

export async function fetchCredentialsFs(env) {
  const q = query(collection(db, 'credentials'), orderBy('timestamp', 'desc'));
  const snapshot = await getDocs(q);
  let credentials = snapshot.docs.map(convertDoc);
  if (env) {
    credentials = credentials.filter((c) => c.env === env);
  }
  credentials.sort((a, b) => {
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return b.timestamp.localeCompare(a.timestamp);
  });
  return { credentials };
}
