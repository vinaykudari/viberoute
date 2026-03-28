import {
  PlannerChatRequestSchema,
  PlannerChatResponseSchema,
} from "@viberoute/shared";
import { NextResponse } from "next/server";

const SERVER_BASE_URL =
  process.env.VIBEROUTE_SERVER_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

export async function POST(request: Request) {
  const body = await request.json();
  const parsedRequest = PlannerChatRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        error: "Invalid planner chat payload.",
        issues: parsedRequest.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`${SERVER_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedRequest.data),
      cache: "no-store",
      signal: request.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            typeof payload?.detail === "string"
              ? payload.detail
              : "Planner server request failed.",
        },
        { status: response.status },
      );
    }

    const parsedResponse = PlannerChatResponseSchema.safeParse(payload);
    if (!parsedResponse.success) {
      return NextResponse.json(
        {
          error: "Planner server returned an invalid response.",
          issues: parsedResponse.error.flatten(),
        },
        { status: 502 },
      );
    }

    return NextResponse.json(parsedResponse.data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown planner proxy error";
    return NextResponse.json(
      {
        error: `Couldn't reach the planner server: ${message}`,
      },
      { status: 502 },
    );
  }
}
