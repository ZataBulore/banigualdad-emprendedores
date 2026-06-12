import { createClient } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ComprobanteAdjunto, SolicitudEmprendimiento, TesoreriaState } from "../types/tesoreria";

const getEnvValue = (key: string) => String(import.meta.env[key] ?? "").trim();

const supabaseEnvKeys = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
] as const;

export const getSupabaseMissingConfig = () =>
  supabaseEnvKeys.filter((key) => !getEnvValue(key));

export const isSupabaseConfigured = getSupabaseMissingConfig().length === 0;

export const SUPABASE_STATE_TABLE = getEnvValue("VITE_SUPABASE_STATE_TABLE") || "app_state";
export const SUPABASE_STATE_ID = getEnvValue("VITE_SUPABASE_STATE_ID") || "semilla-emprende-negrete";
export const SUPABASE_COMPROBANTES_BUCKET = getEnvValue("VITE_SUPABASE_COMPROBANTES_BUCKET") || "comprobantes";
export const SUPABASE_SOLICITUDES_TABLE = getEnvValue("VITE_SUPABASE_SOLICITUDES_TABLE") || "venture_requests";

const supabase = isSupabaseConfigured
  ? createClient(getEnvValue("VITE_SUPABASE_URL"), getEnvValue("VITE_SUPABASE_ANON_KEY"))
  : null;

