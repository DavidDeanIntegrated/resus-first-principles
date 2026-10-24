import { applyByteRange } from './lib/byte-range.ts';

/**
 * Audio is the only path that runs here (`assets.run_worker_first`).
 * Static assets ignore `Range` and answer 200 with the whole file, so a browser
 * cannot seek a narration. When `Range` is still on the request, slice the asset
 * and return 206, streaming when Content-Length is known. When the edge has already removed
 * `Range`, return the full 200 and let Workers Caching turn it into 206:
 * https://developers.cloudflare.com/workers/cache/configuration/#range-requests
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/audio/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request);

    const range = request.headers.get('Range');
    // A fresh request, so the browser's Range and Content-Length are not reused.
    // The hostname is ignored; only the pathname selects the asset.
    const assetRequest = new Request(new URL(url.pathname, 'https://assets.local'), { method: request.method });
    if (!range) return applyByteRange(await env.ASSETS.fetch(assetRequest), null);

    try {
      const asset = await env.ASSETS.fetch(assetRequest);
      return await applyByteRange(asset, range, request.headers.get('If-Range'));
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'audio range failed',
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return new Response(null, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
