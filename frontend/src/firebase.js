// src/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported, logEvent } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "************************************",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "********************************",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "****************",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "*********************",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "********************",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "****************************************",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-XXXXXXXXXX",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

let analytics = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export const logAnalyticsEvent = (eventName, params = {}) => {
  if (analytics) {
    logEvent(analytics, eventName, params);
  }
};

export { app, db };
