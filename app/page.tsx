"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight, CalendarClock, Check, Clapperboard, CloudDownload, Download, FileVideo,
  Film, FolderOpen, Gauge, AtSign, Layers3, Link2, LoaderCircle, Menu,
  MoreHorizontal, Play, Plus, Settings2, ShieldCheck, Sparkles, Trash2, UploadCloud,
  WandSparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type VideoItem = { id: string; name: string; size: number; url: string; source: "upload" | "network"; platform?: "instagram" | "facebook"; permalink?: string | null };
type RenderDownload = { id: string; name: string; url: string };
type TemplateId = "headline" | "clean" | "news" | "custom";
type TemplateAsset = { name: string; url: string; type: "image" | "video" };
const MAX_IMPORT_VIDEOS = 500;
const quantityPresets = [20, 50, 100, 250, 500];
const templates: Array<{ id: TemplateId; name: string; description: string; accent: string }> = [
  { id: "headline", name: "Moldura impacto", description: "Título no topo e CTA fora do vídeo", accent: "#ff5d2f" },
  { id: "clean", name: "Moldura clean", description: "Conteúdo central, limpo e elegante", accent: "#7c5cff" },
  { id: "news", name: "Moldura notícia", description: "Faixas editoriais sem cobrir a cena", accent: "#16c79a" },
];

