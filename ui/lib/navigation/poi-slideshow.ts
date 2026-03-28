import "server-only";

export type PoiSlideshowImage = {
  id: string;
  url: string;
  fullUrl?: string | null;
  alt: string;
  source: "upload" | "openverse" | "wikipedia";
  sourceLabel: string;
  pageUrl?: string | null;
  attribution?: string | null;
};

type OpenverseImageResult = {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  attribution?: string;
  foreign_landing_url?: string;
  width?: number;
  height?: number;
};

type WikipediaSearchPage = {
  key: string;
  title: string;
};

type WikipediaSummary = {
  originalimage?: { source?: string };
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
};

const REQUEST_HEADERS = {
  "user-agent": "VibeRoute/1.0 (tour slideshow)",
};

export async function fetchPoiSlideshowImages(options: {
  city?: string | null;
  placeName: string;
  title?: string | null;
  limit?: number;
}): Promise<PoiSlideshowImage[]> {
  const { city, placeName, title, limit = 5 } = options;
  const queries = uniqueQueries([
    `${placeName} ${city ?? ""}`.trim(),
    `${title ?? ""} ${city ?? ""}`.trim(),
    placeName,
    title ?? "",
  ]);

  const images: PoiSlideshowImage[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    if (images.length >= limit) {
      break;
    }

    const openverseImages = await fetchOpenverseImages(query, limit - images.length);
    for (const image of openverseImages) {
      if (seenUrls.has(image.url)) {
        continue;
      }

      seenUrls.add(image.url);
      images.push(image);
      if (images.length >= limit) {
        break;
      }
    }
  }

  if (images.length >= limit) {
    return images.slice(0, limit);
  }

  for (const query of queries) {
    if (images.length >= limit) {
      break;
    }

    const wikipediaImages = await fetchWikipediaImages(query, limit - images.length);
    for (const image of wikipediaImages) {
      if (seenUrls.has(image.url)) {
        continue;
      }

      seenUrls.add(image.url);
      images.push(image);
      if (images.length >= limit) {
        break;
      }
    }
  }

  return images.slice(0, limit);
}

async function fetchOpenverseImages(
  query: string,
  limit: number,
): Promise<PoiSlideshowImage[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("source", "wikimedia");
  url.searchParams.set("mature", "false");
  url.searchParams.set("page_size", String(Math.max(limit, 4)));
  url.searchParams.set("extension", "jpg,jpeg,png");

  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    next: { revalidate: 60 * 60 * 6 },
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { results?: OpenverseImageResult[] };
  return (payload.results ?? [])
    .filter(
      (image) =>
        Boolean(image.url) &&
        (image.width ?? 0) >= 640 &&
        (image.height ?? 0) >= 480,
    )
    .slice(0, limit)
    .map((image) => ({
      id: `openverse:${image.id}`,
      url: image.thumbnail || image.url,
      fullUrl: image.url,
      alt: image.title || query,
      source: "openverse",
      sourceLabel: "Openverse",
      pageUrl: image.foreign_landing_url ?? null,
      attribution: image.attribution ?? null,
    }));
}

async function fetchWikipediaImages(
  query: string,
  limit: number,
): Promise<PoiSlideshowImage[]> {
  const searchUrl = new URL("https://en.wikipedia.org/w/rest.php/v1/search/title");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("limit", String(Math.max(limit, 2)));

  const searchResponse = await fetch(searchUrl, {
    headers: REQUEST_HEADERS,
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!searchResponse.ok) {
    return [];
  }

  const searchPayload = (await searchResponse.json()) as { pages?: WikipediaSearchPage[] };
  const pages = searchPayload.pages ?? [];
  const imageResults: PoiSlideshowImage[] = [];

  for (const page of pages.slice(0, limit)) {
    const summaryResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`,
      {
        headers: REQUEST_HEADERS,
        next: { revalidate: 60 * 60 * 12 },
      },
    );
    if (!summaryResponse.ok) {
      continue;
    }

    const summary = (await summaryResponse.json()) as WikipediaSummary;
    const imageUrl =
      summary.originalimage?.source ?? summary.thumbnail?.source ?? null;
    if (!imageUrl) {
      continue;
    }

    imageResults.push({
      id: `wikipedia:${page.key}`,
      url: summary.thumbnail?.source ?? imageUrl,
      fullUrl: imageUrl,
      alt: page.title,
      source: "wikipedia",
      sourceLabel: "Wikipedia",
      pageUrl: summary.content_urls?.desktop?.page ?? null,
      attribution: page.title,
    });
  }

  return imageResults;
}

function uniqueQueries(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
