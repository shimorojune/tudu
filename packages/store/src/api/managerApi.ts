import { baseApi } from "./baseApi.js";

/** Legacy manager REST endpoints removed in orgs PR1. Sync hooks own task data. */
export const managerApi = baseApi.injectEndpoints({
  endpoints: () => ({}),
});
