import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchPoiSlideshowImages } from "@/lib/navigation/poi-slideshow";

const PoiImagesRequestSchema = z.object({
  city: z.string().nullish(),
  placeName: z.string().min(1),
  title: z.string().nullish(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedRequest = PoiImagesRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        error: "Invalid POI image request.",
        issues: parsedRequest.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const images = await fetchPoiSlideshowImages(parsedRequest.data);
    return NextResponse.json(
      { images },
      {
        headers: {
          "cache-control": "s-maxage=1800, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown POI image error";
    return NextResponse.json(
      {
        error: `Couldn't load tour images: ${message}`,
      },
      { status: 502 },
    );
  }
}
