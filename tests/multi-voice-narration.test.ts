import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import registry from '../src/data/narration/elevenlabs-voices.json' with { type: 'json' };
import {
  chapterNarration,
  completeMultiVoiceTracks,
  narrationFor,
  type NarrationMap,
  type NarrationTrack,
} from '../src/lib/narration.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const voices = registry.voices as Record<string, { character: string; voiceId: string }>;

/** Narrators per section, in order, from the three-chapter multi-voice directive. */
const assignments: Record<string, string[]> = {
  'cardiogenic-pulmonary-edema': [
    'silas-mercer',
    'mags-callahan',
    'amara-bennett',
    'elias-voss',
    'elias-voss',
    'amara-bennett',
    'rebecca-sterling',
    'rebecca-sterling',
    'elias-voss',
    'mags-callahan',
    'silas-mercer',
    'rebecca-sterling',
  ],
  'acute-respiratory-failure': [
    'silas-mercer',
    'rosa-vega',
    'amara-bennett',
    'amara-bennett',
    'frank-delaney',
    'daniel-brooks',
    'rebecca-sterling',
    'rebecca-sterling',
    'silas-mercer',
    'rebecca-sterling',
  ],
  'septic-shock': [
    'silas-mercer',
    'mags-callahan',
    'elias-voss',
    'elias-voss',
    'amara-bennett',
    'amara-bennett',
    'elias-voss',
    'rebecca-sterling',
    'rebecca-sterling',
    'silas-mercer',
    'rebecca-sterling',
  ],
};

interface MapSection {
  key: string;
  label: string;
  narrator: string;
  anchor: string | null;
  intro?: boolean;
  treatment?: boolean;
  principles: string[];
}
interface FullMap extends NarrationMap {
  case: string;
  model: string;
  manifest: string;
  sections: MapSection[];
}

const readJson = (path: string) => JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
const python = (code: string) =>
  spawnSync('python3', ['-c', code], { cwd: repoRoot, encoding: 'utf8', env: { PATH: process.env.PATH } });

