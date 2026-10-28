/** Lets the bundle test read the built script as text (Vite's `?raw` import). */
declare module "*?raw" {
  const content: string;
  export default content;
}