const withSupabaseTimeout = async <T>(operation: Promise<T>, fallbackMessage: string, timeoutMs = 12000) => {
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

const sanitizeForSupabase = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const compactAttachment = (attachment: unknown) => {
  if (!attachment || typeof attachment !== "object") return attachment;
  const { dataUrl: _dataUrl, ...rest } = attachment as { dataUrl?: unknown };
  return rest;
};

const compactPaymentAttachments = <T extends { comprobanteAdjunto?: unknown; comprobantesAdjuntos?: unknown[] }>(item: T): T => {
  const comprobantesAdjuntos = Array.isArray(item.comprobantesAdjuntos)
    ? item.comprobantesAdjuntos.map(compactAttachment)
    : item.comprobanteAdjunto
      ? [compactAttachment(item.comprobanteAdjunto)]
      : [];

  return {
    ...item,
    comprobanteAdjunto: null,
    comprobantesAdjuntos,
  };
};

const compactStateForSupabase = (state: TesoreriaState): TesoreriaState => ({
  ...state,
  cobros: state.cobros.map(compactPaymentAttachments),
  pagosCes: state.pagosCes.map(compactPaymentAttachments),
});

export const readSupabaseState = async () => {
  if (!supabase) return null;

  const { data, error } = await withSupabaseTimeout(
    Promise.resolve(
      supabase
        .from(SUPABASE_STATE_TABLE)
        .select("state")
        .eq("id", SUPABASE_STATE_ID)
        .maybeSingle(),
    ),
    "Supabase no respondio al leer la informacion.",
  );

  if (error) throw error;
  return (data?.state as TesoreriaState | undefined) ?? null;
};

export const saveSupabaseState = async (state: TesoreriaState, updatedBy?: string) => {
  if (!supabase) return;

  const { error } = await withSupabaseTimeout(
    Promise.resolve(
      supabase
        .from(SUPABASE_STATE_TABLE)
        .upsert({
          id: SUPABASE_STATE_ID,
          state: sanitizeForSupabase(compactStateForSupabase(state)),
          updated_at: new Date().toISOString(),
          updated_by: updatedBy ?? "",
        }),
    ),
    "Supabase no respondio al guardar.",
  );

  if (error) throw error;
};

export const subscribeSupabaseState = (
  onData: (state: TesoreriaState | null) => void,
  onError: (message: string) => void,
) => {
  if (!supabase) return () => {};

  let channel: RealtimeChannel | null = supabase
    .channel(`app-state-${SUPABASE_STATE_ID}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: SUPABASE_STATE_TABLE,
        filter: `id=eq.${SUPABASE_STATE_ID}`,
      },
      (payload) => {
        const row = payload.new as { state?: TesoreriaState } | null;
        onData(row?.state ?? null);
      },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError("Supabase no pudo mantener la sincronizacion en tiempo real. Los cambios se guardan, pero puede ser necesario recargar para ver cambios de otros equipos.");
      }
    });

  return () => {
    if (!channel || !supabase) return;
    void supabase.removeChannel(channel);
    channel = null;
  };
};

const buildAttachmentPath = (fileName: string, directory = "comprobantes") => {
  const safeName = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `${SUPABASE_STATE_ID}/${directory}/${stamp}-${random}-${safeName || "archivo"}`;
};

export const uploadSupabaseAsset = async (
  fileName: string,
  blob: Blob,
  contentType: string,
  directory = "comprobantes",
): Promise<Pick<ComprobanteAdjunto, "url" | "storagePath" | "storageProvider"> | null> => {
  if (!supabase) return null;

  const storagePath = buildAttachmentPath(fileName, directory);
  const { error } = await withSupabaseTimeout(
    supabase.storage
      .from(SUPABASE_COMPROBANTES_BUCKET)
      .upload(storagePath, blob, {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      }),
    "Supabase no respondio al subir el comprobante.",
  );

  if (error) throw error;

  const { data } = supabase.storage
    .from(SUPABASE_COMPROBANTES_BUCKET)
    .getPublicUrl(storagePath);

  return {
    url: data.publicUrl,
    storagePath,
    storageProvider: "supabase",
  };
};

export const uploadSupabaseComprobante = (fileName: string, blob: Blob, contentType: string) =>
  uploadSupabaseAsset(fileName, blob, contentType, "comprobantes");

const mapSolicitudRow = (row: { id: string; data?: unknown; created_at?: string; updated_at?: string }): SolicitudEmprendimiento => {
  const data = (row.data && typeof row.data === "object" ? row.data : {}) as Partial<SolicitudEmprendimiento>;
  const timestamp = new Date().toISOString();

  return {
    id: row.id,
    rut: data.rut ?? "",
    emprendedorId: data.emprendedorId ?? "",
    periodoValidadoId: data.periodoValidadoId ?? "",
    creditoOriginal: Number(data.creditoOriginal ?? 0),
    nombreContacto: data.nombreContacto ?? "",
    whatsapp: data.whatsapp ?? "",
    correo: data.correo ?? "",
    nombreEmprendimiento: data.nombreEmprendimiento ?? "",
    rubro: data.rubro ?? "",
    descripcion: data.descripcion ?? "",
    direccion: data.direccion ?? "",
    sector: data.sector ?? "",
    comuna: data.comuna ?? "",
    canalesVenta: Array.isArray(data.canalesVenta) ? data.canalesVenta.map(String) : [],
    horarios: Array.isArray(data.horarios) ? data.horarios.map(String) : [],
    redesSociales: data.redesSociales ?? "",
    necesidades: Array.isArray(data.necesidades) ? data.necesidades.map(String) : [],
    fotos: Array.isArray(data.fotos) ? data.fotos : [],
    estado: data.estado ?? "nueva",
    origen: "formulario-publico",
    notas: data.notas ?? "",
    createdAt: data.createdAt ?? row.created_at ?? timestamp,
    updatedAt: data.updatedAt ?? row.updated_at ?? row.created_at ?? timestamp,
  };
};

export const createSupabaseSolicitudEmprendimiento = async (
  payload: Omit<SolicitudEmprendimiento, "id" | "createdAt" | "updatedAt" | "estado" | "origen">,
) => {
  if (!supabase) throw new Error("Supabase no esta configurado para recibir formularios.");
  const timestamp = new Date().toISOString();
  const id = `solicitud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const data: SolicitudEmprendimiento = {
    id,
    ...payload,
    estado: "nueva",
    origen: "formulario-publico",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const { error } = await withSupabaseTimeout(
    Promise.resolve(
      supabase
        .from(SUPABASE_SOLICITUDES_TABLE)
        .insert({
          id,
          data: sanitizeForSupabase(data),
          created_at: timestamp,
          updated_at: timestamp,
        }),
    ),
    "Supabase no respondio al enviar el formulario.",
  );

  if (error) throw error;
  return id;
};

export const readSupabaseSolicitudesEmprendimiento = async () => {
  if (!supabase) return [];
  const { data, error } = await withSupabaseTimeout(
    Promise.resolve(
      supabase
        .from(SUPABASE_SOLICITUDES_TABLE)
        .select("id,data,created_at,updated_at")
        .order("created_at", { ascending: false }),
    ),
    "Supabase no respondio al leer las solicitudes.",
  );

  if (error) throw error;
  return (data ?? []).map(mapSolicitudRow);
};

export const subscribeSupabaseSolicitudesEmprendimiento = (
  onData: (solicitudes: SolicitudEmprendimiento[]) => void,
  onError: (message: string) => void,
) => {
  if (!supabase) return () => {};

  void readSupabaseSolicitudesEmprendimiento().then(onData).catch((error) => {
    onError(error instanceof Error ? error.message : "No se pudieron leer las solicitudes de emprendimientos.");
  });

  let channel: RealtimeChannel | null = supabase
    .channel("venture-requests")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: SUPABASE_SOLICITUDES_TABLE,
      },
      () => {
        void readSupabaseSolicitudesEmprendimiento().then(onData).catch((error) => {
          onError(error instanceof Error ? error.message : "No se pudieron leer las solicitudes de emprendimientos.");
        });
      },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError("Supabase no pudo mantener la sincronizacion de solicitudes en tiempo real. Recarga para actualizar.");
      }
    });

  return () => {
    if (!channel || !supabase) return;
    void supabase.removeChannel(channel);
    channel = null;
  };
};

export const updateSupabaseSolicitudEmprendimiento = async (
  id: string,
  patch: Partial<Omit<SolicitudEmprendimiento, "id" | "createdAt" | "updatedAt" | "origen">>,
) => {
  if (!supabase) throw new Error("Supabase no esta configurado.");
  const current = await readSupabaseSolicitudesEmprendimiento();
  const solicitud = current.find((item) => item.id === id);
  if (!solicitud) throw new Error("No se encontro la solicitud de emprendimiento.");
  const updatedAt = new Date().toISOString();
  const data: SolicitudEmprendimiento = {
    ...solicitud,
    ...patch,
    updatedAt,
  };

  const { error } = await withSupabaseTimeout(
    Promise.resolve(
      supabase
        .from(SUPABASE_SOLICITUDES_TABLE)
        .update({
          data: sanitizeForSupabase(data),
          updated_at: updatedAt,
        })
        .eq("id", id),
    ),
    "Supabase no respondio al actualizar la solicitud.",
  );

  if (error) throw error;
};
