export type Edit = { ratio: string; template: string; title: string; footer: string; accent: string; fit: string; start: number; end: number; speed: number; volume: number; brightness: number; contrast: number; saturation: number; flip: boolean };
export const defaults: Edit = { ratio: '9:16', template: 'clean', title: '', footer: '', accent: '#ff7048', fit: 'contain', start: 0, end: 0, speed: 1, volume: 1, brightness: 100, contrast: 100, saturation: 100, flip: false };
export const dimensions = (ratio: string): [number, number] => ratio === '16:9' ? [1280,720] : ratio === '1:1' ? [720,720] : [720,1280];
export function time(value: number) { const n = Math.max(0, Math.floor(value || 0)); return `${Math.floor(n / 60).toString().padStart(2,'0')}:${(n % 60).toString().padStart(2,'0')}`; }
function lines(ctx: CanvasRenderingContext2D, text: string, width: number, x: number, y: number, height: number) {
  const words = text.split(/\s+/); const result: string[] = []; let line = '';
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > width && line) { result.push(line); line = word; } else line = next; }
  if (line) result.push(line); result.slice(0,3).forEach((s,i)=>ctx.fillText(s,x,y+i*height,width));
}
export function paint(canvas: HTMLCanvasElement, video: HTMLVideoElement, edit: Edit, overlay?: CanvasImageSource | null) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const [w,h] = dimensions(edit.ratio); if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
  ctx.fillStyle = edit.template === 'paper' ? '#f5f0e8' : '#12151a'; ctx.fillRect(0,0,w,h);
  const framed = edit.template !== 'none'; const top = framed ? h*.17 : 0; const height = framed ? h*.67 : h;
  if(video.readyState >= 2 && video.videoWidth) {
    const scale = edit.fit==='cover' ? Math.max(w/video.videoWidth,height/video.videoHeight) : Math.min(w/video.videoWidth,height/video.videoHeight);
    const dw=video.videoWidth*scale,dh=video.videoHeight*scale;
    ctx.save();ctx.beginPath();ctx.rect(0,top,w,height);ctx.clip();ctx.filter=`brightness(${edit.brightness}%) contrast(${edit.contrast}%) saturate(${edit.saturation}%)`;
    if(edit.flip){ctx.translate(w,0);ctx.scale(-1,1);} ctx.drawImage(video,(w-dw)/2,top+(height-dh)/2,dw,dh);ctx.restore();
  }
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=edit.template==='paper'?'#1b2027':'#fff';
  ctx.font=`800 ${Math.round(w*.055)}px Arial`;
  if(edit.title) lines(ctx,edit.title,w*.86,w/2,framed?h*.065:h*.09,w*.066);
  if(edit.footer){ctx.fillStyle=edit.accent;ctx.fillRect(w*.06,h*.875,w*.88,h*.075);ctx.fillStyle='#fff';ctx.font=`700 ${Math.round(w*.035)}px Arial`;ctx.fillText(edit.footer,w/2,h*.914,w*.8);}
  if(edit.template==='editorial'){ctx.fillStyle=edit.accent;ctx.fillRect(0,top-8,w,8);ctx.fillRect(0,top+height,w,8);}
  if(overlay) {try{ctx.drawImage(overlay,0,0,w,h);}catch{}}
}
function loaded(element: HTMLMediaElement, event: string, signal?: AbortSignal) {
  return new Promise<void>((resolve,reject)=>{ const timeout=setTimeout(()=>finish(new Error('O vídeo demorou demais para carregar. Tente enviar o arquivo.')),30000);
    const done=()=>finish();const fail=()=>finish(new Error('Não foi possível abrir o vídeo. Use MP4/WebM compatível ou envie o arquivo.'));const abort=()=>finish(new DOMException('Cancelado','AbortError'));
    function finish(err?: Error){clearTimeout(timeout);element.removeEventListener(event,done);element.removeEventListener('error',fail);signal?.removeEventListener('abort',abort);err?reject(err):resolve();}
    element.addEventListener(event,done,{once:true});element.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  });
}
export async function exportVideo(url: string, edit: Edit, overlayUrl: string | undefined, overlayType: string | undefined, onProgress: (n:number)=>void, signal: AbortSignal) {
  if(typeof MediaRecorder==='undefined')throw new Error('Este navegador não oferece exportação. Use Chrome ou Edge atualizado.');
  const video=document.createElement('video');video.crossOrigin='anonymous';video.preload='auto';video.playsInline=true;
  const canvas=document.createElement('canvas');let stream: MediaStream | undefined;let audio: AudioContext | undefined;let recorder: MediaRecorder | undefined;let frame=0;let watchdog:ReturnType<typeof setInterval>|undefined;let cancel:(()=>void)|undefined;let layer: HTMLImageElement | HTMLVideoElement | undefined;
  try {
    const ready=loaded(video,'loadeddata',signal);video.src=url;await ready;
    const end=edit.end>0?Math.min(edit.end,video.duration):video.duration;const start=Math.min(edit.start,end);
    if(!Number.isFinite(end)||end-start<.1)throw new Error('Selecione um intervalo válido de pelo menos 0,1 segundo.');
    if(start>0){const seeking=loaded(video,'seeked',signal);video.currentTime=start;await seeking;}
    if(overlayUrl){if(overlayType==='video'){const v=document.createElement('video');v.muted=true;v.loop=true;v.playsInline=true;const ready=loaded(v,'loadeddata',signal);v.src=overlayUrl;await ready;layer=v;await v.play();}else{const img=new Image();img.src=overlayUrl;await img.decode();layer=img;}}
    video.playbackRate=edit.speed;paint(canvas,video,edit,layer);stream=canvas.captureStream(30);
    if(edit.volume>0){audio=new AudioContext();await audio.resume();const source=audio.createMediaElementSource(video);const gain=audio.createGain();gain.gain.value=edit.volume;const dest=audio.createMediaStreamDestination();source.connect(gain);gain.connect(dest);dest.stream.getAudioTracks().forEach(t=>stream!.addTrack(t));}
    else video.muted=true;
    const mime=['video/mp4;codecs=avc1.424028,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw new Error('Nenhum formato de exportação compatível neste navegador.');
    if(signal.aborted)throw new DOMException('Cancelado','AbortError');
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000});const chunks:BlobPart[]=[];
    const result=new Promise<Blob>((resolve,reject)=>{recorder!.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder!.onerror=()=>reject(new Error('Falha na codificação do vídeo.'));recorder!.onstop=()=>signal.aborted?reject(new DOMException('Cancelado','AbortError')):resolve(new Blob(chunks,{type:mime}));});
    cancel=()=>{video.pause();if(recorder?.state==='recording')recorder.stop();};signal.addEventListener('abort',cancel,{once:true});
    // Attach a rejection handler before playback can fail, preserving the original error.
    void result.catch(()=>{});
    recorder.start(250);await video.play();
    let lastTime=video.currentTime,lastAdvance=Date.now();
    watchdog=setInterval(()=>{if(video.currentTime!==lastTime){lastTime=video.currentTime;lastAdvance=Date.now();}else if(Date.now()-lastAdvance>30000){recorder?.onerror?.(new ErrorEvent('error',{message:'A reprodução ficou parada por mais de 30 segundos.'}));cancel?.();}},1000);
    const tick=()=>{paint(canvas,video,edit,layer);onProgress(Math.min(99,(video.currentTime-start)/(end-start)*100));if(video.ended||video.currentTime>=end){video.pause();if(recorder?.state==='recording')recorder.stop();}else if(!signal.aborted)frame=requestAnimationFrame(tick);};tick();
    const blob=await result;signal.removeEventListener('abort',cancel);onProgress(100);return {blob,extension:mime.startsWith('video/mp4')?'mp4':'webm'};
  } catch(error) {if(error instanceof DOMException&&error.name==='SecurityError')throw new Error('A origem bloqueou a edição deste link. Baixe o original e envie o arquivo ao editor.');throw error;}
  finally {if(watchdog)clearInterval(watchdog);if(cancel)signal.removeEventListener('abort',cancel);cancelAnimationFrame(frame);video.pause();video.removeAttribute('src');video.load();if(layer instanceof HTMLVideoElement){layer.pause();layer.removeAttribute('src');layer.load();}if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());if(audio&&audio.state!=='closed')await audio.close();}
}
