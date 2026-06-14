import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const PROJECT_ID = "semilla-emprende-te";
const DATABASE_ID = "default";
const STATE_COLLECTION = "centros";
const STATE_DOCUMENT = "semilla-emprende-negrete";

const firestoreBase =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const stateDocumentPath = `${STATE_COLLECTION}/${STATE_DOCUMENT}`;

const backupPath = process.argv[2];

if (!backupPath) {
  console.error("Uso: node scripts/restore-firestore-state.mjs backups/recovered-localstorage-latest-....json");
  process.exit(1);
}

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
  if (!value) return undefined;
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
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };

  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value) && Number.isSafeInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }

  return {
    mapValue: {
      fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)])),
    },
  };
};

const compactForFirestore = (value, options = {}) => {
  if (Array.isArray(value)) return value.map((item) => compactForFirestore(item, options));
  if (typeof value === "string") return value.length > 1200 ? `${value.slice(0, 1200)}...` : value;
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "dataUrl")
      .filter(([key]) => !(key === "url" && value.storageProvider === "firebase" && value.storagePath))
      .filter(([key]) => !(options.dropPrimaryReceipt && key === "comprobanteAdjunto"))
      .map(([key, item]) => [key, compactForFirestore(item, options)]),
  );
};

const getStats = (state = {}) => ({
  updatedAt: state.updatedAt,
  historial: state.historial?.length ?? 0,
  emprendedores: state.emprendedores?.length ?? 0,
  periodos: state.periodos?.length ?? 0,
  cobros: state.cobros?.length ?? 0,
  pagados: state.cobros?.filter((cobro) => cobro.estadoPago === "pagado").length ?? 0,
  parciales: state.cobros?.filter((cobro) => cobro.estadoPago === "parcial").length ?? 0,
  conMonto: state.cobros?.filter((cobro) => Number(cobro.montoPagado) > 0).length ?? 0,
  comprobantes: state.cobros?.reduce(
    (total, cobro) => total + (Array.isArray(cobro.comprobantesAdjuntos) ? cobro.comprobantesAdjuntos.length : 0),
    0,
  ) ?? 0,
  pagosCes: state.pagosCes?.length ?? 0,
  cesPagados: state.pagosCes?.filter((pago) => pago.estadoPago === "pagado").length ?? 0,
  cesConMonto: state.pagosCes?.filter((pago) => Number(pago.montoPagado) > 0).length ?? 0,
  emprendimientos: state.emprendimientos?.length ?? 0,
  emprendimientosFotos: state.emprendimientos?.reduce(
    (total, emprendimiento) => total + (emprendimiento.fotos?.length ?? 0),
    0,
  ) ?? 0,
  reuniones: state.reuniones?.length ?? 0,
});

const main = async () => {
  const token = await readFirebaseToken();
  const sourcePath = resolve(backupPath);
  const recoveredState = compactForFirestore(
    JSON.parse(await readFile(sourcePath, "utf8")),
    { dropPrimaryReceipt: true },
  );

  const currentDocument = await requestFirestore(stateDocumentPath, token);
  const currentState = decodeValue(currentDocument.fields?.state);
  await mkdir("backups", { recursive: true });
  const beforeRestorePath = join(
    "backups",
    `firestore-before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  await writeFile(beforeRestorePath, JSON.stringify(currentDocument, null, 2));

  console.log("Estado actual:", getStats(currentState));
  console.log("Estado a restaurar:", getStats(recoveredState));
  console.log("Tamano JSON compactado:", Buffer.byteLength(JSON.stringify(recoveredState), "utf8"), "bytes");
  console.log("Backup previo:", beforeRestorePath);

  const now = new Date().toISOString();
  const patchPath =
    `${stateDocumentPath}?updateMask.fieldPaths=state` +
    "&updateMask.fieldPaths=updatedAt" +
    "&updateMask.fieldPaths=updatedBy" +
    "&updateMask.fieldPaths=restoreSource";

  await requestFirestore(patchPath, token, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        state: encodeValue(recoveredState),
        updatedAt: { timestampValue: now },
        updatedBy: { stringValue: "codex-restore:serbulboa@gmail.com" },
        restoreSource: { stringValue: basename(sourcePath) },
      },
    }),
  });

  const restoredDocument = await requestFirestore(stateDocumentPath, token);
  console.log("Estado restaurado:", getStats(decodeValue(restoredDocument.fields?.state)));
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
