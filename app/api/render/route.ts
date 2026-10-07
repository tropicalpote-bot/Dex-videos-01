import { NextRequest, NextResponse } from "next/server";

type RenderVideo = { id: string; url: string; name?: string };

function textClip(text: string, length: string, y: number, size: number, color: string, background?: string) {
  return {
    asset: {
      type: "rich-text",
      text,
      font: { family: "Open Sans", size, weight: 800, color },
      background: background ? { color: background, opacity: 0.9, wrap: true, padding: 18 } : undefined,
      align: { horizontal: "center", vertical: "middle" },
    },
    start: 0,
    length,
    width: 720,
    height: 220,
    fit: "none",
    position: "center",
    offset: { x: 0, y },
  };
}

export async function POST(request: NextRequest) {
  const key = process.env.SHOTSTACK_API_KEY;
  if (!key) return NextResponse.json({ error: "O renderizador ainda não está conectado." }, { status: 503 });

  const body = await request.json().catch(() => null) as null | {
    videos?: RenderVideo[];
    headline?: string;
    cta?: string;
    format?: "9:16" | "1:1" | "16:9";
    template?: string;
    stripMetadata?: boolean;
  };
  const videos = body?.videos?.filter((video) => video.id && /^https:\/\//.test(video.url)).slice(0, 10) || [];
  if (!videos.length) return NextResponse.json({ error: "Nenhum vídeo importado está pronto para renderizar." }, { status: 400 });

  const format = ["9:16", "1:1", "16:9"].includes(body?.format || "") ? body!.format! : "9:16";
  const headline = (body?.headline || "VOCÊ PRECISA VER ISSO").slice(0, 80);
  const cta = (body?.cta || "Siga para ver mais").slice(0, 60);
  const frame = body?.template === "news"
    ? { accent: "#16c79a", background: "#071b17", scale: 0.82, titleY: 0.39, titleSize: 48 }
    : body?.template === "clean"
      ? { accent: "#7c5cff", background: "#17132d", scale: 0.88, titleY: 0.4, titleSize: 42 }
      : { accent: "#ff5d2f", background: "#110b09", scale: 0.84, titleY: 0.39, titleSize: 54 };

  const jobs = await Promise.all(videos.map(async (video) => {
    const sourceLength = "alias://source";
    const edit = {
      timeline: {
        background: frame.background,
        tracks: [
          { clips: [textClip(headline, sourceLength, frame.titleY, frame.titleSize, "#ffffff", frame.background)] },
          { clips: [textClip(cta, sourceLength, -0.4, 30, "#ffffff", frame.accent)] },
          { clips: [{
            asset: { type: "video", src: video.url },
            start: 0,
            length: "auto",
            fit: "crop",
            scale: frame.scale,
            alias: "source",
          }] },
        ],
      },
      output: { format: "mp4", resolution: "hd", aspectRatio: format, quality: "medium" },
    };

    const response = await fetch("https://api.shotstack.io/edit/stage/render", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify(edit),
    });
    const payload = await response.json() as { response?: { id?: string }; message?: string };
    if (!response.ok || !payload.response?.id) {
      return { sourceId: video.id, name: video.name, error: payload.message || "Falha ao iniciar renderização." };
    }
    return { sourceId: video.id, name: video.name, renderId: payload.response.id };
  }));

  return NextResponse.json({ jobs });
}
