// src/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAnalytics, isSupported, logEvent } from "firebase/analytics";

// Use Vite env vars (make sure these are set in Netlify + .env files)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "************************************",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "********************************",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "****************",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "*********************",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "********************",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "****************************************",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-XXXXXXXXXX",
};

// Avoid re-initialization during HMR or multiple imports
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Analytics if supported
let analytics = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

/**
 * Log an analytics event safely (only if analytics is supported and initialized).
 */
export const logAnalyticsEvent = (eventName, params = {}) => {
  if (analytics) {
    logEvent(analytics, eventName, params);
  }
};

/**
 * Citrix proxy workaround: Firestore WebChannel uses `withCredentials=true` by default,
 * which requires `Access-Control-Allow-Credentials: true` in the response. Citrix ADC
 * proxies strip this header, causing CORS failures. Firestore sends auth via the
 * Authorization header (not cookies), so `withCredentials` is unnecessary.
 *
 * This patch makes `withCredentials` a no-op for all XHR to firestore.googleapis.com,
 * eliminating the CORS credentials requirement entirely.
 */
const _origXhrOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method, url) {
  const urlStr = typeof url === 'string' ? url : (url && url.href);
  if (urlStr && urlStr.indexOf('firestore.googleapis.com') !== -1) {
    Object.defineProperty(this, 'withCredentials', {
      get: () => false,
      set: () => {},
      configurable: true,
    });
  }
  return _origXhrOpen.apply(this, arguments);
};

/**
 * Citrix / firewalled networks:
 * - Force long-polling transport (bypasses broken WebChannel/WebSockets).
 * - Disable fetch streaming, which some corporate proxies choke on.
 * - (Optional) auto-detect can help in mixed environments—uncomment if needed.
 *
 * Keep persistence OFF initially; many enterprises block IndexedDB.
 * If you enable cache later and get errors, comment it back out.
 */
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  // experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
  // cache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), // OPTIONAL
});

export { app };
