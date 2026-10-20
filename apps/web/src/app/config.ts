/** Where the API lives: the build sets VITE_API_URL; a dev build falls back to the local server. */
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3456';
