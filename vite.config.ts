import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const webDemo = process.env.ZA3TAR_WEB_DEMO === "1";

/** The web demo (za3tar.ai/app) serves the laptop interface to whoever opens
 *  the link, phones included. A phone asked for `width=device-width` would
 *  squeeze a two-pane desktop layout into 375px and break it, so the demo
 *  build asks for a laptop-width viewport instead: the phone scales the whole
 *  thing down, and you can pinch into any part of it. The Mac app keeps the
 *  normal viewport. */
const webDemoViewport = {
  name: "za3tar-web-demo-viewport",
  transformIndexHtml(html: string) {
    return html.replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      '<meta name="viewport" content="width=1280" />',
    );
  },
};

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), ...(webDemo ? [webDemoViewport] : [])],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
