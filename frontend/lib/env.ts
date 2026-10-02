// Server env vars with no safe default. instrumentation.ts checks them all at startup.
export const REQUIRED_ENV = [
  "FILMS_DB_PATH",
  "RESULTS_DIR",
  "UPLOAD_DIR",
  "SCRIPTS_DIR",
  "PYTHON_ENV",
  "KALMUS_SCRIPT",
  "EMAIL_SCRIPT",
  "WEBSITE_URL",
  "OMDB_KEY",
] as const;

export function missingEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

export function requireEnv(name: (typeof REQUIRED_ENV)[number]): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} (see .env.local.example)`);
  return value;
}
