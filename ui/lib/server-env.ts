import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ENV_PATH_CANDIDATES = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "..", "..", ".env"),
];

let cachedEnv: Record<string, string> | null = null;

function parseDotEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && value) {
      values[key] = value;
    }
  }

  return values;
}

function loadPreferredDotEnv(): Record<string, string> {
  if (cachedEnv) {
    return cachedEnv;
  }

  for (const candidatePath of ENV_PATH_CANDIDATES) {
    if (!existsSync(candidatePath)) {
      continue;
    }

    cachedEnv = parseDotEnvFile(readFileSync(candidatePath, "utf8"));
    return cachedEnv;
  }

  cachedEnv = {};
  return cachedEnv;
}

export function getPreferredServerEnv(name: string): string | undefined {
  const rootEnv = loadPreferredDotEnv();
  if (rootEnv[name]) {
    return rootEnv[name];
  }

  const processValue = process.env[name];
  return typeof processValue === "string" && processValue.trim()
    ? processValue.trim()
    : undefined;
}

export function getPreferredGoogleApiKey(): string | undefined {
  return (
    getPreferredServerEnv("GEMINI_API_KEY") ??
    getPreferredServerEnv("GOOGLE_API_KEY")
  );
}
