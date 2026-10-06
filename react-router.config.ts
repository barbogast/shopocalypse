import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  ssr: true,
  // Vercel's build output only on Vercel, so `yarn build && yarn start` keeps working locally
  presets: process.env.VERCEL ? [vercelPreset()] : [],
  future: {
    v8_middleware: true,
  },
} satisfies Config;
