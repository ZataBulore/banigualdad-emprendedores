import { useEffect, useMemo, useRef, useState } from "react";
import { configuracionInicial, crearPagosCes, getMontoCes, tesoreriaInicial } from "../data/tesoreriaInicial";
import {
  cloudBackendName,
  getCloudMissingConfig,
  isCloudConfigured,
  readRemoteState,
  saveRemoteState,
  subscribeRemoteState,
} from "../services/cloudState";
import type {
  Centro,
  CobroSemanal,
  ComprobanteAdjunto,
  ConfiguracionCes,
  ConfiguracionMicrocredito,
  ConfiguracionSeguridad,
  CuentaTransferencia,
  Emprendimiento,
  Emprendedor,
  EstadoAsistencia,
  EstadoPago,
  MetodoPago,
  MovimientoHistorial,
  PagoCes,
  Periodo,
  Reunion,
  TesoreriaState,
  TipoMovimiento,
} from "../types/tesoreria";

const STORAGE_KEY = "tesoreria-semilla-emprende-v1";

export type CloudSyncStatus = "local" | "connecting" | "synced" | "saving" | "error";

const SYNC_RETRY_DELAYS = [1200, 2500, 5000, 9000, 15000];

const getErrorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const normalized = message.toLowerCase();

  if (normalized.includes("resource-exhausted") || normalized.includes("quota limit exceeded")) {
    return "Firebase rechazo el guardado porque se agoto la cuota diaria gratuita de escrituras de Firestore. El cambio quedo guardado en este equipo y se podra sincronizar cuando la cuota se restablezca o se habilite billing en Firebase.";
  }

  if (normalized.includes("exceeds the maximum allowed size") || normalized.includes("maximum allowed size")) {
    return "Firebase rechazo el guardado porque el documento del centro supero 1 MB. El sistema ahora sincroniza los registros sin incrustar archivos pesados; vuelve a intentar guardar el cambio.";
  }

  return message;
};

const isTransientFirebaseMessage = (message: string) =>
  [
    "unavailable",
    "deadline-exceeded",
    "network",
    "offline",
    "timeout",
    "timed out",
    "no respondio",
    "failed to get document because the client is offline",
    "could not reach cloud firestore backend",
  ].some((pattern) => message.toLowerCase().includes(pattern));

const deriveEstadoPago = (montoPagado: number, totalEsperado: number, current: EstadoPago) => {
  if (current === "atrasado" || current === "revisar") return current;
  if (montoPagado <= 0) return "pendiente";
  return montoPagado >= totalEsperado ? "pagado" : "parcial";
};

type AuditInput = {
  tipo: TipoMovimiento;
  accion: string;
  detalle: string;
  entidadId?: string;
  personaId?: string;
  personaNombre?: string;
};

const fieldLabels: Record<string, string> = {
  idCentro: "ID centro",
  nombreCentro: "nombre del centro",
  zona: "zona",
  asesor: "asesor",
  numeroHoja: "numero de hoja",
  numeroLote: "numero de lote",
  ciclo: "ciclo",
  fechaFirma: "fecha de firma",
  numeroCuota: "numero de cuota",
  fechaVencimiento: "fecha de vencimiento",
  cantidadEmprendedores: "cantidad de emprendedores",
  totalCredito: "total credito",
  totalCuotas: "total cuotas",
  totalSeguro: "total seguro",
  totalCentro: "total centro",
  imagenOrigen: "imagen origen",
  estadoCarga: "estado de carga",
  nombre: "nombre",
  rut: "RUT",
  whatsapp: "WhatsApp principal",
  whatsappSecundario: "WhatsApp secundario",
  nombreContactoSecundario: "nombre contacto secundario",
  emprendedorId: "persona asociada",
  estado: "estado",
  rubro: "rubro",
  descripcion: "descripcion",
  direccion: "direccion",
  sector: "sector",
  correo: "correo",
  redesSociales: "redes sociales",
  periodoOrigenId: "periodo origen",
  creditoOrigen: "credito origen",
  fotos: "fotos",
  fechaBaja: "fecha de baja",
  motivoBaja: "motivo de baja",
  observacionBaja: "observacion de baja",
  creditoOriginal: "credito original",
  anillo: "anillo",
  notas: "notas",
  cuota: "cuota",
  seguro: "seguro",
  totalEsperado: "total esperado",
  montoPagado: "monto pagado",
  estadoPago: "estado de pago",
  fechaAtraso: "fecha de atraso",
  fechaPago: "fecha de pago",
  metodoPago: "metodo de pago",
  referenciaPago: "referencia de pago",
  comprobanteAdjunto: "comprobante adjunto",
  comprobantesAdjuntos: "comprobantes adjuntos",
  observacion: "observacion",
  confirmadoPorTesorero: "confirmacion tesorero",
  fecha: "fecha",
  lugar: "lugar",
  acta: "acta",
  titulo: "titulo",
  correosAutorizados: "correos autorizados",
  fechaVencimientoCes: "vencimiento CES",
  montosPorCredito: "montos por credito",
  microcredito: "reglas de microcredito",
  interesMensualPorcentaje: "interes mensual",
  semanasDevolucion: "semanas de devolucion",
  montoPrimerCicloMin: "monto minimo primer ciclo",
  montoPrimerCicloMax: "monto maximo primer ciclo",
  cesDescripcion: "descripcion CES",
  cesMontoReferencia: "monto referencia CES",
  ahorroObligatorioNombre: "nombre ahorro obligatorio",
  ahorroObligatorioSemanal: "ahorro obligatorio semanal",
  ahorroObligatorioDevolucion: "devolucion ahorro obligatorio",
  avalSolidario: "aval solidario",
  microseguroOpcional: "microseguro opcional",
  microseguroSemanal: "microseguro semanal",
  microseguroDescripcion: "descripcion microseguro",
  requisitosCentro: "requisitos del centro",
  normasInternas: "normas internas",
  reglasRenovacionAusencias: "reglas de renovacion por ausencias",
  atrasosPagoSemanalBloqueoRenovacion: "atrasos que bloquean renovacion",
  cajaSosMaximaParaRenovar: "maximo Caja SOS para renovar",
  directiva: "directiva",
  lugarReunion: "lugar de reunion",
  pilaresFundacion: "pilares de la fundacion",
  cuentaTransferencia: "cuenta de transferencia",
  titular: "titular",
  banco: "banco",
  tipoCuenta: "tipo de cuenta",
  numeroCuenta: "numero de cuenta",
  nota: "nota",
};

