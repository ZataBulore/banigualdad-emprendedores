import { FirebaseError, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithCredential, signOut } from "firebase/auth";
import { addDoc, collection, doc, getDoc, getDocs, getFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import type { SolicitudEmprendimiento, TesoreriaState } from "../types/tesoreria";

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

export const FIREBASE_SOLICITUDES_COLLECTION =
  import.meta.env.VITE_FIREBASE_SOLICITUDES_COLLECTION || "solicitudesEmprendimientos";

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
  const docRef = await addDoc(solicitudes, {
    ...payload,
    estado: "nueva",
    origen: "formulario-publico",
    createdAt: timestamp,
    updatedAt: timestamp,
    serverCreatedAt: serverTimestamp(),
  });
  return docRef.id;
};

export const readSolicitudesEmprendimiento = async () => {
  const solicitudes = getSolicitudesCollection();
  if (!solicitudes) return [];
  const snapshot = await getDocs(query(solicitudes, orderBy("createdAt", "desc")));
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
  await setDoc(
    doc(firestore, FIREBASE_SOLICITUDES_COLLECTION, id),
    {
      ...patch,
      updatedAt: new Date().toISOString(),
      serverUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};
