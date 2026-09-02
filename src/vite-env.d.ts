/// <reference types="vite/client" />

declare module "@assets/*?url" {
  const src: string;
  export default src;
}

declare module "@assets/*" {
  const src: string;
  export default src;
}