describe.each(Object.keys(assignments))('%s narrator map', (slug) => {
  const map = readJson(`src/data/narration/${slug}.map.json`) as FullMap;
  const chapter = readJson(`src/content/cases/${slug}.json`) as {
    principles: { id: string; parentId?: string }[];
  };

  it('targets its own ElevenLabs folder and manifest, leaving the Kokoro recording in place', () => {
    expect(map.case).toBe(`src/content/cases/${slug}.json`);
    expect(map.model).toBe('eleven_multilingual_v2');
    expect(map.audioDir).toBe(`${slug}-elevenlabs`);
    expect(map.manifest).toBe(`src/data/${slug}-elevenlabs-audio.json`);
    expect(map.manifest).not.toBe(`src/data/${slug}-audio.json`);
  });

  it('assigns the directive narrators from the existing voice registry', () => {
    expect(map.sections.map((s) => s.narrator)).toEqual(assignments[slug]);
    for (const s of map.sections) expect(voices[s.narrator], s.narrator).toBeDefined();
  });

  it('covers every principle exactly once, in document order, with one section per part', () => {
    expect(map.sections.flatMap((s) => s.principles)).toEqual(chapter.principles.map((p) => p.id));
    expect(map.sections.filter((s) => s.intro)).toHaveLength(1);
    expect(map.sections.filter((s) => s.treatment)).toHaveLength(1);
    expect(map.sections[0]).toMatchObject({ key: '00-title-and-introduction', anchor: null, intro: true });
    expect(map.sections.at(-1)).toMatchObject({ anchor: 'treatment-heading', treatment: true });
    expect(map.sections.at(-2)).toMatchObject({ anchor: 'principle-synthesis', principles: ['synthesis'] });
    const parts = chapter.principles.filter((p) => !p.parentId).map((p) => p.id);
    expect(map.sections.slice(1, -2).map((s) => s.principles[0])).toEqual(parts);
    expect(map.sections.map((s) => s.key)).toEqual(
      map.sections.map((s, i) => `${String(i).padStart(2, '0')}-${s.key.slice(3)}`),
    );
    for (const s of map.sections.slice(1, -1)) expect(s.anchor).toBe(`principle-${s.principles[0]}`);
  });

  it('has a committed lock that matches the published chapter and pronunciation rules', () => {
    const lock = readJson(`src/data/narration/${slug}.lock.json`);
    expect(lock.sections.map((s: { key: string }) => s.key)).toEqual(map.sections.map((s) => s.key));
    const result = spawnSync('python3', ['scripts/narration/extract.py', `src/data/narration/${slug}.map.json`, '--check-lock'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('lock matches');
  });

  it('serves Kokoro until a complete ElevenLabs manifest exists', () => {
    const narration = narrationFor(slug);
    expect(narration).toBeDefined();
    if (existsSync(join(repoRoot, map.manifest))) return;
    expect(narration!.dir).toBe(slug);
    expect(narration!.storageKey).toBe(`rfp-audio-${slug}`);
  });
});

describe('physiologically difficult airway lock', () => {
  it('still matches after the shared pronunciation rules grew', () => {
    const result = spawnSync(
      'python3',
      ['scripts/narration/extract.py', 'src/data/narration/physiologically-difficult-airway.map.json', '--check-lock'],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    expect(result.stdout).toContain('lock matches');
  });
});

describe('narration manifest formats in the offline scripts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rfp-manifest-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const track = { index: 0, heading: 'T', anchor: null, filename: '00-title-and-introduction.mp3', duration_seconds: 9 };

  it('reads the plain-array and object formats, and rejects anything else', () => {
    const array = join(dir, 'array.json');
    const object = join(dir, 'object.json');
    const broken = join(dir, 'broken.json');
    writeFileSync(array, JSON.stringify([track]));
    writeFileSync(object, JSON.stringify({ dir: 'septic-shock-elevenlabs', model_id: 'm', tracks: [track] }));
    writeFileSync(broken, JSON.stringify({ dir: 'x' }));
    const result = python(
      [
        'import json, sys',
        "sys.path.insert(0, 'scripts/narration')",
        'from extract import read_manifest',
        `a = read_manifest(${JSON.stringify(array)}, 'septic-shock')`,
        `o = read_manifest(${JSON.stringify(object)}, 'septic-shock')`,
        "print(json.dumps([a['dir'], len(a['tracks']), o['dir'], len(o['tracks']), o['model_id']]))",
        `read_manifest(${JSON.stringify(broken)}, 'septic-shock')`,
      ].join('\n'),
    );
    expect(JSON.parse(result.stdout)).toEqual(['septic-shock', 1, 'septic-shock-elevenlabs', 1, 'm']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('neither a track array nor an object');
  });

  it('writes new narrations to their own manifest and keeps the airway default', () => {
    const result = python(
      [
        'import json, os, sys',
        "sys.path.insert(0, 'scripts/narration')",
        'from extract import ROOT, manifest_path',
        "paths = [os.path.relpath(manifest_path(json.load(open(f'src/data/narration/{s}.map.json'))), ROOT)",
        "         for s in ['septic-shock', 'physiologically-difficult-airway']]",
        'print(json.dumps(paths))',
      ].join('\n'),
    );
    expect(JSON.parse(result.stdout)).toEqual([
      'src/data/septic-shock-elevenlabs-audio.json',
      'src/data/physiologically-difficult-airway-audio.json',
    ]);
  });

  it('estimates a new chapter offline without an API key', () => {
    const result = spawnSync(
      'python3',
      ['scripts/narration/elevenlabs.py', 'estimate', 'src/data/narration/cardiogenic-pulmonary-edema.map.json'],
      { cwd: repoRoot, encoding: 'utf8', env: { PATH: process.env.PATH } },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^total \d+ characters in \d+ requests/m);
  });
});

describe('multi-voice registration fallback', () => {
  const map: NarrationMap = {
    audioDir: 'septic-shock-elevenlabs',
    manifest: 'src/data/septic-shock-elevenlabs-audio.json',
    sections: [
      { key: '00-title-and-introduction', narrator: 'silas-mercer', anchor: null },
      { key: '01-three-septic', narrator: 'mags-callahan', anchor: 'principle-three-septic' },
    ],
  };
  const voiced: NarrationTrack[] = [
    { index: 0, heading: 'Septic Shock', anchor: null, filename: '00-title-and-introduction.mp3', duration_seconds: 20, narrator: 'Silas Mercer' },
    { index: 1, heading: 'Part I', anchor: 'principle-three-septic', filename: '01-three-septic.mp3', duration_seconds: 300, narrator: 'Margaret "Mags" Callahan' },
  ];
  const complete = { dir: 'septic-shock-elevenlabs', model_id: 'eleven_multilingual_v2', tracks: voiced };
  const kokoro: NarrationTrack[] = [
    { index: 0, heading: 'Septic Shock', anchor: null, filename: '00-title-and-introduction.mp3', duration_seconds: 21 },
  ];

  it('switches to a complete multi-voice manifest, with its own folder and resume key', () => {
    const narration = chapterNarration('septic-shock', 'Septic Shock', kokoro, map, complete);
    expect(narration).toMatchObject({
      dir: 'septic-shock-elevenlabs',
      storageKey: 'rfp-audio-septic-shock-elevenlabs',
      artist: 'Septic Shock — Resus First Principles',
    });
    expect(narration!.tracks.map((t) => t.narrator)).toEqual(['Silas Mercer', 'Margaret "Mags" Callahan']);
  });

  it.each([
    ['no manifest', undefined],
    ['a plain array of tracks', voiced],
    ['a missing track', { ...complete, tracks: voiced.slice(0, 1) }],
    ['tracks out of order', { ...complete, tracks: [voiced[1], voiced[0]] }],
    ['another audio folder', { ...complete, dir: 'septic-shock' }],
    ['a track without a narrator', { ...complete, tracks: [voiced[0], { ...voiced[1], narrator: undefined }] }],
    ['a track without a duration', { ...complete, tracks: [voiced[0], { ...voiced[1], duration_seconds: 0 }] }],
    ['a wrong anchor', { ...complete, tracks: [voiced[0], { ...voiced[1], anchor: 'principle-x' }] }],
  ])('keeps Kokoro for %s', (_, manifest) => {
    expect(completeMultiVoiceTracks(map, manifest)).toBeUndefined();
    expect(chapterNarration('septic-shock', 'Septic Shock', kokoro, map, manifest)).toMatchObject({
      dir: 'septic-shock',
      storageKey: 'rfp-audio-septic-shock',
      tracks: kokoro,
    });
  });

  it('has no narration without either manifest', () => {
    expect(chapterNarration('septic-shock', 'Septic Shock', undefined, map, undefined)).toBeUndefined();
  });
});
