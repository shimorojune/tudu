/**
 * An app connecting to Tudu (OAuth) sends you to sign in with its request signed onto the address. It is read once,
 * as the page loads, before the router tidies the address: after the code, the sign-in carries it on, and the API
 * answers where to go next (the consent page, or straight back to the app).
 */
export const OAUTH_QUERY: string | null =
  typeof window !== 'undefined' &&
  window.location.pathname === '/sign-in' &&
  new URLSearchParams(window.location.search).has('sig')
    ? window.location.search.slice(1)
    : null;
