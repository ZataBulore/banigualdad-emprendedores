import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT_ID = "semilla-emprende-te";
const DATABASE_ID = "default";
const STATE_COLLECTION = "centros";
const STATE_DOCUMENT = "semilla-emprende-negrete";
const SOLICITUDES_COLLECTION = "solicitudesEmprendimientos";

const firestoreBase =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const stateDocumentPath = `${STATE_COLLECTION}/${STATE_DOCUMENT}`;

const readFirebaseToken = async () => {
  const configPath = join(homedir(), ".config", "configstore", "firebase-tools.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const accessToken = config.tokens?.access_token;
  if (!accessToken) {
    throw new Error("No se encontro access_token de Firebase CLI. Ejecuta `npx firebase-tools login`.");
  }
  return accessToken;
};

const requestFirestore = async (path, token, options = {}) => {
  const response = await fetch(`${firestoreBase}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method ?? "GET"} ${path} fallo (${response.status}): ${body}`);
  }

  if (response.status === 204) return null;
  return response.json();
};

const decodeValue = (value) => {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("stringValue" in value) return value.stringValue;
  if ("bytesValue" in value) return value.bytesValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decodeValue(item)]),
    );
  }
  return undefined;
};

const encodeValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, encodeValue(item)]),
      ),
    },
  };
};

const encodeDocumentFields = (data) =>
  Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)]));

const resetCobro = (cobro) => ({
  ...cobro,
  montoPagado: 0,
  estadoPago: "pendiente",
  atraso: 0,
  fechaAtraso: "",
  fechaPago: "",
  metodoPago: "",
  referenciaPago: "",
  comprobanteAdjunto: null,
  observacion: "",
  confirmadoPorTesorero: false,
});

const resetPagoCes = (pago) => ({
  ...pago,
  montoPagado: 0,
  estadoPago: "pendiente",
  fechaAtraso: "",
  fechaPago: "",
  metodoPago: "",
  referenciaPago: "",
  comprobanteAdjunto: null,
  observacion: "",
  confirmadoPorTesorero: false,
});

const listCollectionDocuments = async (collection, token) => {
  const result = await requestFirestore(collection, token);
  return result.documents ?? [];
};

const deleteCollectionDocuments = async (collection, token) => {
  const documents = await listCollectionDocuments(collection, token);
  for (const document of documents) {
    const relativePath = document.name.split("/documents/")[1];
    await requestFirestore(relativePath, token, { method: "DELETE" });
  }
  return documents.length;
};

const main = async () => {
  const token = await readFirebaseToken();
  const remoteDocument = await requestFirestore(stateDocumentPath, token);
  const remoteData = Object.fromEntries(
    Object.entries(remoteDocument.fields ?? {}).map(([key, value]) => [key, decodeValue(value)]),
  );
  const currentState = remoteData.state;
  if (!currentState?.emprendedores?.length) {
    throw new Error("El documento remoto no trae state.emprendedores; se cancela para no borrar datos por error.");
  }

  await mkdir("backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `backups/firestore-cycle-backup-${stamp}.json`;
  await writeFile(backupPath, JSON.stringify(remoteData, null, 2));

  const resetState = {
    ...currentState,
    cobros: (currentState.cobros ?? []).map(resetCobro),
    pagosCes: (currentState.pagosCes ?? []).map(resetPagoCes),
    emprendimientos: [],
    reuniones: [],
    historial: [],
    updatedAt: new Date().toISOString(),
  };

  await requestFirestore(stateDocumentPath, token, {
    method: "PATCH",
    body: JSON.stringify({
      fields: encodeDocumentFields({
        ...remoteData,
        state: resetState,
      }),
    }),
  });

  const solicitudesDeleted = await deleteCollectionDocuments(SOLICITUDES_COLLECTION, token);

  console.log(JSON.stringify({
    backupPath,
    personasConservadas: resetState.emprendedores.length,
    cobrosReseteados: resetState.cobros.length,
    pagosCesReseteados: resetState.pagosCes.length,
    emprendimientos: resetState.emprendimientos.length,
    reuniones: resetState.reuniones.length,
    historial: resetState.historial.length,
    solicitudesDeleted,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
