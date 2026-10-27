import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import chapter from '../src/content/cases/acute-respiratory-failure.json' with { type: 'json' };
import { narrationFor, narrationSrc } from '../src/lib/narration.ts';

const SLUG = 'acute-respiratory-failure';
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const WORKERS_FILE_LIMIT = 25 * 1024 * 1024;

describe(`${SLUG} narration audio`, () => {
  const narration = narrationFor(SLUG);

  it('has one clip per top-level part, plus introduction and treatment', () => {
    expect(narration).toBeDefined();
    expect(narration!.dir).toBe(SLUG);
    expect(narration!.storageKey).toBe(`rfp-audio-${SLUG}`);
    const tracks = narration!.tracks;
    const parts = chapter.principles.filter((p) => !('parentId' in p) || !p.parentId);
    expect(tracks).toHaveLength(parts.length + 2);
    expect(tracks.map((t) => t.index)).toEqual(tracks.map((_, i) => i));
    expect(tracks[0]).toMatchObject({ anchor: null, filename: '00-title-and-introduction.mp3' });
    expect(tracks.slice(1, -1).map((t) => t.anchor)).toEqual(parts.map((p) => `principle-${p.id}`));
    expect(tracks.at(-1)?.anchor).toBe('treatment-heading');
    expect(narrationSrc(narration!, tracks[1].filename)).toBe(`/audio/${SLUG}/${tracks[1].filename}`);
  });

  it('anchors every clip on the built page and ships every file under 25 MiB', () => {
    const page = readFileSync(join(repoRoot, `dist/cases/${SLUG}/index.html`), 'utf8');
    const anchors = narration!.tracks.flatMap((t) => (t.anchor ? [t.anchor] : []));
    expect([...page.matchAll(/data-audio-anchor="([^"]+)"/g)].map((m) => m[1])).toEqual(anchors);
    expect(page).toContain('data-audio="available"');
    expect(page).toContain(`data-audio-slug="${SLUG}"`);
    expect(page).toContain('preload="none"');
    expect(readdirSync(join(repoRoot, `public/audio/${SLUG}`)).sort()).toEqual(narration!.tracks.map((t) => t.filename).sort());
    for (const track of narration!.tracks) {
      if (track.anchor) expect(page).toContain(`id="${track.anchor}"`);
      const size = statSync(join(repoRoot, `public/audio/${SLUG}`, track.filename)).size;
      expect(size, track.filename).toBeGreaterThan(0);
      expect(size, track.filename).toBeLessThan(WORKERS_FILE_LIMIT);
      expect(statSync(join(repoRoot, `dist/audio/${SLUG}`, track.filename)).size).toBe(size);
      expect(track.duration_seconds).toBeGreaterThan(5);
    }
  });
});
