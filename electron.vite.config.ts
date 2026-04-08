import { resolve } from "path";
import { defineConfig } from "electron-vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: "src/renderer",
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
    plugins: [tailwindcss(), solid()],
  },
});
