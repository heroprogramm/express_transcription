import { resolve } from "path";
import { defineConfig } from "electron-vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    build: {
      sourcemap: false,
      minify: "esbuild",
      target: "node22",
    },
  },
  preload: {
    build: {
      sourcemap: false,
      minify: "esbuild",
      target: "node22",
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      sourcemap: false,
      minify: "esbuild",
      target: "chrome130",
      // Never inline fonts as data URIs — they must be served as files
      assetsInlineLimit: 0,
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
        output: {
          // Isolate large stable dependencies into their own chunks for better caching
          manualChunks: (id: string) => {
            if (id.includes("@soniox/")) return "soniox";
            if (id.includes("solid-js")) return "solid";
          },
        },
      },
    },
    plugins: [tailwindcss(), solid()],
  },
});
