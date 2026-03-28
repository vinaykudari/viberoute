import { GoogleGenAI, Modality, ThinkingLevel } from "@google/genai";
import { NextResponse } from "next/server";

const LIVE_MODEL =
  process.env.VIBEROUTE_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";
const LIVE_VOICE = process.env.VIBEROUTE_LIVE_VOICE ?? "Kore";

export const runtime = "nodejs";

function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY.");
  }

  return apiKey;
}

export async function POST() {
  try {
    const client = new GoogleGenAI({
      apiKey: getApiKey(),
      apiVersion: "v1alpha",
    });

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        liveConnectConstraints: {
          model: LIVE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            outputAudioTranscription: {},
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.MINIMAL,
            },
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: LIVE_VOICE,
                },
              },
            },
          },
        },
      },
    });

    if (!token.name) {
      throw new Error("Gemini did not return an ephemeral token.");
    }

    return NextResponse.json({
      token: token.name,
      model: LIVE_MODEL,
      voiceName: LIVE_VOICE,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown live token error";
    return NextResponse.json(
      { error: `Couldn't create a Gemini Live token: ${message}` },
      { status: 500 },
    );
  }
}
