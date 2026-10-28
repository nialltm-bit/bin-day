import { defineConfig } from "vite";

// GitHub Pages serves the site from /bin-day/.
export default defineConfig({
  base: "/bin-day/",
  build: {
    rollupOptions: {
      input: {
        main: new URL("./index.html", import.meta.url).pathname,
        privacy: new URL("./privacy.html", import.meta.url).pathname,
        poc: new URL("./poc.html", import.meta.url).pathname,
        subscribeTest: new URL("./subscribe-test.html", import.meta.url).pathname,
      },
    },
  },
});
