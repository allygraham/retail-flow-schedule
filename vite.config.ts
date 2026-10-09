import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
const uploadSentryMaps = !!(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);
const release = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.VITE_SENTRY_RELEASE;

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  define: { 'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(release ?? 'local') },
  build: { sourcemap: uploadSentryMaps ? 'hidden' : false },
  plugins: [react(), ...(uploadSentryMaps ? [sentryVitePlugin({
    org: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT, authToken: process.env.SENTRY_AUTH_TOKEN,
    release: { name: release, create: !!release }, telemetry: false,
    sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
  })] : [])],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
});
