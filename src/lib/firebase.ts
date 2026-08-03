import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo-stock-league-event-local";
const firebaseConfig = {
  apiKey: "local-emulator-api-key",
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:local",
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: [browserLocalPersistence, indexedDBLocalPersistence],
});

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const functions = getFunctions(app, "asia-northeast1");
export const storage = getStorage(app);

// This repository is local-only. The browser always connects to emulators on
// the same host as the page, including when opened from another device on LAN.
const host = window.location.hostname || "127.0.0.1";
const port = (name: string, fallback: number) => Number(import.meta.env[name] || fallback);

connectAuthEmulator(auth, `http://${host}:${port("VITE_AUTH_PORT", 9099)}`, { disableWarnings: true });
connectFirestoreEmulator(db, host, port("VITE_FIRESTORE_PORT", 8080));
connectFunctionsEmulator(functions, host, port("VITE_FUNCTIONS_PORT", 5001));
connectStorageEmulator(storage, host, port("VITE_STORAGE_PORT", 9199));
