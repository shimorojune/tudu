import {
  baseApi,
  resetSync,
  stopSync,
  type AppDispatch,
} from "@tudu/store";
import { authClient, clearStoredAuthToken } from "@/lib/authClient";

export async function signOut(dispatch: AppDispatch) {
  await authClient.signOut();
  clearStoredAuthToken();
  dispatch(stopSync());
  dispatch(resetSync());
  dispatch(baseApi.util.resetApiState());
}
