import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";

let _client: GoogleGenAI | null = null;
let _cachedKey: string | undefined;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY or GOOGLE_API_KEY environment variable.",
    );
  }

  // Re-create client if the key changed (e.g. after editing .env)
  if (_client && _cachedKey === apiKey) return _client;

  _client = new GoogleGenAI({ apiKey });
  _cachedKey = apiKey;
  return _client;
}

export function getModelName(): string {
  return process.env.VIBEROUTE_MODEL ?? DEFAULT_MODEL;
}

