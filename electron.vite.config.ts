import { resolve } from "path";
import { defineConfig } from "electron-vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    build: {
      sourcemap: false,
    },
  },
  preload: {
    build: {
      sourcemap: false,
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      sourcemap: false,
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
        output: {
          manualChunks: {
            "soniox-vendor": ["@soniox/speech-to-text-web"],
          },
        },
      },
    },
    plugins: [tailwindcss(), solid()],
  },
});