const normalizeAuditValue = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "sin dato";
  if (typeof value === "boolean") return value ? "si" : "no";
  if (Array.isArray(value)) return value.length ? value.map(normalizeAuditValue).join(", ") : "sin dato";
  if (typeof value === "object") {
    const maybeAttachment = value as { nombre?: unknown; tamano?: unknown; dataUrl?: unknown; url?: unknown; storagePath?: unknown };
    if (maybeAttachment.nombre && (maybeAttachment.dataUrl || maybeAttachment.url || maybeAttachment.storagePath || maybeAttachment.tamano)) {
      const bytes = Number(maybeAttachment.tamano ?? 0);
      const size = Number.isFinite(bytes) && bytes > 0 ? `${Math.round(bytes / 1024)} KB` : "sin tamano";
      return `${String(maybeAttachment.nombre)} (${size})`;
    }

    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "dataUrl")
      .map(([key, item]) => `${key}: ${normalizeAuditValue(item)}`)
      .join(", ") || "sin dato";
  }
  return String(value);
};

const compactAuditDetail = (detalle: string) =>
  detalle.length > 900 ? `${detalle.slice(0, 900)}...` : detalle;

const auditValuesAreEqual = (before: unknown, after: unknown) =>
  normalizeAuditValue(before).trim() === normalizeAuditValue(after).trim();

const getPatchChanges = <T extends object>(current: T | undefined, patch: Partial<T>) =>
  Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key, after]) => ({
      key,
      label: fieldLabels[key] ?? key,
      before: current?.[key as keyof T],
      after,
    }))
    .filter((change) => !auditValuesAreEqual(change.before, change.after));

const describeChanges = <T extends object>(current: T | undefined, patch: Partial<T>) => {
  const changes = getPatchChanges(current, patch);
  if (!changes.length) return "Sin cambios reales.";

  if (changes.length === 1) {
    const change = changes[0];
    return `${change.label} actualizado: antes "${normalizeAuditValue(change.before)}", ahora "${normalizeAuditValue(change.after)}".`;
  }

  return `Cambios realizados: ${changes
    .map((change) => `${change.label}: antes "${normalizeAuditValue(change.before)}", ahora "${normalizeAuditValue(change.after)}"`)
    .join("; ")}.`;
};

const normalizeComprobantesAdjuntos = (
  comprobanteAdjunto?: ComprobanteAdjunto | null,
  comprobantesAdjuntos?: ComprobanteAdjunto[],
) => {
  const merged = comprobantesAdjuntos !== undefined ? [...comprobantesAdjuntos] : [];
  if (comprobanteAdjunto && !merged.some((item) => item.createdAt === comprobanteAdjunto.createdAt && item.nombre === comprobanteAdjunto.nombre)) {
    merged.unshift(comprobanteAdjunto);
  }

  return merged.slice(0, 2);
};

const withNormalizedPaymentAttachments = <T extends { comprobanteAdjunto?: ComprobanteAdjunto | null; comprobantesAdjuntos?: ComprobanteAdjunto[] }>(
  item: T,
) => {
  const comprobantesAdjuntos = normalizeComprobantesAdjuntos(item.comprobanteAdjunto, item.comprobantesAdjuntos);

  return {
    ...item,
    comprobanteAdjunto: comprobantesAdjuntos[0] ?? null,
    comprobantesAdjuntos,
  };
};

const normalizePaymentPatch = <T extends { comprobanteAdjunto?: ComprobanteAdjunto | null; comprobantesAdjuntos?: ComprobanteAdjunto[] }>(
  current: T | undefined,
  patch: Partial<T>,
): Partial<T> => {
  if (!("comprobanteAdjunto" in patch) && !("comprobantesAdjuntos" in patch)) return patch;

  const comprobantesAdjuntos = "comprobantesAdjuntos" in patch
    ? normalizeComprobantesAdjuntos(undefined, patch.comprobantesAdjuntos ?? [])
    : normalizeComprobantesAdjuntos(
        patch.comprobanteAdjunto === undefined ? current?.comprobanteAdjunto : patch.comprobanteAdjunto,
        current?.comprobantesAdjuntos,
      );

  return {
    ...patch,
    comprobanteAdjunto: comprobantesAdjuntos[0] ?? null,
    comprobantesAdjuntos,
  };
};

const buildPersonaAuditAction = (persona: Emprendedor | undefined, patch: Partial<Emprendedor>) => {
  const changes = getPatchChanges(persona, patch);
  if (changes.length === 1) return `${changes[0].label} actualizado`;
  if (changes.length > 1) return "Persona actualizada";
  return "Persona revisada";
};

const createMovimiento = (input: AuditInput, usuarioEmail?: string): MovimientoHistorial => {
  const timestamp = new Date().toISOString();

  return {
    id: `mov-${timestamp}-${Math.random().toString(36).slice(2, 9)}`,
    fecha: timestamp,
    usuarioEmail: usuarioEmail || "sin usuario",
    ...input,
  };
};

const withMovimiento = (state: TesoreriaState, input: AuditInput, usuarioEmail?: string): TesoreriaState => ({
  ...state,
  historial: [createMovimiento(input, usuarioEmail), ...(state.historial ?? [])],
});

const crearAsistenciasBase = (emprendedores: Emprendedor[]) =>
  emprendedores.map((emprendedor) => ({
    emprendedorId: emprendedor.id,
    estado: "pendiente" as const,
    observacion: "",
  }));

