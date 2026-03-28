"use client";

import {
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
  type ThreadMessage,
} from "@assistant-ui/react";
import {
  PlannerChatStreamEventSchema,
  PlannerChatResponseSchema,
  PlannerChatStateDeltaSchema,
  type PlannerChatImage,
  type PlannerChatResponse,
  type PlannerChatStateDelta,
} from "@viberoute/shared";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import type { PlannerUiState } from "@/lib/planner-state";

function extractUserText(message: ThreadMessage): string {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n");
}

function extractMessageImages(message: ThreadMessage): PlannerChatImage[] {
  const images: PlannerChatImage[] = [];
  const seen = new Set<string>();

  for (const part of message.content) {
    if (part.type !== "image") {
      continue;
    }
    if (seen.has(part.image)) {
      continue;
    }
    seen.add(part.image);
    images.push({
      dataUrl: part.image,
      filename: part.filename,
      mimeType: part.image.startsWith("data:")
        ? part.image.slice(5, part.image.indexOf(";"))
        : undefined,
    });
  }

  for (const attachment of message.attachments ?? []) {
    for (const part of attachment.content ?? []) {
      if (part.type !== "image") {
        continue;
      }
      if (seen.has(part.image)) {
        continue;
      }
      seen.add(part.image);
      images.push({
        dataUrl: part.image,
        filename: attachment.name,
        mimeType: attachment.contentType,
      });
    }
  }

  return images;
}

function mergeImages(
  existing: PlannerChatImage[],
  incoming: PlannerChatImage[],
): PlannerChatImage[] {
  const merged = [...existing];
  const seen = new Set(existing.map((image) => image.dataUrl));

  for (const image of incoming) {
    if (seen.has(image.dataUrl)) {
      continue;
    }
    seen.add(image.dataUrl);
    merged.push(image);
  }

  return merged.slice(-6);
}

function createPlannerAdapter(options: {
  getPlannerState: () => PlannerUiState;
  getUploadedImages: () => PlannerChatImage[];
  setUploadedImages: (images: PlannerChatImage[]) => void;
  onCommittedImages: (images: PlannerChatImage[]) => void;
  onPlannerStateDelta: (delta: PlannerChatStateDelta) => void;
  onPlannerResponse: (
    response: PlannerChatResponse,
    images: PlannerChatImage[],
  ) => void;
  onReasoning: (text: string | null) => void;
}): ChatModelAdapter {
  return {
    run({ messages, abortSignal }) {
      const lastUserMessage = [...messages]
        .reverse()
        .find((message) => message.role === "user");

      if (!lastUserMessage) {
        return Promise.resolve({ content: [] });
      }

      const newImages = extractMessageImages(lastUserMessage);
      const allImages = mergeImages(options.getUploadedImages(), newImages);
      options.setUploadedImages(allImages);
      options.onCommittedImages(allImages);

      const plannerState = options.getPlannerState();

      options.onReasoning(null);

      return streamPlannerRun({
        abortSignal,
        body: {
          message: extractUserText(lastUserMessage),
          images: allImages,
          newImages,
          preferences: plannerState.preferences,
          interpretedVibe: plannerState.interpretedVibe,
          scenes: plannerState.scenes,
          plan: plannerState.plan,
          pendingFields: plannerState.pendingFields,
        },
        images: allImages,
        onPlannerStateDelta: options.onPlannerStateDelta,
        onPlannerResponse: options.onPlannerResponse,
        onReasoning: options.onReasoning,
      });
    },
  };
}

async function* streamPlannerRun(options: {
  abortSignal: AbortSignal;
  body: Record<string, unknown>;
  images: PlannerChatImage[];
  onPlannerStateDelta: (delta: PlannerChatStateDelta) => void;
  onPlannerResponse: (
    response: PlannerChatResponse,
    images: PlannerChatImage[],
  ) => void;
  onReasoning: (text: string | null) => void;
}): AsyncGenerator<ChatModelRunResult, void> {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options.body),
    signal: options.abortSignal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `Chat request failed: ${response.status}`,
    );
  }

  if (!response.body) {
    throw new Error("Planner stream response body was empty.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const reasoningSteps: string[] = [];

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line) {
        const parsedLine = PlannerChatStreamEventSchema.safeParse(JSON.parse(line));
        if (!parsedLine.success) {
          throw new Error("Planner stream event validation failed.");
        }

        const event = parsedLine.data;
        if (event.type === "reasoning") {
          reasoningSteps.push(event.text);
          const reasoningText = reasoningSteps.join("\n");
          options.onReasoning(reasoningText);
          yield {
            content: [
              {
                type: "reasoning",
                text: reasoningText,
                parentId: "planner-run",
              },
            ],
          };
        }

        if (event.type === "state") {
          const parsedDelta = PlannerChatStateDeltaSchema.safeParse(event.state);
          if (!parsedDelta.success) {
            throw new Error("Planner state delta validation failed.");
          }
          options.onPlannerStateDelta(parsedDelta.data);
        }

        if (event.type === "response") {
          const parsedResponse = PlannerChatResponseSchema.safeParse(event.response);
          if (!parsedResponse.success) {
            throw new Error("Planner response validation failed.");
          }

          options.onReasoning(null);
          options.onPlannerResponse(parsedResponse.data, options.images);

          yield {
            content: [
              ...(reasoningSteps.length
                ? [
                    {
                      type: "reasoning" as const,
                      text: reasoningSteps.join("\n"),
                      parentId: "planner-run",
                    },
                  ]
                : []),
              {
                type: "text" as const,
                text: parsedResponse.data.agentReply,
              },
            ],
            status: { type: "complete", reason: "stop" },
          };
          return;
        }

        if (event.type === "error") {
          throw new Error(event.error);
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }

    if (done) {
      break;
    }
  }

  throw new Error("Planner stream ended before a final response arrived.");
}

export function AssistantRuntimeShell({
  plannerState,
  onCommittedImages,
  onPlannerStateDelta,
  onPlannerResponse,
  onReasoning,
  children,
}: Readonly<{
  plannerState: PlannerUiState;
  onCommittedImages: (images: PlannerChatImage[]) => void;
  onPlannerStateDelta: (delta: PlannerChatStateDelta) => void;
  onPlannerResponse: (
    response: PlannerChatResponse,
    images: PlannerChatImage[],
  ) => void;
  onReasoning: (text: string | null) => void;
  children: ReactNode;
}>) {
  const plannerStateRef = useRef(plannerState);
  const uploadedImagesRef = useRef<PlannerChatImage[]>(plannerState.images);

  useEffect(() => {
    plannerStateRef.current = plannerState;
    uploadedImagesRef.current = plannerState.images;
  }, [plannerState]);

  const attachmentAdapter = useMemo(() => new SimpleImageAttachmentAdapter(), []);
  const adapter = useMemo(
    () =>
      createPlannerAdapter({
        getPlannerState: () => plannerStateRef.current,
        getUploadedImages: () => uploadedImagesRef.current,
        setUploadedImages: (images) => {
          uploadedImagesRef.current = images;
        },
        onCommittedImages,
        onPlannerStateDelta,
        onPlannerResponse,
        onReasoning,
      }),
    [onCommittedImages, onPlannerResponse, onPlannerStateDelta, onReasoning],
  );

  const runtime = useLocalRuntime(adapter, {
    adapters: {
      attachments: attachmentAdapter,
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
