import { missingEnv } from "@/lib/env";

// Runs once when the Next.js server starts: refuse to boot with missing config.
export function register() {
  const missing = missingEnv();
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")} (see .env.local.example)`);
  }
}