const normalizarCorreos = (emails: string[]) =>
  Array.from(
    new Set(
      emails
        .flatMap((email) => email.split(/[,\n;]/))
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

const getCorreosBaseKey = () =>
  normalizarCorreos(configuracionInicial.seguridad.correosAutorizados).join("|");

const normalizarAsistencias = (reunion: Reunion, emprendedores: Emprendedor[]): Reunion => {
  const existentes = new Map((reunion.asistencias ?? []).map((asistencia) => [asistencia.emprendedorId, asistencia]));

  return {
    ...reunion,
    lugar: reunion.lugar ?? "",
    observacion: reunion.observacion ?? "",
    acta: reunion.acta ?? "",
    fotos: reunion.fotos ?? [],
    asistencias: emprendedores.map((emprendedor) => ({
      emprendedorId: emprendedor.id,
      estado: existentes.get(emprendedor.id)?.estado ?? "pendiente",
      observacion: existentes.get(emprendedor.id)?.observacion ?? "",
    })),
  };
};

const migrateState = (state: TesoreriaState): TesoreriaState => {
  const periodosActuales = new Map((state.periodos ?? []).map((periodo) => [periodo.id, periodo]));
  const cobrosActuales = new Map((state.cobros ?? []).map((cobro) => [cobro.id, cobro]));
  const periodosIniciales = new Set(tesoreriaInicial.periodos.map((periodo) => periodo.id));
  const cobrosIniciales = new Set(tesoreriaInicial.cobros.map((cobro) => cobro.id));
  const correosBaseKey = getCorreosBaseKey();
  const seguridadActual = state.configuracion?.seguridad;
  const correosGuardados = seguridadActual?.correosAutorizados ?? [];
  const correosAutorizados =
    seguridadActual?.correosBaseSincronizados === correosBaseKey
      ? normalizarCorreos(correosGuardados)
      : normalizarCorreos([...correosGuardados, ...configuracionInicial.seguridad.correosAutorizados]);
  const configuracion = {
    ...configuracionInicial,
    ...(state.configuracion ?? {}),
    ces: {
      ...configuracionInicial.ces,
      ...(state.configuracion?.ces ?? {}),
      montosPorCredito: {
        ...configuracionInicial.ces.montosPorCredito,
        ...(state.configuracion?.ces?.montosPorCredito ?? {}),
      },
    },
    microcredito: {
      ...configuracionInicial.microcredito,
      ...(state.configuracion?.microcredito ?? {}),
      directiva: {
        ...configuracionInicial.microcredito.directiva,
        ...(state.configuracion?.microcredito?.directiva ?? {}),
      },
      requisitosCentro:
        state.configuracion?.microcredito?.requisitosCentro?.length
          ? state.configuracion.microcredito.requisitosCentro
          : configuracionInicial.microcredito.requisitosCentro,
      normasInternas:
        state.configuracion?.microcredito?.normasInternas?.length
          ? state.configuracion.microcredito.normasInternas
          : configuracionInicial.microcredito.normasInternas,
      reglasRenovacionAusencias:
        state.configuracion?.microcredito?.reglasRenovacionAusencias?.length
          ? state.configuracion.microcredito.reglasRenovacionAusencias
          : configuracionInicial.microcredito.reglasRenovacionAusencias,
      pilaresFundacion:
        state.configuracion?.microcredito?.pilaresFundacion?.length
          ? state.configuracion.microcredito.pilaresFundacion
          : configuracionInicial.microcredito.pilaresFundacion,
    },
    seguridad: {
      ...configuracionInicial.seguridad,
      ...(state.configuracion?.seguridad ?? {}),
      correosAutorizados,
      correosBaseSincronizados: correosBaseKey,
    },
    cuentaTransferencia: {
      ...configuracionInicial.cuentaTransferencia,
      ...(state.configuracion?.cuentaTransferencia ?? {}),
    },
  };

  return {
    ...state,
    configuracion,
    periodos: [
      ...tesoreriaInicial.periodos.map((periodo) => ({
        ...periodo,
        ...(periodosActuales.get(periodo.id) ?? {}),
      })),
      ...(state.periodos ?? []).filter((periodo) => !periodosIniciales.has(periodo.id)),
    ].sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento)),
    emprendedores: state.emprendedores.map((emprendedor) => ({
      ...emprendedor,
      whatsapp: emprendedor.whatsapp ?? "",
      whatsappSecundario: emprendedor.whatsappSecundario ?? "",
      nombreContactoSecundario: emprendedor.nombreContactoSecundario ?? "",
      estado: emprendedor.estado ?? "activa",
      fechaBaja: emprendedor.fechaBaja ?? "",
      motivoBaja: emprendedor.motivoBaja ?? "",
      observacionBaja: emprendedor.observacionBaja ?? "",
    })),
    cobros: [
      ...tesoreriaInicial.cobros.map((cobro) => ({
        ...cobro,
        ...(cobrosActuales.get(cobro.id) ?? {}),
      })),
      ...(state.cobros ?? []).filter((cobro) => !cobrosIniciales.has(cobro.id)),
    ].map((cobro) => ({
      ...withNormalizedPaymentAttachments(cobro),
      fechaAtraso: cobro.fechaAtraso ?? "",
      referenciaPago: cobro.referenciaPago ?? "",
    })),
    pagosCes: state.pagosCes?.length
      ? state.pagosCes.map((pago) => ({
          ...withNormalizedPaymentAttachments(pago),
          fechaVencimiento: pago.fechaVencimiento || configuracion.ces.fechaVencimiento,
          fechaAtraso: pago.fechaAtraso ?? "",
          referenciaPago: pago.referenciaPago ?? "",
        }))
      : crearPagosCes(state.emprendedores, configuracion),
    emprendimientos: (state.emprendimientos ?? []).map((emprendimiento) => ({
      ...emprendimiento,
      rubro: emprendimiento.rubro ?? "",
      descripcion: emprendimiento.descripcion ?? "",
      direccion: emprendimiento.direccion ?? "",
      sector: emprendimiento.sector ?? "",
      whatsapp: emprendimiento.whatsapp ?? "",
      correo: emprendimiento.correo ?? "",
      redesSociales: emprendimiento.redesSociales ?? "",
      estado: emprendimiento.estado ?? "activo",
      periodoOrigenId: emprendimiento.periodoOrigenId ?? "",
      creditoOrigen: emprendimiento.creditoOrigen ?? 0,
      fotos: emprendimiento.fotos ?? [],
      notas: emprendimiento.notas ?? "",
      createdAt: emprendimiento.createdAt ?? new Date().toISOString(),
      updatedAt: emprendimiento.updatedAt ?? emprendimiento.createdAt ?? new Date().toISOString(),
    })),
    reuniones: (state.reuniones ?? []).map((reunion) => normalizarAsistencias(reunion, state.emprendedores)),
    historial: (state.historial ?? []).slice(0, 450).map((movimiento) => ({
      ...movimiento,
      detalle: compactAuditDetail(movimiento.detalle ?? ""),
    })),
  };
};

