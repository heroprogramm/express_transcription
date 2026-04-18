import { resolve } from "path";
import { defineConfig } from "electron-vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    define: {
      __GH_TOKEN__: JSON.stringify(process.env.GH_TOKEN ?? ""),
    },
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
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src"),
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
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
