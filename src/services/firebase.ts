import { FirebaseError, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { addDoc, collection, doc, getDoc, getDocs, getFirestore, initializeFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import type { SolicitudEmprendimiento, TesoreriaState } from "../types/tesoreria";

const getEnvValue = (key: string) => String(import.meta.env[key] ?? "").trim();

const firebaseEnvKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const firebaseDefaults = {
  VITE_FIREBASE_API_KEY: "AIzaSyA0aKgndsGsd9Tt_JT_0t-SCUe9FCkLmAs",
  VITE_FIREBASE_AUTH_DOMAIN: "semilla-emprende-te.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "semilla-emprende-te",
  VITE_FIREBASE_APP_ID: "1:765446934481:web:471f71de2e302cb5041af0",
} as const;

const getFirebaseConfigValue = (key: keyof typeof firebaseDefaults) => getEnvValue(key) || firebaseDefaults[key];

const firebaseConfig = {
  apiKey: getFirebaseConfigValue("VITE_FIREBASE_API_KEY"),
  authDomain: getFirebaseConfigValue("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getFirebaseConfigValue("VITE_FIREBASE_PROJECT_ID"),
  appId: getFirebaseConfigValue("VITE_FIREBASE_APP_ID"),
};

export const getFirebaseMissingConfig = () =>
  firebaseEnvKeys.filter((key) => !getFirebaseConfigValue(key));

export const isFirebaseConfigured = getFirebaseMissingConfig().length === 0;

export const FIREBASE_STATE_PATH = {
  collection: import.meta.env.VITE_FIREBASE_COLLECTION || "centros",
  document: import.meta.env.VITE_FIREBASE_DOCUMENT_ID || "semilla-emprende-negrete",
};

const normalizeFirestoreDatabaseId = (databaseId: string) => {
  const normalized = databaseId.trim();
  if (!normalized || normalized === "(default)") return "";
  return normalized;
};

export const FIREBASE_DATABASE_ID = normalizeFirestoreDatabaseId(getEnvValue("VITE_FIREBASE_DATABASE_ID") || "default");

export const FIREBASE_SOLICITUDES_COLLECTION =
  import.meta.env.VITE_FIREBASE_SOLICITUDES_COLLECTION || "solicitudesEmprendimientos";

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const firebaseAuth = app ? getAuth(app) : null;
const firestore = app ? (FIREBASE_DATABASE_ID ? initializeFirestore(app, {}, FIREBASE_DATABASE_ID) : getFirestore(app)) : null;

const getStateRef = () => {
  if (!firestore) return null;
  return doc(firestore, FIREBASE_STATE_PATH.collection, FIREBASE_STATE_PATH.document);
};

const sanitizeForFirestore = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const compactPaymentAttachments = <T extends { comprobanteAdjunto?: unknown; comprobantesAdjuntos?: unknown[] }>(item: T): T => {
  const comprobantesAdjuntos = Array.isArray(item.comprobantesAdjuntos)
    ? item.comprobantesAdjuntos
    : item.comprobanteAdjunto
      ? [item.comprobanteAdjunto]
      : [];

  return {
    ...item,
    comprobanteAdjunto: null,
    comprobantesAdjuntos,
  };
};

const compactStateForFirestore = (state: TesoreriaState): TesoreriaState => ({
  ...state,
  cobros: state.cobros.map(compactPaymentAttachments),
  pagosCes: state.pagosCes.map(compactPaymentAttachments),
});

const withFirebaseTimeout = async <T>(operation: Promise<T>, fallbackMessage: string, timeoutMs = 12000) => {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(fallbackMessage)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const signInFirebaseWithGoogle = async () => {
  if (!firebaseAuth) return null;
  return signInWithPopup(firebaseAuth, googleProvider);
};

export const subscribeFirebaseAuthState = (callback: (user: User | null) => void) => {
  if (!firebaseAuth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(firebaseAuth, callback);
};

export const signOutFirebase = async () => {
  if (!firebaseAuth) return;
  await signOut(firebaseAuth);
};

export const readRemoteState = async () => {
  const stateRef = getStateRef();
  if (!stateRef) return null;
  const snapshot = await withFirebaseTimeout(
    getDoc(stateRef),
    "Firebase no respondio al leer la informacion. Revisa que Firestore Database este creado.",
  );
  return snapshot.exists() ? (snapshot.data().state as TesoreriaState | undefined) ?? null : null;
};

export const saveRemoteState = async (state: TesoreriaState, updatedBy?: string) => {
  const stateRef = getStateRef();
  if (!stateRef) return;
  await withFirebaseTimeout(
    setDoc(
      stateRef,
      {
        state: sanitizeForFirestore(compactStateForFirestore(state)),
        updatedAt: serverTimestamp(),
        updatedBy: updatedBy ?? "",
      },
      { merge: true },
    ),
    "Firebase no respondio al guardar. Revisa que Firestore Database este creado y que las reglas permitan escritura.",
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

const getSolicitudesCollection = () => {
  if (!firestore) return null;
  return collection(firestore, FIREBASE_SOLICITUDES_COLLECTION);
};

const mapSolicitud = (id: string, data: Record<string, unknown>): SolicitudEmprendimiento => ({
  id,
  rut: String(data.rut ?? ""),
  emprendedorId: data.emprendedorId ? String(data.emprendedorId) : "",
  periodoValidadoId: data.periodoValidadoId ? String(data.periodoValidadoId) : "",
  creditoOriginal: Number(data.creditoOriginal ?? 0),
  nombreContacto: String(data.nombreContacto ?? ""),
  whatsapp: String(data.whatsapp ?? ""),
  correo: String(data.correo ?? ""),
  nombreEmprendimiento: String(data.nombreEmprendimiento ?? ""),
  rubro: String(data.rubro ?? ""),
  descripcion: String(data.descripcion ?? ""),
  direccion: String(data.direccion ?? ""),
  sector: String(data.sector ?? ""),
  comuna: String(data.comuna ?? ""),
  canalesVenta: Array.isArray(data.canalesVenta) ? data.canalesVenta.map(String) : [],
  horarios: Array.isArray(data.horarios) ? data.horarios.map(String) : [],
  redesSociales: String(data.redesSociales ?? ""),
  necesidades: Array.isArray(data.necesidades) ? data.necesidades.map(String) : [],
  fotos: Array.isArray(data.fotos) ? data.fotos as SolicitudEmprendimiento["fotos"] : [],
  estado: data.estado === "revisada" || data.estado === "convertida" || data.estado === "descartada" ? data.estado : "nueva",
  origen: "formulario-publico",
  notas: String(data.notas ?? ""),
  createdAt: String(data.createdAt ?? ""),
  updatedAt: data.updatedAt ? String(data.updatedAt) : "",
});

export const createSolicitudEmprendimiento = async (
  payload: Omit<SolicitudEmprendimiento, "id" | "createdAt" | "updatedAt" | "estado" | "origen">,
) => {
  const solicitudes = getSolicitudesCollection();
  if (!solicitudes) throw new Error("Firebase no esta configurado para recibir formularios.");
  const timestamp = new Date().toISOString();
  const docRef = await withFirebaseTimeout(
    addDoc(solicitudes, {
      ...sanitizeForFirestore(payload),
      estado: "nueva",
      origen: "formulario-publico",
      createdAt: timestamp,
      updatedAt: timestamp,
      serverCreatedAt: serverTimestamp(),
    }),
    "Firebase no respondio al enviar el formulario. Revisa que Firestore Database este creado y que las reglas permitan crear solicitudes.",
  );
  return docRef.id;
};

export const readSolicitudesEmprendimiento = async () => {
  const solicitudes = getSolicitudesCollection();
  if (!solicitudes) return [];
  const snapshot = await withFirebaseTimeout(
    getDocs(query(solicitudes, orderBy("createdAt", "desc"))),
    "Firebase no respondio al leer las solicitudes.",
  );
  return snapshot.docs.map((item) => mapSolicitud(item.id, item.data()));
};

export const subscribeSolicitudesEmprendimiento = (
  onData: (solicitudes: SolicitudEmprendimiento[]) => void,
  onError: (message: string) => void,
) => {
  const solicitudes = getSolicitudesCollection();
  if (!solicitudes) return () => {};

  return onSnapshot(
    query(solicitudes, orderBy("createdAt", "desc")),
    (snapshot) => {
      onData(snapshot.docs.map((item) => mapSolicitud(item.id, item.data())));
    },
    (error) => {
      const message = error instanceof FirebaseError ? error.message : "No se pudieron leer las solicitudes de emprendimientos.";
      onError(message);
    },
  );
};

export const updateSolicitudEmprendimiento = async (
  id: string,
  patch: Partial<Omit<SolicitudEmprendimiento, "id" | "createdAt" | "updatedAt" | "origen">>,
) => {
  if (!firestore) throw new Error("Firebase no esta configurado.");
  await withFirebaseTimeout(
    setDoc(
      doc(firestore, FIREBASE_SOLICITUDES_COLLECTION, id),
      {
        ...sanitizeForFirestore(patch),
        updatedAt: new Date().toISOString(),
        serverUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
    "Firebase no respondio al actualizar la solicitud.",
  );
};