const loadState = (): TesoreriaState => {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return tesoreriaInicial;

  try {
    return migrateState(JSON.parse(stored) as TesoreriaState);
  } catch {
    return tesoreriaInicial;
  }
};

const getStateTime = (state: TesoreriaState | null | undefined) => {
  const value = state?.updatedAt ? Date.parse(state.updatedAt) : 0;
  return Number.isFinite(value) ? value : 0;
};

const isLocalStateNewer = (localState: TesoreriaState, remoteState: TesoreriaState) =>
  getStateTime(localState) > getStateTime(remoteState) + 1000;

const crearEstadoOperativoInicial = (current: TesoreriaState): TesoreriaState => {
  const emprendedores = current.emprendedores.length ? current.emprendedores : tesoreriaInicial.emprendedores;
  const configuracion = current.configuracion ?? tesoreriaInicial.configuracion;

  return {
    ...current,
    centro: current.centro ?? tesoreriaInicial.centro,
    configuracion,
    periodos: current.periodos.length ? current.periodos : tesoreriaInicial.periodos,
    emprendedores,
    cobros: current.cobros.map((cobro) => ({
      ...cobro,
      montoPagado: 0,
      estadoPago: "pendiente",
      atraso: 0,
      fechaAtraso: "",
      fechaPago: "",
      metodoPago: "",
      referenciaPago: "",
      comprobanteAdjunto: null,
      comprobantesAdjuntos: [],
      observacion: "",
      confirmadoPorTesorero: false,
    })),
    pagosCes: crearPagosCes(emprendedores, configuracion),
    emprendimientos: [],
    reuniones: [],
    updatedAt: new Date().toISOString(),
  };
};

