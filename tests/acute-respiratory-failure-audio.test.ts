import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from '../src/data/acute-respiratory-failure-elevenlabs-audio.json' with { type: 'json' };
import narrationMap from '../src/data/narration/acute-respiratory-failure.map.json' with { type: 'json' };
import lock from '../src/data/narration/acute-respiratory-failure.lock.json' with { type: 'json' };
import registry from '../src/data/narration/elevenlabs-voices.json' with { type: 'json' };
import kokoroTracks from '../src/data/acute-respiratory-failure-audio.json' with { type: 'json' };
import { narrationFor, narrationSrc } from '../src/lib/narration.ts';

const SLUG = 'acute-respiratory-failure';
const DIR = `${SLUG}-elevenlabs`;
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const WORKERS_FILE_LIMIT = 25 * 1024 * 1024;
const voices = registry.voices as Record<string, { character: string; voiceId: string }>;

describe(`${SLUG} narration audio`, () => {
  const narration = narrationFor(SLUG);

  it('serves the complete multi-voice ElevenLabs narration, one track per mapped section', () => {
    expect(narration).toBeDefined();
    expect(narration!.dir).toBe(DIR);
    expect(narration!.storageKey).toBe(`rfp-audio-${DIR}`);
    const tracks = narration!.tracks;
    expect(manifest.dir).toBe(DIR);
    expect(tracks.map((t) => t.filename)).toEqual(narrationMap.sections.map((s) => `${s.key}.mp3`));
    expect(tracks.map((t) => t.index)).toEqual(tracks.map((_, i) => i));
    expect(tracks.map((t) => t.anchor)).toEqual(narrationMap.sections.map((s) => s.anchor));
    expect(tracks.map((t) => t.narrator)).toEqual(narrationMap.sections.map((s) => voices[s.narrator].character));
    expect(manifest.tracks.map((t) => t.voice_id)).toEqual(narrationMap.sections.map((s) => voices[s.narrator].voiceId));
    expect(new Set(manifest.tracks.map((t) => t.model_id))).toEqual(new Set([narrationMap.model]));
    expect(narrationSrc(narration!, tracks[1].filename)).toBe(`/audio/${DIR}/${tracks[1].filename}`);
  });

  it('was generated from the locked chapter text', () => {
    expect(manifest.caseSha256).toBe(lock.caseSha256);
    expect(manifest.tracks.map((t) => t.source_sha256)).toEqual(lock.sections.map((s) => s.verbatimSha256));
    expect(manifest.tracks.map((t) => t.synthesis_sha256)).toEqual(lock.sections.map((s) => s.synthesisSha256));
  });

  it('anchors every track on the built page and ships every file under 25 MiB', () => {
    const page = readFileSync(join(repoRoot, `dist/cases/${SLUG}/index.html`), 'utf8');
    const tracks = narration!.tracks;
    const anchors = tracks.flatMap((t) => (t.anchor ? [t.anchor] : []));
    expect([...page.matchAll(/data-audio-anchor="([^"]+)"/g)].map((m) => m[1])).toEqual(anchors);
    expect(page).toContain('data-audio="available"');
    expect(page).toContain(`data-audio-slug="${SLUG}"`);
    expect(page).toContain('data-audio-narrator');
    expect(page).toContain('preload="none"');
    expect(page).not.toMatch(/elevenlabs\.io/i);
    expect(readdirSync(join(repoRoot, `public/audio/${DIR}`)).sort()).toEqual(tracks.map((t) => t.filename).sort());
    for (const track of tracks) {
      if (track.anchor) expect(page).toContain(`id="${track.anchor}"`);
      const size = statSync(join(repoRoot, `public/audio/${DIR}`, track.filename)).size;
      expect(size, track.filename).toBeGreaterThan(0);
      expect(size, track.filename).toBeLessThan(WORKERS_FILE_LIMIT);
      expect(statSync(join(repoRoot, `dist/audio/${DIR}`, track.filename)).size).toBe(size);
      expect(track.duration_seconds).toBeGreaterThan(5);
    }
  });

  it('keeps the Kokoro recording in place for rollback', () => {
    expect(Array.isArray(kokoroTracks)).toBe(true);
    expect(readdirSync(join(repoRoot, `public/audio/${SLUG}`)).sort()).toEqual(
      (kokoroTracks as { filename: string }[]).map((t) => t.filename).sort(),
    );
  });
});
