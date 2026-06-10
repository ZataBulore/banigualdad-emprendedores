import { FirebaseError, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithCredential, signOut } from "firebase/auth";
import { doc, getDoc, getFirestore, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import type { TesoreriaState } from "../types/tesoreria";

const getEnvValue = (key: string) => String(import.meta.env[key] ?? "").trim();

const firebaseEnvKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const firebaseConfig = {
  apiKey: getEnvValue("VITE_FIREBASE_API_KEY"),
  authDomain: getEnvValue("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getEnvValue("VITE_FIREBASE_PROJECT_ID"),
  appId: getEnvValue("VITE_FIREBASE_APP_ID"),
};

export const getFirebaseMissingConfig = () =>
  firebaseEnvKeys.filter((key) => !getEnvValue(key));

export const isFirebaseConfigured = getFirebaseMissingConfig().length === 0;

export const FIREBASE_STATE_PATH = {
  collection: import.meta.env.VITE_FIREBASE_COLLECTION || "centros",
  document: import.meta.env.VITE_FIREBASE_DOCUMENT_ID || "semilla-emprende-negrete",
};

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const firebaseAuth = app ? getAuth(app) : null;
const firestore = app ? getFirestore(app) : null;

const getStateRef = () => {
  if (!firestore) return null;
  return doc(firestore, FIREBASE_STATE_PATH.collection, FIREBASE_STATE_PATH.document);
};

export const signInFirebaseWithGoogleCredential = async (credential: string) => {
  if (!firebaseAuth) return null;
  return signInWithCredential(firebaseAuth, GoogleAuthProvider.credential(credential));
};

export const signOutFirebase = async () => {
  if (!firebaseAuth) return;
  await signOut(firebaseAuth);
};

export const readRemoteState = async () => {
  const stateRef = getStateRef();
  if (!stateRef) return null;
  const snapshot = await getDoc(stateRef);
  return snapshot.exists() ? (snapshot.data().state as TesoreriaState | undefined) ?? null : null;
};

export const saveRemoteState = async (state: TesoreriaState, updatedBy?: string) => {
  const stateRef = getStateRef();
  if (!stateRef) return;
  await setDoc(
    stateRef,
    {
      state,
      updatedAt: serverTimestamp(),
      updatedBy: updatedBy ?? "",
    },
    { merge: true },
  );
};

export const subscribeRemoteState = (
  onData: (state: TesoreriaState | null) => void,
  onError: (message: string) => void,
) => {
  const stateRef = getStateRef();
  if (!stateRef) return () => {};

  return onSnapshot(
    stateRef,
    (snapshot) => {
      onData(snapshot.exists() ? (snapshot.data().state as TesoreriaState | undefined) ?? null : null);
    },
    (error) => {
      const message = error instanceof FirebaseError ? error.message : "No se pudo sincronizar con Firebase.";
      onError(message);
    },
  );
};
