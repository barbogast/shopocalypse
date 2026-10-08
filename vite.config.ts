import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Read by app/version.ts
  define: {
    __COMMIT_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? ""),
    __COMMIT_MESSAGE__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").split("\n")[0]),
  },
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
});
