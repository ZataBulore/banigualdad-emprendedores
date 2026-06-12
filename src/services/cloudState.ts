import {
  getFirebaseMissingConfig,
  isFirebaseConfigured,
  readRemoteState as readFirebaseState,
  saveRemoteState as saveFirebaseState,
  subscribeRemoteState as subscribeFirebaseState,
} from "./firebase";
import {
  getSupabaseMissingConfig,
  isSupabaseConfigured,
  readSupabaseState,
  saveSupabaseState,
  subscribeSupabaseState,
} from "./supabase";
import type { TesoreriaState } from "../types/tesoreria";

export const cloudBackendName = isSupabaseConfigured ? "Supabase" : "Firebase";

export const isCloudConfigured = isSupabaseConfigured || isFirebaseConfigured;

export const getCloudMissingConfig = () =>
  isSupabaseConfigured
    ? []
    : isFirebaseConfigured
      ? []
      : [
          ...getSupabaseMissingConfig(),
          ...getFirebaseMissingConfig(),
        ];

export const readRemoteState = async () => {
  if (!isSupabaseConfigured) return readFirebaseState();

  const supabaseState = await readSupabaseState();
  if (supabaseState) return supabaseState;

  const firebaseState = isFirebaseConfigured
    ? await readFirebaseState().catch(() => null)
    : null;

  if (firebaseState) {
    await saveSupabaseState(firebaseState, "migracion-firebase");
  }

  return firebaseState;
};

export const saveRemoteState = (state: TesoreriaState, updatedBy?: string) =>
  isSupabaseConfigured ? saveSupabaseState(state, updatedBy) : saveFirebaseState(state, updatedBy);

export const subscribeRemoteState = (
  onData: (state: TesoreriaState | null) => void,
  onError: (message: string) => void,
) => (
  isSupabaseConfigured
    ? subscribeSupabaseState(onData, onError)
    : subscribeFirebaseState(onData, onError)
);
