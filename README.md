# DeX Vídeo

Editor de vídeos em massa, com templates e importação de até 500 vídeos por lote.

## Vercel

Build: `pnpm exec next build`. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APIFY_TOKEN` e `SHOTSTACK_API_KEY` nas variáveis de ambiente do projeto. Nunca coloque chaves no repositório.

A migration `video_batches` foi aplicada no projeto Supabase `cvoppxmxptnrsivarunp`. As permissões permitem apenas inserir lotes validados; a leitura, alteração e exclusão ficam bloqueadas para os clientes.

## Desenvolvimento

`pnpm install --frozen-lockfile`

`pnpm exec next dev`
