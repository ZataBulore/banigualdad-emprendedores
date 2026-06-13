import { FirebaseError, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { addDoc, collection, doc, getDoc, getDocs, getFirestore, initializeFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
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
  VITE_FIREBASE_STORAGE_BUCKET: "semilla-emprende-te.firebasestorage.app",
  VITE_FIREBASE_APP_ID: "1:765446934481:web:471f71de2e302cb5041af0",
} as const;

const getFirebaseConfigValue = (key: keyof typeof firebaseDefaults) => getEnvValue(key) || firebaseDefaults[key];

const firebaseConfig = {
  apiKey: getFirebaseConfigValue("VITE_FIREBASE_API_KEY"),
  authDomain: getFirebaseConfigValue("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getFirebaseConfigValue("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: getFirebaseConfigValue("VITE_FIREBASE_STORAGE_BUCKET"),
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
export const FIREBASE_ASSETS_COLLECTION =
  import.meta.env.VITE_FIREBASE_ASSETS_COLLECTION || "archivos";
const firebaseAssetBackend = getEnvValue("VITE_FIREBASE_ASSET_BACKEND").toLowerCase();
const shouldUseFirebaseStorage = firebaseAssetBackend === "storage";

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const firebaseAuth = app ? getAuth(app) : null;
const firestore = app ? (FIREBASE_DATABASE_ID ? initializeFirestore(app, {}, FIREBASE_DATABASE_ID) : getFirestore(app)) : null;
const storage = app && shouldUseFirebaseStorage ? getStorage(app) : null;

const getStateRef = () => {
  if (!firestore) return null;
  return doc(firestore, FIREBASE_STATE_PATH.collection, FIREBASE_STATE_PATH.document);
};

const sanitizeForFirestore = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo preparar el archivo para Firebase."));
    reader.readAsDataURL(blob);
  });

const compactForFirestore = <T>(value: T, options: { dropPrimaryReceipt?: boolean } = {}): T => {
  if (Array.isArray(value)) {
    return value.map((item) => compactForFirestore(item, options)) as T;
  }

  if (typeof value === "string") {
    return (value.length > 1200 ? `${value.slice(0, 1200)}...` : value) as T;
  }

  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key !== "dataUrl")
      .filter(([key]) => !(key === "url" && record.storageProvider === "firebase" && record.storagePath))
      .filter(([key]) => !(options.dropPrimaryReceipt && key === "comprobanteAdjunto"))
      .map(([key, item]) => [key, compactForFirestore(item, options)]),
  ) as T;
};

const withStorageUrls = async <T,>(value: T): Promise<T> => {
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => withStorageUrls(item))) as T;
  }

  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const entries = await Promise.all(
    Object.entries(record).map(async ([key, item]) => [key, await withStorageUrls(item)] as const),
  );
  const hydrated = Object.fromEntries(entries) as Record<string, unknown>;

  if (
    hydrated.storageProvider === "firebase" &&
    typeof hydrated.storagePath === "string" &&
    hydrated.storagePath &&
    !hydrated.url
  ) {
    if (hydrated.storagePath.startsWith("firestore-assets/")) {
      try {
        const assetId = hydrated.storagePath.split("/")[1];
        if (firestore && assetId) {
          const assetSnapshot = await getDoc(doc(firestore, FIREBASE_ASSETS_COLLECTION, assetId));
          const dataUrl = assetSnapshot.exists() ? assetSnapshot.data().dataUrl : "";
          if (typeof dataUrl === "string" && dataUrl) hydrated.url = dataUrl;
        }
      } catch {
        // Keep the metadata visible even if the file document is unavailable.
      }
    } else if (storage) {
      try {
        hydrated.url = await getDownloadURL(ref(storage, hydrated.storagePath));
      } catch {
        // Keep the metadata visible even if Storage rules or the object are not ready yet.
      }
    }
  }

  return hydrated as T;
};

const getExtensionFromName = (name: string, contentType: string) => {
  const extension = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension) return extension;
  if (contentType === "application/pdf") return "pdf";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
};

const createStorageId = () => {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const uploadFirestoreAsset = async (
  folder: "comprobantes" | "emprendimientos" | "reuniones" | "solicitudes",
  blob: Blob,
  contentType: string,
  originalName: string,
) => {
  if (!firestore) throw new Error("Firebase no esta configurado para guardar archivos.");
  const dataUrl = await readBlobAsDataUrl(blob);
  const assetId = createStorageId();
  await withFirebaseTimeout(
    setDoc(doc(firestore, FIREBASE_ASSETS_COLLECTION, assetId), {
      folder,
      dataUrl,
      contentType,
      originalName: originalName.slice(0, 120),
      size: blob.size,
      createdAt: new Date().toISOString(),
      serverCreatedAt: serverTimestamp(),
    }),
    "Firebase no respondio al guardar el archivo. Intenta nuevamente con una imagen liviana.",
    30000,
  );
  return {
    storagePath: `firestore-assets/${assetId}`,
    url: dataUrl,
  };
};

export const uploadFirebaseAsset = async (
  folder: "comprobantes" | "emprendimientos" | "reuniones" | "solicitudes",
  blob: Blob,
  contentType: string,
  originalName: string,
) => {
  if (!storage) return uploadFirestoreAsset(folder, blob, contentType, originalName);
  const month = new Date().toISOString().slice(0, 7);
  const extension = getExtensionFromName(originalName, contentType);
  const storagePath = `${folder}/${month}/${createStorageId()}.${extension}`;
  const storageRef = ref(storage, storagePath);
  try {
    await withFirebaseTimeout(
      uploadBytes(storageRef, blob, {
        contentType,
        customMetadata: { originalName: originalName.slice(0, 120) },
      }),
      "Firebase Storage no respondio al subir el archivo. Intenta nuevamente con una imagen liviana.",
      30000,
    );
    return {
      storagePath,
      url: await getDownloadURL(storageRef),
    };
  } catch {
    return uploadFirestoreAsset(folder, blob, contentType, originalName);
  }
};

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
  const state = snapshot.exists() ? (snapshot.data().state as TesoreriaState | undefined) ?? null : null;
  return state ? withStorageUrls(state) : null;
};

export const saveRemoteState = async (state: TesoreriaState, updatedBy?: string) => {
  const stateRef = getStateRef();
  if (!stateRef) return;
  const remoteState = compactForFirestore(state, { dropPrimaryReceipt: true });
  await withFirebaseTimeout(
    setDoc(
      stateRef,
      {
        state: sanitizeForFirestore(remoteState),
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
      const state = snapshot.exists() ? (snapshot.data().state as TesoreriaState | undefined) ?? null : null;
      void withStorageUrls(state).then(onData);
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
      ...sanitizeForFirestore(compactForFirestore(payload)),
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
        ...sanitizeForFirestore(compactForFirestore(patch)),
        updatedAt: new Date().toISOString(),
        serverUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
    "Firebase no respondio al actualizar la solicitud.",
  );
};
