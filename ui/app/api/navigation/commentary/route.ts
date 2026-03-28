import {
  NavigationCommentaryRequestSchema,
  NavigationCommentaryResponseSchema,
} from "@viberoute/shared";
import { NextResponse } from "next/server";

const SERVER_BASE_URL =
  process.env.VIBEROUTE_SERVER_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

export async function POST(request: Request) {
  const body = await request.json();
  const parsedRequest = NavigationCommentaryRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        error: "Invalid navigation commentary payload.",
        issues: parsedRequest.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`${SERVER_BASE_URL}/api/navigation/commentary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedRequest.data),
      cache: "no-store",
      signal: request.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            typeof payload?.detail === "string"
              ? payload.detail
              : "Navigation commentary request failed.",
        },
        { status: response.status },
      );
    }

    const parsedResponse = NavigationCommentaryResponseSchema.safeParse(payload);
    if (!parsedResponse.success) {
      return NextResponse.json(
        {
          error: "Navigation commentary response validation failed.",
          issues: parsedResponse.error.flatten(),
        },
        { status: 502 },
      );
    }

    return NextResponse.json(parsedResponse.data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown navigation commentary error";
    return NextResponse.json(
      {
        error: `Couldn't reach the navigation commentary service: ${message}`,
      },
      { status: 502 },
    );
  }
}
