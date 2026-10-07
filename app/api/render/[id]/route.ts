import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const key = process.env.SHOTSTACK_API_KEY;
  if (!key) return NextResponse.json({ error: "O renderizador ainda não está conectado." }, { status: 503 });
  const { id } = await context.params;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return NextResponse.json({ error: "Renderização inválida." }, { status: 400 });

  const response = await fetch(`https://api.shotstack.io/edit/stage/render/${id}`, {
    headers: { "x-api-key": key },
  });
  const payload = await response.json() as { response?: { status?: string; url?: string; error?: string }; message?: string };
  if (!response.ok) return NextResponse.json({ error: payload.message || "Falha ao consultar renderização." }, { status: 502 });
  return NextResponse.json({
    status: payload.response?.status || "unknown",
    url: payload.response?.url || null,
    error: payload.response?.error || null,
  });
}
