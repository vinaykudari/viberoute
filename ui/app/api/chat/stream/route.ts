import { PlannerChatRequestSchema } from "@viberoute/shared";
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
    const response = await fetch(`${SERVER_BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedRequest.data),
      cache: "no-store",
      signal: request.signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return NextResponse.json(
        {
          error:
            typeof payload?.detail === "string"
              ? payload.detail
              : "Planner server stream request failed.",
        },
        { status: response.status },
      );
    }

    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      },
    });
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
