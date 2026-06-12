import {
  createSolicitudEmprendimiento as createFirebaseSolicitudEmprendimiento,
  readSolicitudesEmprendimiento as readFirebaseSolicitudesEmprendimiento,
  subscribeSolicitudesEmprendimiento as subscribeFirebaseSolicitudesEmprendimiento,
  updateSolicitudEmprendimiento as updateFirebaseSolicitudEmprendimiento,
} from "./firebase";
import type { SolicitudEmprendimiento } from "../types/tesoreria";

export const createSolicitudEmprendimiento = (
  payload: Omit<SolicitudEmprendimiento, "id" | "createdAt" | "updatedAt" | "estado" | "origen">,
) => createFirebaseSolicitudEmprendimiento(payload);

export const readSolicitudesEmprendimiento = () => readFirebaseSolicitudesEmprendimiento();

export const subscribeSolicitudesEmprendimiento = (
  onData: (solicitudes: SolicitudEmprendimiento[]) => void,
  onError: (message: string) => void,
) => subscribeFirebaseSolicitudesEmprendimiento(onData, onError);

export const updateSolicitudEmprendimiento = (
  id: string,
  patch: Partial<Omit<SolicitudEmprendimiento, "id" | "createdAt" | "updatedAt" | "origen">>,
) => updateFirebaseSolicitudEmprendimiento(id, patch);
