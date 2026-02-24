// firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  // Optional caching (comment out if you suspect IndexedDB policy issues)
  // persistentLocalCache,
  // persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';

// Tip: confirm these are defined in your .env[.local]
// Vite requires the VITE_ prefix.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Ensure we don't re-init in HMR or across imports
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Only create Firestore in the browser (avoid SSR crashes)
let db: ReturnType<typeof initializeFirestore> | undefined;

if (typeof window !== 'undefined') {
  db = initializeFirestore(app, {
    // Citrix / restrictive networks:
    experimentalForceLongPolling: true,
    // (Optional) lets SDK decide between WebChannel and long-polling
    // experimentalAutoDetectLongPolling: true,

    // Some enterprise proxies break fetch streaming; disable it:
    useFetchStreams: false,

    // Optional: enable persistent cache if corporate policy allows IndexedDB
    // cache: persistentLocalCache({
    //   tabManager: persistentMultipleTabManager(),
    // }),
  });

  // (Optional) If you use the emulator locally
  // if (import.meta.env.DEV && import.meta.env.VITE_USE_FIRESTORE_EMULATOR === 'true') {
  //   connectFirestoreEmulator(db, '127.0.0.1', 8080);
  // }
}

export { app, db };
