import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cardiacArrestAudio } from '../src/lib/cardiac-arrest-audio.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Cloudflare Workers static assets reject a file at or above 25 MiB. */
const WORKERS_FILE_LIMIT = 25 * 1024 * 1024;

/** Byte sizes of the supplied 48 kbps mono files. A mismatch means the audio was re-encoded. */
const suppliedBytes: Record<string, number> = {
  '00-title-and-introduction.mp3': 154604,
  '01-orientation.mp3': 131132,
  '02-normal-circulation.mp3': 2247500,
  '03-cpr-circulation.mp3': 8744204,
  '04-electrical-mechanical.mp3': 3506348,
  '05-ventilation.mp3': 4927340,
  '06-monitoring.mp3': 2653436,
  '07-reversible-causes.mp3': 18016940,
  '08-treatment.mp3': 2470844,
  '09-after-rosc.mp3': 5028860,
  '10-limits.mp3': 766316,
  '11-approach-to-treatment.mp3': 3372428,
};

describe('cardiac arrest narration audio', () => {
  it('anchors every narrated section on the built page and keeps each file under 25 MiB', () => {
    const page = readFileSync(join(repoRoot, 'dist/cases/adult-cardiac-arrest/index.html'), 'utf8');
    const shock = readFileSync(join(repoRoot, 'dist/cases/shock-pressure-flow/index.html'), 'utf8');
    const anchors = cardiacArrestAudio.flatMap((track) => (track.anchor ? [track.anchor] : []));

    expect(cardiacArrestAudio).toHaveLength(12);
    expect(anchors).toHaveLength(11);

    for (const track of cardiacArrestAudio) {
      const published = join(repoRoot, 'public/audio/cardiac-arrest', track.filename);
      const built = join(repoRoot, 'dist/audio/cardiac-arrest', track.filename);
      const size = statSync(published).size;
      expect(size, track.filename).toBe(suppliedBytes[track.filename]);
      expect(size, track.filename).toBeGreaterThan(0);
      expect(size, track.filename).toBeLessThan(WORKERS_FILE_LIMIT);
      expect(statSync(built).size, track.filename).toBe(size);
      if (track.anchor) {
        expect(page).toContain(`id="${track.anchor}"`);
        expect(page).toContain(`data-audio-anchor="${track.anchor}"`);
      }
    }

    expect(page.match(/data-audio-listen/g)).toHaveLength(anchors.length);
    expect(page).toContain('data-audio="available"');
    expect(page).toContain('preload="none"');
    expect(page).toContain('data-audio-player');
    expect(page).toContain('data-audio-action="previous"');
    expect(page).toContain('AI-narrated audio. The written text is authoritative.');
    expect(page).not.toContain('audio-demo');
    expect(page).not.toContain('<audio preload="none" hidden data-audio-element src=');
    expect(shock).not.toContain('data-audio="available"');
    expect(shock).not.toContain('data-audio-player');
    expect(shock).not.toContain('data-audio-listen');
    expect(shock).not.toContain('listen-from-here');
    expect(shock).not.toContain('audio-demo');
  });
});
