import { describe, expect, it } from 'vitest';
import { applyByteRange, parseByteRange } from '../src/lib/byte-range.ts';

function body(size: number, chunkSize = size): Response {
  const bytes = Uint8Array.from({ length: size }, (_, index) => index % 256);
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkSize)));
      offset += chunkSize;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(size),
      ETag: '"track"',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}

async function bytesOf(response: Response): Promise<number[]> {
  return [...new Uint8Array(await response.arrayBuffer())];
}

describe('parseByteRange', () => {
  it('reads closed, open, and suffix ranges', () => {
    expect(parseByteRange('bytes=0-1', 100)).toEqual({ kind: 'bytes', start: 0, end: 1 });
    expect(parseByteRange('bytes=4-', 10)).toEqual({ kind: 'bytes', start: 4, end: 9 });
    expect(parseByteRange('bytes=-3', 10)).toEqual({ kind: 'bytes', start: 7, end: 9 });
    expect(parseByteRange('bytes=90-200', 100)).toEqual({ kind: 'bytes', start: 90, end: 99 });
  });

  it('rejects an unsatisfiable start and ignores multipart ranges', () => {
    expect(parseByteRange('bytes=100-100', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(parseByteRange('bytes=0-1,2-3', 100)).toEqual({ kind: 'ignore' });
    expect(parseByteRange('items=0-1', 100)).toEqual({ kind: 'ignore' });
  });
});

describe('applyByteRange', () => {
  it('returns 206 for a partial range without reading past the requested bytes', async () => {
    let reads = 0;
    const bytes = Uint8Array.from({ length: 50 }, (_, index) => index);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const start = reads * 10;
        reads += 1;
        if (start >= bytes.byteLength) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.subarray(start, start + 10));
      },
    });
    const response = await applyByteRange(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '50', ETag: '"track"' },
      }),
      'bytes=0-1',
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-1/50');
    expect(response.headers.get('content-length')).toBe('2');
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(await bytesOf(response)).toEqual([0, 1]);
    expect(reads).toBeLessThanOrEqual(2);
  });

  it('slices a range that spans chunks and a suffix at the end of the file', async () => {
    const middle = await applyByteRange(body(20, 3), 'bytes=5-11');
    expect(middle.status).toBe(206);
    expect(await bytesOf(middle)).toEqual([5, 6, 7, 8, 9, 10, 11]);

    const suffix = await applyByteRange(body(20, 4), 'bytes=-3');
    expect(suffix.headers.get('content-range')).toBe('bytes 17-19/20');
    expect(await bytesOf(suffix)).toEqual([17, 18, 19]);
  });

  it('keeps a whole-file range as 200 and answers 416 when the start is past the end', async () => {
    const whole = await applyByteRange(body(8, 2), 'bytes=0-');
    expect(whole.status).toBe(200);
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    expect(await bytesOf(whole)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    const missing = await applyByteRange(body(8, 2), 'bytes=8-9');
    expect(missing.status).toBe(416);
    expect(missing.headers.get('content-range')).toBe('bytes */8');
    expect(await missing.text()).toBe('');
  });

  it('returns the full object when If-Range does not match', async () => {
    const response = await applyByteRange(body(6, 2), 'bytes=1-2', '"other"');
    expect(response.status).toBe(200);
    expect(await bytesOf(response)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('measures a body that arrived without Content-Length', async () => {
    const payload = Uint8Array.from([4, 5, 6, 7, 8]);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    });
    const response = await applyByteRange(
      new Response(stream, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }),
      'bytes=1-3',
    );
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 1-3/5');
    expect(await bytesOf(response)).toEqual([5, 6, 7]);
  });

  it('leaves non-audio status codes untouched aside from Accept-Ranges', async () => {
    const response = await applyByteRange(new Response('missing', { status: 404 }), 'bytes=0-1');
    expect(response.status).toBe(404);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(await response.text()).toBe('missing');
  });
});
