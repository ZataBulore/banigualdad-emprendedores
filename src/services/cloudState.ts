import {
  getFirebaseMissingConfig,
  isFirebaseConfigured,
  readRemoteState as readFirebaseState,
  saveRemoteState as saveFirebaseState,
  subscribeRemoteState as subscribeFirebaseState,
} from "./firebase";
import type { TesoreriaState } from "../types/tesoreria";

export const cloudBackendName = "Firebase";

export const isCloudConfigured = isFirebaseConfigured;

export const getCloudMissingConfig = () =>
  isFirebaseConfigured ? [] : getFirebaseMissingConfig();

export const readRemoteState = () => readFirebaseState();

export const saveRemoteState = (state: TesoreriaState, updatedBy?: string) => saveFirebaseState(state, updatedBy);

export const subscribeRemoteState = (
  onData: (state: TesoreriaState | null) => void,
  onError: (message: string) => void,
) => subscribeFirebaseState(onData, onError);