export const useTesoreria = (options: { syncEnabled?: boolean; publicReadEnabled?: boolean; updatedBy?: string } = {}) => {
  const [state, setState] = useState<TesoreriaState>(loadState);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>(
    isCloudConfigured ? "connecting" : "local",
  );
  const [cloudError, setCloudError] = useState("");
  const [cloudReady, setCloudReady] = useState(!isCloudConfigured);
  const applyingRemoteRef = useRef(false);
  const pendingLocalSaveRef = useRef(false);
  const remoteReadyRef = useRef(false);
  const hasStoredLocalStateRef = useRef(Boolean(window.localStorage.getItem(STORAGE_KEY)));
  const saveTimeoutRef = useRef<number | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!isCloudConfigured) {
      setCloudStatus("local");
      setCloudError(`Faltan variables de nube: ${getCloudMissingConfig().join(", ")}.`);
      setCloudReady(true);
      remoteReadyRef.current = false;
      return;
    }

    if (!options.syncEnabled && options.publicReadEnabled) {
      setCloudStatus("connecting");
      setCloudError("");
      setCloudReady(false);
      readRemoteState()
        .then((remoteState) => {
          if (remoteState) {
            applyingRemoteRef.current = true;
            setState(migrateState(remoteState));
          }
          setCloudStatus("local");
          setCloudReady(true);
        })
        .catch((error) => {
          setCloudStatus("error");
          setCloudError(error instanceof Error ? error.message : `No se pudo leer la vitrina desde ${cloudBackendName}.`);
          setCloudReady(true);
        });
      remoteReadyRef.current = false;
      return;
    }

    if (!options.syncEnabled) {
      setCloudStatus("connecting");
      setCloudError(`Inicia sesion con Google para activar la sincronizacion con ${cloudBackendName}.`);
      setCloudReady(false);
      remoteReadyRef.current = false;
      return;
    }

    let cancelled = false;
    setCloudStatus("connecting");
    setCloudError("");
    setCloudReady(false);

    readRemoteState()
      .then(async (remoteState) => {
        if (cancelled) return;
        if (remoteState) {
          const migratedRemoteState = migrateState(remoteState);
          if (hasStoredLocalStateRef.current && isLocalStateNewer(state, migratedRemoteState)) {
            pendingLocalSaveRef.current = true;
            setCloudStatus("saving");
            await saveRemoteState(state, options.updatedBy);
            pendingLocalSaveRef.current = false;
          } else {
            pendingLocalSaveRef.current = false;
            applyingRemoteRef.current = true;
            setState(migratedRemoteState);
          }
        } else {
          pendingLocalSaveRef.current = true;
          setCloudStatus("saving");
          await saveRemoteState(state, options.updatedBy);
          pendingLocalSaveRef.current = false;
        }
        if (cancelled) return;
        remoteReadyRef.current = true;
        setCloudReady(true);
        setCloudStatus("synced");
      })
      .catch((error) => {
        if (cancelled) return;
        setCloudStatus("error");
        setCloudError(getErrorMessage(error, `No se pudo conectar con ${cloudBackendName}.`));
        setCloudReady(false);
      });

    const unsubscribe = subscribeRemoteState(
      (remoteState) => {
        if (!remoteReadyRef.current || !remoteState) return;
        if (pendingLocalSaveRef.current) return;
        applyingRemoteRef.current = true;
        setState(migrateState(remoteState));
        setCloudReady(true);
        setCloudStatus("synced");
      },
      (message) => {
        if (isTransientFirebaseMessage(message)) {
          setCloudStatus("connecting");
          setCloudError(`${cloudBackendName} esta reconectando. Los cambios se conservan localmente y se sincronizaran al recuperar la conexion.`);
          return;
        }

        setCloudStatus("error");
        setCloudError(getErrorMessage(new Error(message), `No se pudo sincronizar con ${cloudBackendName}.`));
      },
    );

    return () => {
      cancelled = true;
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      unsubscribe();
    };
  }, [options.publicReadEnabled, options.syncEnabled, options.updatedBy]);

  useEffect(() => {
    if (!isCloudConfigured || !options.syncEnabled || !remoteReadyRef.current) return;

    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    pendingLocalSaveRef.current = true;
    setCloudStatus("saving");
    const persistState = (attempt = 0) => {
      saveRemoteState(state, options.updatedBy)
        .then(() => {
          if (retryTimeoutRef.current) {
            window.clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
          }
          pendingLocalSaveRef.current = false;
          setCloudStatus("synced");
          setCloudError("");
        })
        .catch((error) => {
          const message = getErrorMessage(error, `No se pudo guardar en ${cloudBackendName}.`);
          const canRetry = isTransientFirebaseMessage(message) && attempt < SYNC_RETRY_DELAYS.length;

          if (!canRetry) {
            setCloudStatus("error");
            setCloudError(message);
            return;
          }

          setCloudStatus("connecting");
          setCloudError(`${cloudBackendName} esta reconectando. Mantuvimos los cambios en este equipo y volveremos a intentar sincronizar.`);
          retryTimeoutRef.current = window.setTimeout(() => {
            setCloudStatus("saving");
            persistState(attempt + 1);
          }, SYNC_RETRY_DELAYS[attempt]);
        });
    };

    saveTimeoutRef.current = window.setTimeout(() => {
      persistState();
    }, 450);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [options.syncEnabled, options.updatedBy, state]);

  const updateCobro = (id: string, patch: Partial<CobroSemanal>, accion = "Cobro actualizado") => {
    setState((current) => {
      const cobroActual = current.cobros.find((cobro) => cobro.id === id);
      const normalizedPatch = normalizePaymentPatch(cobroActual, patch);
      if (!getPatchChanges(cobroActual, normalizedPatch).length) return current;
      applyingRemoteRef.current = false;
      pendingLocalSaveRef.current = true;
      const persona = cobroActual ? current.emprendedores.find((item) => item.id === cobroActual.emprendedorId) : undefined;

      return withMovimiento({
        ...current,
        cobros: current.cobros.map((cobro) =>
          cobro.id === id ? { ...cobro, ...normalizedPatch } : cobro,
        ),
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "cobro",
        accion,
        detalle: describeChanges(cobroActual, normalizedPatch),
        entidadId: id,
        personaId: persona?.id ?? cobroActual?.emprendedorId,
        personaNombre: persona?.nombre,
      }, options.updatedBy);
    });
  };

  const updateCes = (id: string, patch: Partial<PagoCes>, accion = "Pago CES actualizado") => {
    setState((current) => {
      const pagoActual = current.pagosCes.find((pago) => pago.id === id);
      const normalizedPatch = normalizePaymentPatch(pagoActual, patch);
      if (!getPatchChanges(pagoActual, normalizedPatch).length) return current;
      applyingRemoteRef.current = false;
      pendingLocalSaveRef.current = true;
      const persona = pagoActual ? current.emprendedores.find((item) => item.id === pagoActual.emprendedorId) : undefined;

      return withMovimiento({
        ...current,
        pagosCes: current.pagosCes.map((pago) => (pago.id === id ? { ...pago, ...normalizedPatch } : pago)),
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "ces",
        accion,
        detalle: describeChanges(pagoActual, normalizedPatch),
        entidadId: id,
        personaId: persona?.id ?? pagoActual?.emprendedorId,
        personaNombre: persona?.nombre,
      }, options.updatedBy);
    });
  };

  const updateCentro = (patch: Partial<Centro>) => {
    setState((current) =>
      withMovimiento({
        ...current,
        centro: { ...current.centro, ...patch },
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "configuracion",
        accion: "Datos del centro actualizados",
        detalle: describeChanges(current.centro, patch),
        entidadId: current.centro.idCentro,
      }, options.updatedBy),
    );
  };

  const updatePeriodo = (id: string, patch: Partial<Periodo>) => {
    setState((current) => {
      const periodo = current.periodos.find((item) => item.id === id);

      return withMovimiento({
        ...current,
        periodos: current.periodos.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "configuracion",
        accion: "Semana de cobro actualizada",
        detalle: `${periodo ? `Cuota ${periodo.numeroCuota}. ` : ""}${describeChanges(periodo, patch)}`,
        entidadId: id,
      }, options.updatedBy);
    });
  };

  const updateEmprendedor = (id: string, patch: Partial<Emprendedor>) => {
    setState((current) => {
      const persona = current.emprendedores.find((emprendedor) => emprendedor.id === id);

      return withMovimiento({
        ...current,
        emprendedores: current.emprendedores.map((emprendedor) =>
          emprendedor.id === id ? { ...emprendedor, ...patch } : emprendedor,
        ),
        pagosCes: current.pagosCes.map((pago) => {
          if (pago.emprendedorId !== id || patch.creditoOriginal === undefined) return pago;
          const totalEsperado = getMontoCes(patch.creditoOriginal, current.configuracion.ces.montosPorCredito);

          return {
            ...pago,
            creditoBase: patch.creditoOriginal,
            totalEsperado,
            estadoPago: deriveEstadoPago(pago.montoPagado, totalEsperado, pago.estadoPago),
            confirmadoPorTesorero: pago.montoPagado >= totalEsperado && totalEsperado > 0,
          };
        }),
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "persona",
        accion: buildPersonaAuditAction(persona, patch),
        detalle: describeChanges(persona, patch),
        entidadId: id,
        personaId: id,
        personaNombre: patch.nombre ?? persona?.nombre,
      }, options.updatedBy);
    });
  };

  const crearEmprendimiento = (payload: Omit<Emprendimiento, "id" | "createdAt" | "updatedAt">) => {
    const timestamp = new Date().toISOString();
    const id = `emprendimiento-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setState((current) => {
      const persona = current.emprendedores.find((item) => item.id === payload.emprendedorId);
      const emprendimiento: Emprendimiento = {
        ...payload,
        id,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      return withMovimiento({
        ...current,
        emprendimientos: [emprendimiento, ...(current.emprendimientos ?? [])],
        updatedAt: timestamp,
      }, {
        tipo: "emprendimiento",
        accion: "Emprendimiento creado",
        detalle: `${emprendimiento.nombre}. Rubro: ${emprendimiento.rubro || "sin rubro"}. Fotos: ${normalizeAuditValue(emprendimiento.fotos)}.`,
        entidadId: id,
        personaId: persona?.id ?? payload.emprendedorId,
        personaNombre: persona?.nombre,
      }, options.updatedBy);
    });

    return id;
  };

  const updateEmprendimiento = (id: string, patch: Partial<Emprendimiento>) => {
    setState((current) => {
      const emprendimiento = current.emprendimientos.find((item) => item.id === id);
      const personaId = patch.emprendedorId ?? emprendimiento?.emprendedorId;
      const persona = current.emprendedores.find((item) => item.id === personaId);
      const timestamp = new Date().toISOString();

      return withMovimiento({
        ...current,
        emprendimientos: current.emprendimientos.map((item) =>
          item.id === id ? { ...item, ...patch, updatedAt: timestamp } : item,
        ),
        updatedAt: timestamp,
      }, {
        tipo: "emprendimiento",
        accion: "Emprendimiento actualizado",
        detalle: `${emprendimiento?.nombre ?? "Emprendimiento"}. ${describeChanges(emprendimiento, patch)}`,
        entidadId: id,
        personaId,
        personaNombre: persona?.nombre,
      }, options.updatedBy);
    });
  };

  const eliminarEmprendimiento = (id: string) => {
    setState((current) => {
      const emprendimiento = current.emprendimientos.find((item) => item.id === id);
      const persona = current.emprendedores.find((item) => item.id === emprendimiento?.emprendedorId);

      return withMovimiento({
        ...current,
        emprendimientos: current.emprendimientos.filter((item) => item.id !== id),
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "emprendimiento",
        accion: "Emprendimiento eliminado",
        detalle: emprendimiento
          ? `${emprendimiento.nombre}. Se quitaron ${emprendimiento.fotos.length} foto${emprendimiento.fotos.length === 1 ? "" : "s"} asociada${emprendimiento.fotos.length === 1 ? "" : "s"}.`
          : "Se elimino un emprendimiento.",
        entidadId: id,
        personaId: persona?.id ?? emprendimiento?.emprendedorId,
        personaNombre: persona?.nombre,
      }, options.updatedBy);
    });
  };

  const updateConfiguracionCes = (patch: Partial<ConfiguracionCes>) => {
    setState((current) => {
      const ces = {
        ...current.configuracion.ces,
        ...patch,
        montosPorCredito: {
          ...current.configuracion.ces.montosPorCredito,
          ...(patch.montosPorCredito ?? {}),
        },
      };

      return withMovimiento({
        ...current,
        configuracion: {
          ...current.configuracion,
          ces,
        },
        pagosCes: current.pagosCes.map((pago) => ({
          ...pago,
          fechaVencimiento: ces.fechaVencimiento,
        })),
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "configuracion",
        accion: "Configuracion CES actualizada",
        detalle: describeChanges(current.configuracion.ces, patch),
      }, options.updatedBy);
    });
  };

  const updateConfiguracionSeguridad = (patch: Partial<ConfiguracionSeguridad>) => {
    setState((current) =>
      withMovimiento({
        ...current,
        configuracion: {
          ...current.configuracion,
          seguridad: {
            ...current.configuracion.seguridad,
            ...patch,
          },
        },
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "configuracion",
        accion: "Seguridad actualizada",
        detalle: describeChanges(current.configuracion.seguridad, patch),
      }, options.updatedBy),
    );
  };

  const updateConfiguracionMicrocredito = (patch: Partial<ConfiguracionMicrocredito>) => {
    setState((current) => {
      const microcredito = {
        ...current.configuracion.microcredito,
        ...patch,
        directiva: {
          ...current.configuracion.microcredito.directiva,
          ...(patch.directiva ?? {}),
        },
      };

      return withMovimiento({
        ...current,
        configuracion: {
          ...current.configuracion,
          microcredito,
        },
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "configuracion",
        accion: "Reglas de microcredito actualizadas",
        detalle: describeChanges(current.configuracion.microcredito, patch),
      }, options.updatedBy);
    });
  };

  const updateCuentaTransferencia = (patch: Partial<CuentaTransferencia>) => {
    setState((current) => {
      const cuentaTransferencia = {
        ...current.configuracion.cuentaTransferencia,
        ...patch,
      };

      return withMovimiento({
        ...current,
        configuracion: {
          ...current.configuracion,
          cuentaTransferencia,
        },
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "configuracion",
        accion: "Cuenta de transferencia actualizada",
        detalle: describeChanges(current.configuracion.cuentaTransferencia, patch),
      }, options.updatedBy);
    });
  };

  const recalcularPagosCes = () => {
    setState((current) =>
      withMovimiento({
        ...current,
        pagosCes: current.pagosCes.map((pago) => {
          const emprendedor = current.emprendedores.find((persona) => persona.id === pago.emprendedorId);
          const creditoBase = emprendedor?.creditoOriginal ?? pago.creditoBase;
          const totalEsperado = getMontoCes(creditoBase, current.configuracion.ces.montosPorCredito);

          return {
            ...pago,
            creditoBase,
            fechaVencimiento: current.configuracion.ces.fechaVencimiento,
            totalEsperado,
            estadoPago: deriveEstadoPago(pago.montoPagado, totalEsperado, pago.estadoPago),
            confirmadoPorTesorero: pago.montoPagado >= totalEsperado && totalEsperado > 0,
          };
        }),
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "ces",
        accion: "Pagos CES recalculados",
        detalle: "Se recalcularon los montos CES segun credito y reglas vigentes.",
      }, options.updatedBy),
    );
  };

  const marcarPagado = (id: string) => {
    const cobro = state.cobros.find((item) => item.id === id);
    if (!cobro) return;

    updateCobro(id, {
      montoPagado: cobro.totalEsperado,
      estadoPago: "pagado",
      fechaAtraso: "",
      fechaPago: new Date().toISOString().slice(0, 10),
      confirmadoPorTesorero: true,
    }, "Cobro marcado como pagado");
  };

  const marcarCesPagado = (id: string) => {
    const pago = state.pagosCes.find((item) => item.id === id);
    if (!pago) return;

    updateCes(id, {
      montoPagado: pago.totalEsperado,
      estadoPago: "pagado",
      fechaAtraso: "",
      fechaPago: new Date().toISOString().slice(0, 10),
      confirmadoPorTesorero: true,
    }, "Pago CES marcado como pagado");
  };

  const cambiarEstado = (id: string, estadoPago: EstadoPago) => {
    const cobro = state.cobros.find((item) => item.id === id);
    if (!cobro) return;

    const patch: Partial<CobroSemanal> = { estadoPago };

    if (estadoPago === "pendiente" || estadoPago === "atrasado") {
      patch.montoPagado = 0;
      patch.confirmadoPorTesorero = false;
    }

    patch.fechaAtraso = estadoPago === "atrasado" ? new Date().toISOString() : "";

    if (estadoPago === "pagado") {
      patch.montoPagado = cobro.totalEsperado;
      patch.fechaPago = new Date().toISOString().slice(0, 10);
      patch.confirmadoPorTesorero = true;
    }

    updateCobro(id, patch, `Estado de cobro cambiado a ${estadoPago}`);
  };

  const cambiarEstadoCes = (id: string, estadoPago: EstadoPago) => {
    const pago = state.pagosCes.find((item) => item.id === id);
    if (!pago) return;

    const patch: Partial<PagoCes> = { estadoPago };

    if (estadoPago === "pendiente" || estadoPago === "atrasado") {
      patch.montoPagado = 0;
      patch.confirmadoPorTesorero = false;
    }

    patch.fechaAtraso = estadoPago === "atrasado" ? new Date().toISOString() : "";

    if (estadoPago === "pagado") {
      patch.montoPagado = pago.totalEsperado;
      patch.fechaPago = new Date().toISOString().slice(0, 10);
      patch.confirmadoPorTesorero = true;
    }

    updateCes(id, patch, `Estado CES cambiado a ${estadoPago}`);
  };

  const registrarMonto = (id: string, montoPagado: number) => {
    const cobro = state.cobros.find((item) => item.id === id);
    if (!cobro) return;

    const estadoPago =
      montoPagado <= 0 ? "pendiente" : montoPagado >= cobro.totalEsperado ? "pagado" : "parcial";

    updateCobro(id, {
      montoPagado,
      estadoPago,
      fechaAtraso: "",
      confirmadoPorTesorero: estadoPago === "pagado",
      fechaPago: montoPagado > 0 ? cobro.fechaPago || new Date().toISOString().slice(0, 10) : "",
    }, "Monto de cobro registrado");
  };

  const registrarMontoCes = (id: string, montoPagado: number) => {
    const pago = state.pagosCes.find((item) => item.id === id);
    if (!pago) return;

    const estadoPago =
      montoPagado <= 0 ? "pendiente" : montoPagado >= pago.totalEsperado ? "pagado" : "parcial";

    updateCes(id, {
      montoPagado,
      estadoPago,
      fechaAtraso: "",
      confirmadoPorTesorero: estadoPago === "pagado",
      fechaPago: montoPagado > 0 ? pago.fechaPago || new Date().toISOString().slice(0, 10) : "",
    }, "Monto CES registrado");
  };

  const actualizarDetalle = (
    id: string,
    detail: { fechaPago?: string; metodoPago?: MetodoPago; referenciaPago?: string; comprobanteAdjunto?: ComprobanteAdjunto | null; comprobantesAdjuntos?: ComprobanteAdjunto[]; observacion?: string },
  ) => updateCobro(id, detail, "Detalle de cobro actualizado");

  const actualizarCobro = (id: string, patch: Partial<CobroSemanal>) => updateCobro(id, patch, "Cobro editado");

  const actualizarDetalleCes = (
    id: string,
    detail: { fechaPago?: string; metodoPago?: MetodoPago; referenciaPago?: string; comprobanteAdjunto?: ComprobanteAdjunto | null; comprobantesAdjuntos?: ComprobanteAdjunto[]; observacion?: string },
  ) => updateCes(id, detail, "Detalle CES actualizado");

  const registrarPagoMultiple = (
    ids: string[],
    detail: { fechaPago: string; metodoPago: MetodoPago; referenciaPago: string; comprobanteAdjunto?: ComprobanteAdjunto | null; comprobantesAdjuntos?: ComprobanteAdjunto[]; observacion?: string },
  ) => {
    const selected = new Set(ids);
    const comprobantesDelPago = normalizeComprobantesAdjuntos(
      undefined,
      detail.comprobantesAdjuntos ?? (detail.comprobanteAdjunto ? [detail.comprobanteAdjunto] : []),
    );

    setState((current) => {
      const cobrosSeleccionados = current.cobros.filter((cobro) => selected.has(cobro.id));
      const persona = current.emprendedores.find((item) => item.id === cobrosSeleccionados[0]?.emprendedorId);

      applyingRemoteRef.current = false;
      pendingLocalSaveRef.current = true;

      return withMovimiento({
        ...current,
        cobros: current.cobros.map((cobro) => {
          if (!selected.has(cobro.id)) return cobro;
          const comprobantesAdjuntos = comprobantesDelPago.map((adjunto) => ({ ...adjunto }));

          return {
            ...cobro,
            montoPagado: cobro.totalEsperado,
            estadoPago: "pagado",
            fechaAtraso: "",
            fechaPago: detail.fechaPago,
            metodoPago: detail.metodoPago,
            referenciaPago: detail.metodoPago === "efectivo" ? "" : detail.referenciaPago.trim(),
            comprobanteAdjunto: comprobantesAdjuntos[0] ?? null,
            comprobantesAdjuntos,
            observacion: detail.observacion?.trim() || cobro.observacion,
            confirmadoPorTesorero: true,
          };
        }),
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "cobro",
        accion: "Pago multiple registrado",
        detalle: `Se marcaron ${ids.length} cuota${ids.length === 1 ? "" : "s"} como pagada${ids.length === 1 ? "" : "s"}. Metodo: ${detail.metodoPago || "sin metodo"}.`,
        entidadId: ids.join(","),
        personaId: persona?.id,
        personaNombre: persona?.nombre,
      }, options.updatedBy);
    });
  };

  const crearReunion = (reunion: { titulo: string; fecha: string; lugar?: string; observacion?: string; acta?: string }) => {
    const id = `reunion-${reunion.fecha}-${Date.now()}`;

    setState((current) =>
      withMovimiento({
        ...current,
        reuniones: [
          ...current.reuniones,
          {
            id,
            titulo: reunion.titulo.trim() || `Reunion ${current.reuniones.length + 1}`,
            fecha: reunion.fecha,
            lugar: reunion.lugar?.trim() ?? "",
            observacion: reunion.observacion?.trim() ?? "",
            acta: reunion.acta?.trim() ?? "",
            fotos: [],
            asistencias: crearAsistenciasBase(current.emprendedores),
          },
        ],
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "reunion",
        accion: "Reunion creada",
        detalle: `${reunion.titulo.trim() || `Reunion ${current.reuniones.length + 1}`} · ${reunion.fecha}.`,
        entidadId: id,
      }, options.updatedBy),
    );

    return id;
  };

  const updateReunion = (id: string, patch: Partial<Omit<Reunion, "id" | "asistencias">>) => {
    setState((current) => {
      const reunion = current.reuniones.find((item) => item.id === id);
      if (!getPatchChanges(reunion, patch).length) return current;

      return withMovimiento({
        ...current,
        reuniones: current.reuniones.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "reunion",
        accion: "Reunion actualizada",
        detalle: `${reunion?.titulo ?? "Reunion"}. ${describeChanges(reunion, patch)}`,
        entidadId: id,
      }, options.updatedBy);
    });
  };

  const eliminarReunion = (id: string) => {
    setState((current) => {
      const reunion = current.reuniones.find((item) => item.id === id);

      return withMovimiento({
        ...current,
        reuniones: current.reuniones.filter((item) => item.id !== id),
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "reunion",
        accion: "Reunion eliminada",
        detalle: reunion ? `${reunion.titulo} · ${reunion.fecha}.` : "Se elimino una reunion.",
        entidadId: id,
      }, options.updatedBy);
    });
  };

  const updateAsistencia = (
    reunionId: string,
    emprendedorId: string,
    patch: { estado?: EstadoAsistencia; observacion?: string },
  ) => {
    setState((current) => {
      const reunion = current.reuniones.find((item) => item.id === reunionId);
      const persona = current.emprendedores.find((item) => item.id === emprendedorId);
      const asistenciaActual = reunion?.asistencias.find((asistencia) => asistencia.emprendedorId === emprendedorId);
      if (!getPatchChanges(asistenciaActual, patch).length) return current;

      return withMovimiento({
        ...current,
        reuniones: current.reuniones.map((item) => {
          if (item.id !== reunionId) return item;

          return {
            ...item,
            asistencias: item.asistencias.map((asistencia) =>
              asistencia.emprendedorId === emprendedorId ? { ...asistencia, ...patch } : asistencia,
            ),
          };
        }),
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "asistencia",
        accion: "Asistencia actualizada",
        detalle: `${reunion?.titulo ?? "Reunion"}. ${describeChanges(asistenciaActual, patch)}`,
        entidadId: reunionId,
        personaId: persona?.id ?? emprendedorId,
        personaNombre: persona?.nombre,
      }, options.updatedBy);
    });
  };

  const marcarTodosPresentes = (reunionId: string) => {
    setState((current) => {
      const reunion = current.reuniones.find((item) => item.id === reunionId);
      if (reunion && reunion.asistencias.every((asistencia) => asistencia.estado === "presente")) return current;

      return withMovimiento({
        ...current,
        reuniones: current.reuniones.map((item) => {
          if (item.id !== reunionId) return item;

          return {
            ...item,
            asistencias: item.asistencias.map((asistencia) => ({
              ...asistencia,
              estado: "presente",
            })),
          };
        }),
        updatedAt: new Date().toISOString(),
      }, {
        tipo: "asistencia",
        accion: "Todos marcados presentes",
        detalle: `${reunion?.titulo ?? "Reunion"}. Se marcaron ${reunion?.asistencias.length ?? 0} participantes presentes.`,
        entidadId: reunionId,
      }, options.updatedBy);
    });
  };

  const resetear = () => {
    setState((current) =>
      ({
        ...crearEstadoOperativoInicial(current),
        historial: [],
      }),
    );
  };

  const importar = (nextState: TesoreriaState) => {
    setState((current) =>
      withMovimiento(migrateState({
        ...nextState,
        historial: nextState.historial?.length ? nextState.historial : current.historial,
      }), {
        tipo: "respaldo",
        accion: "Respaldo importado",
        detalle: "Se importo un respaldo JSON y se reemplazo la informacion del sistema.",
      }, options.updatedBy),
    );
  };

  const registrarMovimiento = (movimiento: AuditInput) => {
    setState((current) =>
      withMovimiento({
        ...current,
        updatedAt: new Date().toISOString(),
      }, movimiento, options.updatedBy),
    );
  };

  const personasPorId = useMemo(
    () => new Map(state.emprendedores.map((emprendedor) => [emprendedor.id, emprendedor])),
    [state.emprendedores],
  );

  return {
    state,
    cloudStatus,
    cloudError,
    cloudReady,
    personasPorId,
    updateCentro,
    updatePeriodo,
    updateEmprendedor,
    crearEmprendimiento,
    updateEmprendimiento,
    eliminarEmprendimiento,
    updateConfiguracionCes,
    updateConfiguracionSeguridad,
    updateConfiguracionMicrocredito,
    updateCuentaTransferencia,
    recalcularPagosCes,
    marcarPagado,
    cambiarEstado,
    marcarCesPagado,
    cambiarEstadoCes,
    registrarMonto,
    registrarMontoCes,
    actualizarCobro,
    actualizarDetalle,
    actualizarDetalleCes,
    registrarPagoMultiple,
    crearReunion,
    updateReunion,
    eliminarReunion,
    updateAsistencia,
    marcarTodosPresentes,
    registrarMovimiento,
    importar,
    resetear,
  };
};