function formatBytes(bytes: number) {
  return bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

function TemplatePreview({ id }: { id: TemplateId }) {
  return <div className={`template-mini template-${id}`} aria-hidden="true">
    <div className="mini-sky" /><div className="mini-person" />
    {id === "headline" && <><b>VOCÊ PRECISA<br />VER ISSO</b><span>@seuperfil</span></>}
    {id === "clean" && <><i>DEX</i><span>Uma ideia por vez.</span></>}
    {id === "news" && <><em>AGORA</em><b>NOVIDADE<br />IMPORTANTE</b><span>Saiba mais →</span></>}
  </div>;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [template, setTemplate] = useState<TemplateId>("headline");
  const [headline, setHeadline] = useState("VOCÊ PRECISA VER ISSO");
  const [cta, setCta] = useState("Siga para ver mais");
  const [format, setFormat] = useState("9:16");
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [templateAsset, setTemplateAsset] = useState<TemplateAsset | null>(null);
  const [importing, setImporting] = useState(false);
  const [downloads, setDownloads] = useState<RenderDownload[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [importLimit, setImportLimit] = useState(20);
  const current = videos[0];
  const chosen = useMemo(() => templates.find((item) => item.id === template) ?? {
    id: "custom" as TemplateId, name: templateAsset?.name || "Meu template", description: "Template personalizado", accent: "#ff5d2f",
  }, [template, templateAsset]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (...args: unknown[]) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "configure_video_batch_template",
        title: "Configurar template do lote",
        description: "Escolhe um template e atualiza os textos visíveis do editor.",
        inputSchema: { type: "object", properties: {
          template: { type: "string", enum: ["headline", "clean", "news"] },
          headline: { type: "string", maxLength: 80 }, cta: { type: "string", maxLength: 60 },
        }, required: ["template"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input: unknown) {
          const value = input as { template?: TemplateId; headline?: string; cta?: string };
          if (!value || !["headline", "clean", "news"].includes(String(value.template))) throw new Error("Template inválido");
          setTemplate(value.template!);
          if (value.headline) setHeadline(value.headline.slice(0, 80));
          if (value.cta) setCta(value.cta.slice(0, 60));
          return { status: "configured", template: value.template };
        },
      }, { signal: controller.signal })).catch(() => undefined);
    } catch {}
    return () => controller.abort();
  }, []);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).filter((f) => f.type.startsWith("video/")).map((f) => ({
      id: `${f.name}-${f.lastModified}-${Math.random()}`, name: f.name, size: f.size, url: URL.createObjectURL(f), source: "upload" as const,
    }));
    if (!next.length) return setNotice("Escolha vídeos MP4, MOV ou WebM.");
    setVideos((old) => [...old, ...next]);
    setNotice(`${next.length} vídeo${next.length > 1 ? "s" : ""} adicionado${next.length > 1 ? "s" : ""}.`);
  }
  function removeVideo(id: string) {
    setVideos((old) => {
      const item = old.find((v) => v.id === id); if (item) URL.revokeObjectURL(item.url);
      return old.filter((v) => v.id !== id);
    });
  }
  function addTemplate(file: File | undefined) {
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type === "image/png" || file.type === "image/webp";
    if (!isVideo && !isImage) return setNotice("Envie um PNG, WebP ou MP4.");
    if (templateAsset) URL.revokeObjectURL(templateAsset.url);
    setTemplateAsset({ name: file.name, url: URL.createObjectURL(file), type: isVideo ? "video" : "image" });
    setTemplate("custom");
    setNotice("Template personalizado adicionado ao lote.");
  }
  async function importFromLink() {
    if (!sourceUrl.trim()) return setNotice("Cole o link de um perfil, Reel ou vídeo público.");
    setImporting(true); setNotice("Buscando vídeos no link informado...");
    try {
      const response = await fetch("/api/import/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: sourceUrl, limit: importLimit }) });
      const started = await response.json() as { runId?: string; datasetId?: string; platform?: "instagram" | "facebook"; limit?: number; error?: string };
      if (!response.ok || !started.runId || !started.datasetId || !started.platform) throw new Error(started.error || "Não foi possível iniciar a busca.");
      let imported: VideoItem[] = [];
      for (let attempt = 0; attempt < 90; attempt++) {
        if (attempt) await new Promise((resolve) => window.setTimeout(resolve, 2500));
        const query = new URLSearchParams({ runId: started.runId, datasetId: started.datasetId, platform: started.platform, limit: String(started.limit || importLimit) });
        const statusResponse = await fetch(`/api/import/link?${query}`, { cache: "no-store" });
        const result = await statusResponse.json() as { status?: string; videos?: Array<Omit<VideoItem, "size" | "source">>; error?: string };
        if (!statusResponse.ok) throw new Error(result.error || "Falha ao buscar os vídeos.");
        if (result.status === "SUCCEEDED") {
          imported = (result.videos || []).map((video) => ({ ...video, size: 0, source: "network" as const }));
          break;
        }
      }
      setVideos((old) => [...old.filter((item) => item.source === "upload"), ...imported]);
      if (imported.length) {
        void fetch("/api/batches", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceUrl,
            requestedCount: started.limit || importLimit,
            importedCount: imported.length,
            platform: started.platform,
          }),
        }).catch(() => undefined);
      }
      setNotice(imported.length ? `${imported.length} vídeo${imported.length === 1 ? " encontrado" : "s encontrados"}.` : "Nenhum vídeo público foi encontrado nesse link.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao buscar os vídeos do link.");
    } finally { setImporting(false); }
  }

  async function waitForRender(id: string, name: string) {
    for (let attempt = 0; attempt < 80; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      const response = await fetch(`/api/render/${id}`, { cache: "no-store" });
      const payload = await response.json() as { status?: string; url?: string; error?: string };
      if (payload.status === "done" && payload.url) return { id, name, url: payload.url };
      if (payload.status === "failed" || !response.ok) throw new Error(payload.error || `Falha ao renderizar ${name}.`);
    }
    throw new Error(`A renderização de ${name} continua em andamento.`);
  }

  async function startBatch() {
    if (!videos.length) { setNotice("Adicione pelo menos um vídeo."); inputRef.current?.click(); return; }
    const remote = videos.filter((video) => video.source === "network");
    if (!remote.length) return setNotice("Cole um link público e busque os vídeos antes de exportar.");
    setProcessing(true); setProgress(8); setNotice(null); setDownloads([]);
    try {
      const jobs: Array<{ renderId?: string; name?: string; error?: string }> = [];
      for (let index = 0; index < remote.length; index += 10) {
        const response = await fetch("/api/render", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ videos: remote.slice(index, index + 10), headline, cta, format, template, stripMetadata: true }) });
        const payload = await response.json() as { jobs?: Array<{ renderId?: string; name?: string; error?: string }>; error?: string };
        if (!response.ok) throw new Error(payload.error || "Não foi possível iniciar a renderização.");
        jobs.push(...(payload.jobs || []));
        setProgress(Math.min(18, 8 + Math.round(((index + 10) / remote.length) * 10)));
      }
      const validJobs = jobs.filter((job) => job.renderId);
      if (!validJobs.length) throw new Error(jobs[0]?.error || "O Shotstack recusou o lote.");
      setProgress(18);
      const ready: RenderDownload[] = [];
      for (let index = 0; index < validJobs.length; index += 5) {
        const group = await Promise.all(validJobs.slice(index, index + 5).map((job) => waitForRender(job.renderId!, job.name || "Vídeo")));
        ready.push(...group);
        setProgress(18 + Math.round((ready.length / validJobs.length) * 82));
      }
      setDownloads(ready); setProgress(100); setNotice(`${ready.length} vídeo${ready.length === 1 ? " pronto" : "s prontos"} para baixar.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao processar o lote.");
    } finally { setProcessing(false); }
  }

  return <main className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="brand"><span><Film /></span><strong>DeX <b>Vídeo</b></strong><button className="close-mobile" onClick={() => setMobileOpen(false)}><X /></button></div>
      <nav><p>PRODUÇÃO</p><a className="active" href="#editor"><Clapperboard /> Novo lote</a><a href="#arquivos"><FolderOpen /> Meus vídeos <span>{videos.length}</span></a><a href="#templates"><Layers3 /> Templates</a><p>CONTA</p><a href="#conexoes"><Link2 /> Conexões</a><a href="#configuracoes"><Settings2 /> Configurações</a></nav>
      <div className="plan-card"><div><Sparkles /> IMPORTAÇÃO EM MASSA</div><strong>Até {MAX_IMPORT_VIDEOS} vídeos por busca</strong><Progress value={(importLimit / MAX_IMPORT_VIDEOS) * 100} /><button>{importLimit} selecionados</button></div>
      <div className="profile"><span>EP</span><div><strong>Everton</strong><small>Administrador</small></div><MoreHorizontal /></div>
    </aside>

    <section className="workspace" id="editor">
      <header className="topbar">
        <div><button className="menu-button" onClick={() => setMobileOpen(true)}><Menu /></button><p>NOVO LOTE</p><h1>Editor em massa</h1></div>
        <div className="top-actions">
          <Dialog><DialogTrigger asChild><Button variant="outline" className="connect-button"><Link2 /> Conexões</Button></DialogTrigger>
            <DialogContent className="connections-dialog"><DialogHeader><DialogTitle>Conectar serviços</DialogTitle><DialogDescription>Estas conexões liberam a importação e a exportação dos vídeos.</DialogDescription></DialogHeader>
              <div className="connection-list">
                <a href="https://console.apify.com/" target="_blank"><span className="connection-icon meta">A</span><div><strong>Apify — links públicos</strong><small>Importa perfis, Reels e vídeos públicos.</small></div><ArrowUpRight /></a>
                <a href="https://shotstack.io/" target="_blank"><span className="connection-icon render"><WandSparkles /></span><div><strong>Motor de renderização</strong><small>Processa templates e exporta o lote.</small></div><ArrowUpRight /></a>
                <a href="https://developers.facebook.com/apps/" target="_blank"><span className="connection-icon meta">∞</span><div><strong>Meta — publicação</strong><small>Necessária somente para programar Instagram e Facebook.</small></div><ArrowUpRight /></a>
                <a href="https://supabase.com/dashboard/" target="_blank"><span className="connection-icon storage">S</span><div><strong>Supabase</strong><small>Login, banco e armazenamento.</small></div><ArrowUpRight /></a>
              </div>
            </DialogContent>
          </Dialog>
          <Button className="primary-action" onClick={startBatch} disabled={processing}>{processing ? <LoaderCircle className="spin" /> : <Play fill="currentColor" />} {processing ? "Preparando..." : "Criar lote"}</Button>
        </div>
      </header>

      <div className="stepper"><div className="current"><span>1</span><b>Vídeos</b><small>Importe o conteúdo</small></div><i /><div className={videos.length ? "current" : ""}><span>2</span><b>Template</b><small>Escolha o visual</small></div><i /><div className={progress ? "current" : ""}><span>3</span><b>Exportar</b><small>Processe o lote</small></div></div>

      <div className="editor-grid">
        <section className="panel source-panel" id="arquivos">
          <div className="panel-heading"><div><span>01</span><h2>Adicione seus vídeos</h2></div><small>{videos.length} arquivo{videos.length === 1 ? "" : "s"}</small></div>
          <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          <button className="dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            <span><UploadCloud /></span><strong>Solte seus vídeos aqui</strong><small>MP4, MOV e WebM</small><em><Plus /> Selecionar arquivos</em>
          </button>
          <div className="divider"><span>OU COLE UM LINK PÚBLICO</span></div>
          <div className="link-importer">
            <label><Link2 /><input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Link do perfil, Reel ou vídeo" inputMode="url" /></label>
            <div><label className="quantity-field"><span>Quantidade</span><input aria-label="Quantidade de vídeos" type="number" min={1} max={MAX_IMPORT_VIDEOS} value={importLimit} onChange={(event) => setImportLimit(Math.min(MAX_IMPORT_VIDEOS, Math.max(1, Number(event.target.value) || 1)))} /></label><button onClick={importFromLink} disabled={importing}>{importing ? <LoaderCircle className="spin" /> : <AtSign />} {importing ? `Buscando até ${importLimit}...` : `Buscar ${importLimit} vídeos`}</button></div>
            <div className="quantity-presets" aria-label="Atalhos de quantidade">{quantityPresets.map((amount) => <button key={amount} type="button" className={importLimit === amount ? "selected" : ""} onClick={() => setImportLimit(amount)}>{amount}</button>)}</div>
            <small>Escolha de 1 a {MAX_IMPORT_VIDEOS} · Instagram ou Facebook · somente conteúdo público</small>
          </div>
          {!!videos.length && <div className="file-list">{videos.map((video, index) => <div key={video.id}><span className="file-icon"><FileVideo /></span><div><strong>{video.name}</strong><small>{video.source === "network" ? (video.platform === "facebook" ? "Facebook" : "Instagram") : formatBytes(video.size)} · vídeo {index + 1}</small></div><button onClick={() => removeVideo(video.id)}><Trash2 /></button></div>)}</div>}
        </section>

        <section className="panel template-panel" id="templates">
          <div className="panel-heading"><div><span>02</span><h2>Escolha um template</h2></div></div>
          <input ref={templateInputRef} type="file" accept="image/png,image/webp,video/mp4" hidden onChange={(e) => addTemplate(e.target.files?.[0])} />
          <div className="template-grid">{templates.map((item) => <button key={item.id} className={template === item.id ? "selected" : ""} onClick={() => setTemplate(item.id)}><TemplatePreview id={item.id} /><span className="check"><Check /></span><strong>{item.name}</strong><small>{item.description}</small></button>)}</div>
          <button className={`custom-template ${template === "custom" ? "selected" : ""}`} onClick={() => templateAsset ? setTemplate("custom") : templateInputRef.current?.click()}>
            <span>{templateAsset ? (templateAsset.type === "image" ? <img src={templateAsset.url} alt="" /> : <video src={templateAsset.url} muted />) : <UploadCloud />}</span>
            <div><strong>{templateAsset?.name || "Enviar meu template"}</strong><small>PNG transparente, WebP ou MP4 feito no Canva/IA</small></div>
            <em onClick={(e) => { e.stopPropagation(); templateInputRef.current?.click(); }}>{templateAsset ? "Trocar" : "Selecionar"}</em>
          </button>
          <div className="fields"><label>Texto principal<input value={headline} maxLength={80} onChange={(e) => setHeadline(e.target.value)} /></label><label>Chamada final<input value={cta} maxLength={60} onChange={(e) => setCta(e.target.value)} /></label>
            <div className="format-row"><label>Formato</label><Tabs value={format} onValueChange={setFormat}><TabsList><TabsTrigger value="9:16">9:16</TabsTrigger><TabsTrigger value="1:1">1:1</TabsTrigger><TabsTrigger value="16:9">16:9</TabsTrigger></TabsList></Tabs></div>
            <div className="metadata-clean"><ShieldCheck /><div><strong>Metadados removidos</strong><small>O arquivo final é recriado sem os dados do vídeo original.</small></div><span>ATIVO</span></div>
          </div>
        </section>

        <aside className="preview-panel">
          <div className="preview-heading"><div><Gauge /><span>PRÉVIA AO VIVO</span></div><small>{format}</small></div>
          <div className={`phone-preview ratio-${format.replace(":", "-")} preview-${template}`} style={{ "--accent": chosen.accent } as React.CSSProperties}>
            {current ? <video src={current.url} controls playsInline /> : <div className="empty-video"><Clapperboard /><strong>Sua prévia aparece aqui</strong><small>Adicione um vídeo para começar</small></div>}
            {template === "custom" && templateAsset && (templateAsset.type === "image" ? <img className="custom-overlay" src={templateAsset.url} alt="Template personalizado" /> : <video className="custom-overlay" src={templateAsset.url} autoPlay loop muted playsInline />)}
            {template !== "custom" && <div className="video-overlay">{template === "news" && <em>AGORA</em>}<b>{headline}</b><span>{cta}</span></div>}
          </div>
          <div className="preview-meta"><span className="accent-dot" /><div><strong>{chosen.name}</strong><small>Aplicado a {videos.length} vídeo{videos.length === 1 ? "" : "s"}</small></div></div>
          {progress > 0 && <div className="batch-progress"><div><span>{progress === 100 ? "Prévia preparada" : "Preparando lote"}</span><b>{progress}%</b></div><Progress value={progress} /></div>}
          {!!downloads.length && <div className="download-list">{downloads.map((item, index) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer"><Download /> Baixar vídeo {index + 1}</a>)}</div>}
          <button className="schedule-button" onClick={() => setNotice("O agendamento está preparado, mas precisa conectar uma conta profissional da Meta para publicar automaticamente.")}><CalendarClock /><span><strong>Programar postagens</strong><small>Instagram e Facebook</small></span><em>Conectar</em></button>
          <Button className="render-button" onClick={startBatch} disabled={processing}>{progress === 100 ? <><Download /> Exportar lote</> : <><WandSparkles /> Aplicar em todos</>}</Button>
          <small className="render-note"><CloudDownload /> Renderização de teste no ambiente Sandbox do Shotstack.</small>
        </aside>
      </div>
    </section>
    {notice && <button className="toast" onClick={() => setNotice(null)}><Check /><span>{notice}</span><X /></button>}
    {mobileOpen && <button className="backdrop" onClick={() => setMobileOpen(false)} />}
  </main>;
}
