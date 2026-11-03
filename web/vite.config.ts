import { defineConfig } from "vite";

const page = (file: string) => new URL(file, import.meta.url).pathname;

// GitHub Pages serves the site from /bin-day/. The e2e workflows find the homepage's script as assets/main-*.js, so
// the homepage entry keeps the name "main".
export default defineConfig({
  base: "/bin-day/",
  build: {
    rollupOptions: {
      input: { main: page("./index.html"), coverage: page("./coverage.html"), privacy: page("./privacy.html") },
    },
  },
});
