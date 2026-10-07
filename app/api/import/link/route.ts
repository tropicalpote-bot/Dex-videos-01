import { NextRequest, NextResponse } from "next/server";

type Platform = "instagram" | "facebook";
type UnknownRecord = Record<string, unknown>;
const MAX_IMPORT_VIDEOS = 500;

function identifyPlatform(value: string): Platform | null {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
    if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch") return "facebook";
  } catch {}
  return null;
}

function findVideoUrl(value: unknown, path = ""): string | null {
  if (typeof value === "string") {
    const isUrl = /^https:\/\//i.test(value);
    const looksLikeVideo = /video/i.test(path) || /\.mp4(?:\?|$)/i.test(value);
    const isThumbnail = /thumb|image|display/i.test(path);
    return isUrl && looksLikeVideo && !isThumbnail ? value : null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const result = findVideoUrl(value[index], `${path}.${index}`);
      if (result) return result;
    }
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as UnknownRecord)) {
      const result = findVideoUrl(child, `${path}.${key}`);
      if (result) return result;
    }
  }
  return null;
}

function firstText(item: UnknownRecord, keys: string[]) {
  for (const key of keys) if (typeof item[key] === "string" && item[key]) return String(item[key]);
  return "";
}

function normalize(items: UnknownRecord[], platform: Platform) {
  const seen = new Set<string>();
  return items.flatMap((item, index) => {
    const url = firstText(item, ["videoUrl", "videoHdUrl", "videoSdUrl", "video_url", "video_url_hd"]) || findVideoUrl(item);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const caption = firstText(item, ["caption", "text", "title", "description"]);
    const id = firstText(item, ["id", "postId", "shortCode", "shortcode"]) || `${platform}-${index + 1}`;
    const permalink = firstText(item, ["url", "permalinkUrl", "postUrl", "inputUrl"]);
    const thumbnailUrl = firstText(item, ["displayUrl", "thumbnailUrl", "imageUrl"]);
    return [{ id, name: caption.split("\n")[0].slice(0, 60) || `Vídeo ${index + 1}`, url, permalink: permalink || null, thumbnailUrl: thumbnailUrl || null, platform }];
  });
}

export async function POST(request: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "O importador de links ainda não está conectado." }, { status: 503 });
  const body = await request.json().catch(() => null) as null | { url?: string; limit?: number };
  const targetUrl = body?.url?.trim() || "";
  const platform = identifyPlatform(targetUrl);
  if (!platform) return NextResponse.json({ error: "Cole um link público válido do Instagram ou Facebook." }, { status: 400 });
  const limit = Math.min(MAX_IMPORT_VIDEOS, Math.max(1, Number(body?.limit) || 20));
  const actorId = platform === "instagram" ? "apify~instagram-scraper" : "crawlerbros~facebook-posts-scraper";
  const input = platform === "instagram"
    ? { directUrls: [targetUrl], resultsType: "posts", resultsLimit: limit, addParentData: false }
    : { startUrls: [{ url: targetUrl }], maxItems: limit, maxPosts: limit, resultsLimit: limit };
  const response = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as { data?: { id?: string; defaultDatasetId?: string }; error?: { message?: string } };
  if (!response.ok || !payload.data?.id || !payload.data.defaultDatasetId) {
    return NextResponse.json({ error: payload.error?.message || "A busca não pôde ser iniciada." }, { status: 502 });
  }
  return NextResponse.json({ runId: payload.data.id, datasetId: payload.data.defaultDatasetId, platform, limit });
}

export async function GET(request: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "O importador de links ainda não está conectado." }, { status: 503 });
  const runId = request.nextUrl.searchParams.get("runId") || "";
  const datasetId = request.nextUrl.searchParams.get("datasetId") || "";
  const platform = request.nextUrl.searchParams.get("platform") as Platform;
  const limit = Math.min(MAX_IMPORT_VIDEOS, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 20));
  if (!/^[a-zA-Z0-9_-]+$/.test(runId) || !/^[a-zA-Z0-9_-]+$/.test(datasetId) || !["instagram", "facebook"].includes(platform)) {
    return NextResponse.json({ error: "Consulta inválida." }, { status: 400 });
  }
  const runResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers: { Authorization: `Bearer ${token}` } });
  const runPayload = await runResponse.json() as { data?: { status?: string; defaultDatasetId?: string }; error?: { message?: string } };
  if (!runResponse.ok) return NextResponse.json({ error: runPayload.error?.message || "Falha ao consultar a busca." }, { status: 502 });
  if (runPayload.data?.defaultDatasetId !== datasetId) return NextResponse.json({ error: "Resultado inválido." }, { status: 400 });
  const status = runPayload.data?.status || "RUNNING";
  if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) return NextResponse.json({ status, error: "A plataforma não conseguiu ler esse link público." }, { status: 422 });
  if (status !== "SUCCEEDED") return NextResponse.json({ status });
  const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&limit=${limit}`, { headers: { Authorization: `Bearer ${token}` } });
  const items = await itemsResponse.json() as UnknownRecord[];
  if (!itemsResponse.ok || !Array.isArray(items)) return NextResponse.json({ error: "Não foi possível abrir o resultado da busca." }, { status: 502 });
  const videos = normalize(items, platform);
  return NextResponse.json({ status, videos, count: videos.length });
}
