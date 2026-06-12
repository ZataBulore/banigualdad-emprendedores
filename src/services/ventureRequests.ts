import {
  createSolicitudEmprendimiento as createFirebaseSolicitudEmprendimiento,
  readSolicitudesEmprendimiento as readFirebaseSolicitudesEmprendimiento,
  subscribeSolicitudesEmprendimiento as subscribeFirebaseSolicitudesEmprendimiento,
  updateSolicitudEmprendimiento as updateFirebaseSolicitudEmprendimiento,
} from "./firebase";
import {
  createSupabaseSolicitudEmprendimiento,
  isSupabaseConfigured,
  readSupabaseSolicitudesEmprendimiento,
  subscribeSupabaseSolicitudesEmprendimiento,
  updateSupabaseSolicitudEmprendimiento,
} from "./supabase";
import type { SolicitudEmprendimiento } from "../types/tesoreria";

export const createSolicitudEmprendimiento = (
  payload: Omit<SolicitudEmprendimiento, "id" | "createdAt" | "updatedAt" | "estado" | "origen">,
) => (
  isSupabaseConfigured
    ? createSupabaseSolicitudEmprendimiento(payload)
    : createFirebaseSolicitudEmprendimiento(payload)
);

export const readSolicitudesEmprendimiento = () => (
  isSupabaseConfigured
    ? readSupabaseSolicitudesEmprendimiento()
    : readFirebaseSolicitudesEmprendimiento()
);

export const subscribeSolicitudesEmprendimiento = (
  onData: (solicitudes: SolicitudEmprendimiento[]) => void,
  onError: (message: string) => void,
) => (
  isSupabaseConfigured
    ? subscribeSupabaseSolicitudesEmprendimiento(onData, onError)
    : subscribeFirebaseSolicitudesEmprendimiento(onData, onError)
);

export const updateSolicitudEmprendimiento = (
  id: string,
  patch: Partial<Omit<SolicitudEmprendimiento, "id" | "createdAt" | "updatedAt" | "origen">>,
) => (
  isSupabaseConfigured
    ? updateSupabaseSolicitudEmprendimiento(id, patch)
    : updateFirebaseSolicitudEmprendimiento(id, patch)
);
