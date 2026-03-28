"use client";

import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  type Session,
} from "@google/genai";
import { useEffect, useRef, useState, startTransition } from "react";
import { LiveAudioPlayer } from "./live-audio-player";

export type TourAudioState = {
  status:
    | "idle"
    | "connecting"
    | "streaming"
    | "ready"
    | "muted"
    | "unsupported"
    | "error";
  isMuted: boolean;
  voiceLabel: string | null;
  error: string | null;
  transcript: string;
  usedLiveAudio: boolean;
  prime: () => void;
  replay: () => void;
  toggleMuted: () => void;
  stop: () => void;
};

type LiveTokenResponse = {
  token: string;
  model: string;
  voiceName: string;
};

type LiveTokenErrorResponse = {
  error?: string;
};

function buildSpeechPrompt(line: string) {
  return [
    "Speak this as a warm, natural live guide in the passenger seat.",
    "Keep the delivery cinematic but conversational, with gentle forward momentum.",
    "Stay faithful to the wording and do not add extra questions or extra sentences.",
    `Line: ${line.trim()}`,
  ].join("\n");
}

function isNormalClose(code?: number) {
  return code === 1000;
}

export function useTourAudio(options: {
  enabled: boolean;
  text: string;
  utteranceKey: string | null;
}): TourAudioState {
  const { enabled, text, utteranceKey } = options;
  const [status, setStatus] = useState<TourAudioState["status"]>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [voiceLabel, setVoiceLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [usedLiveAudio, setUsedLiveAudio] = useState(false);
  const lastCompletedKeyRef = useRef<string | null>(null);
  const wasEnabledRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const playerRef = useRef<LiveAudioPlayer | null>(null);
  const connectionRunIdRef = useRef(0);
  const activeTurnKeyRef = useRef<string | null>(null);
  const queuedTurnRef = useRef<{ key: string; line: string } | null>(null);

  const canStream =
    typeof window !== "undefined" &&
    "AudioContext" in window &&
    typeof window.WebSocket !== "undefined";
  const prime = () => {
    if (!canStream) {
      return;
    }

    if (!playerRef.current) {
      playerRef.current = new LiveAudioPlayer();
    }

    void playerRef.current.prepare().catch(() => {
      // Ignore one-off resume failures; the streaming path will surface real errors.
    });
  };

  const resetStream = () => {
    connectionRunIdRef.current += 1;
    queuedTurnRef.current = null;
    activeTurnKeyRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    playerRef.current?.stop();
    startTransition(() => {
      setStatus(isMuted ? "muted" : "ready");
      setUsedLiveAudio(false);
      setTranscript("");
    });
  };

  const ensureSession = async () => {
    if (sessionRef.current) {
      return sessionRef.current;
    }

    startTransition(() => {
      setStatus("connecting");
      setError(null);
      setUsedLiveAudio(false);
    });

    const tokenResponse = await fetch("/api/navigation/live-token", {
      method: "POST",
      cache: "no-store",
    });
    const tokenPayload = (await tokenResponse.json().catch(() => null)) as
      | LiveTokenResponse
      | LiveTokenErrorResponse
      | null;

    if (!tokenResponse.ok || !tokenPayload || !("token" in tokenPayload)) {
      const errorMessage =
        tokenPayload &&
        "error" in tokenPayload &&
        typeof tokenPayload.error === "string"
          ? tokenPayload.error
          : "Gemini Live token provisioning failed.";
      throw new Error(errorMessage);
    }

    if (!playerRef.current) {
      playerRef.current = new LiveAudioPlayer();
    }
    await playerRef.current.prepare();

    setVoiceLabel(tokenPayload.voiceName ?? "Kore");
    const runId = connectionRunIdRef.current;
    const ai = new GoogleGenAI({
      apiKey: tokenPayload.token,
      apiVersion: "v1alpha",
    });

    const session = await ai.live.connect({
      model: tokenPayload.model,
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: tokenPayload.voiceName,
            },
          },
        },
      },
      callbacks: {
        onmessage: (message) => {
          if (connectionRunIdRef.current !== runId) {
            return;
          }

          const parts = message.serverContent?.modelTurn?.parts ?? [];
          for (const part of parts) {
            if (part.inlineData?.data) {
              void playerRef.current?.enqueue(part.inlineData.data);
              startTransition(() => {
                setStatus("streaming");
                setUsedLiveAudio(true);
              });
            }
          }

          const nextTranscript = message.serverContent?.outputTranscription?.text;
          if (nextTranscript) {
            startTransition(() => {
              setTranscript((current) => `${current}${nextTranscript}`);
            });
          }

          if (message.serverContent?.turnComplete) {
            lastCompletedKeyRef.current = activeTurnKeyRef.current;
            activeTurnKeyRef.current = null;
            startTransition(() => {
              setStatus(isMuted ? "muted" : "ready");
            });

            const queuedTurn = queuedTurnRef.current;
            queuedTurnRef.current = null;
            if (
              queuedTurn &&
              !isMuted &&
              connectionRunIdRef.current === runId
            ) {
              void sendTurn(queuedTurn.key, queuedTurn.line);
            }
          }
        },
        onerror: (liveError) => {
          if (connectionRunIdRef.current !== runId) {
            return;
          }
          startTransition(() => {
            setStatus("error");
            setError(liveError?.message ?? "Gemini Live streaming failed.");
          });
        },
        onclose: (event) => {
          if (sessionRef.current === session) {
            sessionRef.current = null;
          }
          activeTurnKeyRef.current = null;
          if (connectionRunIdRef.current !== runId || isNormalClose(event?.code)) {
            return;
          }
          startTransition(() => {
            setStatus("error");
            setError(event?.reason || "Gemini Live closed unexpectedly.");
          });
        },
      },
    });

    if (connectionRunIdRef.current !== runId) {
      session.close();
      throw new Error("Gemini Live session was superseded before it was ready.");
    }

    sessionRef.current = session;
    startTransition(() => {
      setStatus(isMuted ? "muted" : "ready");
    });
    return session;
  };

  const sendTurn = async (key: string, line: string) => {
    if (!canStream || isMuted || !line.trim()) {
      return;
    }
    const turnKey = `${key}:${line.trim()}`;

    if (activeTurnKeyRef.current) {
      queuedTurnRef.current = { key, line };
      return;
    }

    if (lastCompletedKeyRef.current === turnKey) {
      return;
    }

    const session = await ensureSession();
    if (activeTurnKeyRef.current) {
      queuedTurnRef.current = { key, line };
      return;
    }

    activeTurnKeyRef.current = turnKey;
    queuedTurnRef.current = null;
    startTransition(() => {
      setTranscript(line.trim());
      setStatus("streaming");
      setError(null);
    });
    session.sendRealtimeInput({
      text: buildSpeechPrompt(line),
    });
  };

  useEffect(() => {
    if (!canStream) {
      setStatus("unsupported");
      setError("Streaming audio is not supported in this browser.");
      return;
    }

    return () => {
      resetStream();
    };
  }, [canStream]);

  useEffect(() => {
    if (!enabled) {
      wasEnabledRef.current = false;
      resetStream();
      return;
    }

    if (!utteranceKey || !text.trim()) {
      wasEnabledRef.current = true;
      return;
    }

    const justOpened = !wasEnabledRef.current;
    wasEnabledRef.current = true;

    if (isMuted) {
      setStatus("muted");
      return;
    }

    if (justOpened) {
      lastCompletedKeyRef.current = null;
    }

    void sendTurn(utteranceKey, text).catch((liveError: Error) => {
      startTransition(() => {
        setStatus("error");
        setError(liveError.message);
      });
    });
  }, [enabled, isMuted, text, utteranceKey]);

  return {
    status,
    isMuted,
    voiceLabel,
    error,
    transcript,
    usedLiveAudio,
    prime,
    replay: () => {
      if (!text.trim()) {
        return;
      }

      if (utteranceKey) {
        lastCompletedKeyRef.current = null;
        queuedTurnRef.current = { key: utteranceKey, line: text };
      }
    },
    toggleMuted: () => {
      setIsMuted((current) => {
        const nextMuted = !current;
        if (nextMuted) {
          resetStream();
        }
        if (!nextMuted) {
          lastCompletedKeyRef.current = null;
        }
        startTransition(() => {
          setStatus(nextMuted ? "muted" : "ready");
        });
        return nextMuted;
      });
    },
    stop: () => {
      resetStream();
    },
  };
}
