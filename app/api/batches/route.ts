import { NextRequest, NextResponse } from "next/server";

const MAX_IMPORT_VIDEOS = 500;

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ saved: false, reason: "supabase_not_configured" }, { status: 202 });
  }

  const body = await request.json().catch(() => null) as null | {
    sourceUrl?: string;
    requestedCount?: number;
    importedCount?: number;
    platform?: "instagram" | "facebook";
  };
  const sourceUrl = body?.sourceUrl?.trim() || "";
  const requestedCount = Math.min(MAX_IMPORT_VIDEOS, Math.max(1, Number(body?.requestedCount) || 1));
  const importedCount = Math.min(requestedCount, Math.max(0, Number(body?.importedCount) || 0));
  if (!/^https:\/\//i.test(sourceUrl) || !["instagram", "facebook"].includes(body?.platform || "")) {
    return NextResponse.json({ error: "Lote inválido." }, { status: 400 });
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/video_batches`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "content-type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      source_url: sourceUrl,
      platform: body!.platform,
      requested_count: requestedCount,
      imported_count: importedCount,
      status: "imported",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.warn("Supabase batch log failed", response.status, detail.slice(0, 300));
    return NextResponse.json({ saved: false, reason: "table_unavailable" }, { status: 202 });
  }
  return NextResponse.json({ saved: true });
}
