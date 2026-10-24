/** One satisfiable `bytes=` range, or a reason to answer with the whole object or 416. */
export type ByteRangeResult =
  | { kind: 'bytes'; start: number; end: number }
  | { kind: 'ignore' }
  | { kind: 'unsatisfiable' };

/**
 * Parse a single HTTP `Range` value against a known object length.
 * Multipart and malformed ranges are ignored so the caller can return 200.
 * A range that begins at or beyond `total` is unsatisfiable (416).
 */
export function parseByteRange(header: string, total: number): ByteRangeResult {
  const spec = /^bytes=(.*)$/i.exec(header.trim());
  if (!spec) return { kind: 'ignore' };
  const value = spec[1].trim();
  if (value.includes(',')) return { kind: 'ignore' };
  const match = /^(\d*)-(\d*)$/.exec(value);
  if (!match || (match[1] === '' && match[2] === '')) return { kind: 'ignore' };
  if (!Number.isInteger(total) || total <= 0) return { kind: 'unsatisfiable' };

  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return { kind: 'unsatisfiable' };
    const length = Math.min(suffix, total);
    return { kind: 'bytes', start: total - length, end: total - 1 };
  }

  const start = Number(match[1]);
  if (!Number.isInteger(start) || start < 0) return { kind: 'ignore' };
  if (start >= total) return { kind: 'unsatisfiable' };
  const end = match[2] === '' ? total - 1 : Number(match[2]);
  if (!Number.isInteger(end) || end < start) return { kind: 'unsatisfiable' };
  return { kind: 'bytes', start, end: Math.min(end, total - 1) };
}

function withAcceptRanges(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function sliceStream(body: ReadableStream<Uint8Array>, start: number, end: number): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let position = 0;
  let sent = 0;
  const length = end - start + 1;

  return new ReadableStream({
    async pull(controller) {
      while (sent < length) {
        const { done, value } = await reader.read();
        if (done || !value) {
          controller.close();
          return;
        }
        const chunkStart = position;
        position += value.byteLength;
        if (position <= start) continue;
        const from = Math.max(0, start - chunkStart);
        const to = Math.min(value.byteLength, end + 1 - chunkStart);
        if (to > from) {
          controller.enqueue(value.subarray(from, to));
          sent += to - from;
        }
        if (sent >= length) {
          controller.close();
          await reader.cancel();
          return;
        }
      }
      controller.close();
    },
    cancel() {
      return reader.cancel();
    },
  });
}

/**
 * Turn a full 200 asset response into a range response.
 * A missing or whole-file range stays 200 so the edge cache can store the object and slice it.
 * The body is streamed: a short prefix range does not buffer the rest of the file.
 */
export async function applyByteRange(
  response: Response,
  rangeHeader: string | null,
  ifRange: string | null = null,
): Promise<Response> {
  if (response.status !== 200) return withAcceptRanges(response);

  // Local asset fetches omit Content-Length when the browser sent Range, but the
  // body is still the whole file. Measure it once so the partial response can
  // name its bounds. Production responses already include Content-Length and stream.
  let source = response;
  const lengthHeader = source.headers.get('content-length');
  let total = lengthHeader === null || lengthHeader.trim() === '' ? Number.NaN : Number(lengthHeader);
  if (rangeHeader && !Number.isInteger(total) && source.body) {
    const bytes = new Uint8Array(await source.arrayBuffer());
    const headers = new Headers(source.headers);
    headers.delete('transfer-encoding');
    headers.set('content-length', String(bytes.byteLength));
    source = new Response(bytes, { status: 200, headers });
    total = bytes.byteLength;
  }
  if (!rangeHeader || !Number.isInteger(total) || total < 0) return withAcceptRanges(source);

  const etag = source.headers.get('etag');
  if (ifRange && (!etag || ifRange !== etag || etag.startsWith('W/'))) {
    return withAcceptRanges(source);
  }

  const parsed = parseByteRange(rangeHeader, total);
  if (parsed.kind === 'ignore') return withAcceptRanges(source);
  if (parsed.kind === 'unsatisfiable') {
    await source.body?.cancel();
    const headers = new Headers();
    headers.set('Content-Range', `bytes */${Number.isInteger(total) && total >= 0 ? total : '*'}`);
    headers.set('Accept-Ranges', 'bytes');
    const type = source.headers.get('content-type');
    if (type) headers.set('Content-Type', type);
    return new Response(null, { status: 416, headers });
  }

  if (parsed.start === 0 && parsed.end === total - 1) return withAcceptRanges(source);

  const headers = new Headers();
  const type = source.headers.get('content-type');
  if (type) headers.set('Content-Type', type);
  if (etag) headers.set('ETag', etag);
  const cache = source.headers.get('cache-control');
  if (cache) headers.set('Cache-Control', cache);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', `bytes ${parsed.start}-${parsed.end}/${total}`);
  headers.set('Content-Length', String(parsed.end - parsed.start + 1));

  if (!source.body) return new Response(null, { status: 206, headers });
  return new Response(sliceStream(source.body, parsed.start, parsed.end), { status: 206, headers });
}
