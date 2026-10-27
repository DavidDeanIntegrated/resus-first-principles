import cardiacArrestTracks from '../data/cardiac-arrest-audio.json' with { type: 'json' };
import shockTracks from '../data/shock-audio.json' with { type: 'json' };
import airwayAudio from '../data/physiologically-difficult-airway-audio.json' with { type: 'json' };

export interface NarrationTrack {
  index: number;
  heading: string;
  anchor: string | null;
  filename: string;
  duration_seconds: number;
  /** Character voice reading this track, for multi-voice chapters. Shown as "Now narrating". */
  narrator?: string;
}

export interface Narration {
  /** Directory under `/audio/` that serves this case's files. */
  dir: string;
  artist: string;
  storageKey: string;
  tracks: readonly NarrationTrack[];
}

/** A narrator map in src/data/narration/<slug>.map.json, as read by scripts/narration/. */
export interface NarrationMap {
  audioDir: string;
  /** Repository path of the multi-voice track manifest, e.g. src/data/<slug>-elevenlabs-audio.json. */
  manifest?: string;
  sections: readonly { key: string; narrator: string; anchor: string | null }[];
}

/**
 * The tracks of a multi-voice manifest, but only when it is complete for its map: the structured
 * object format, serving the map's audio folder, with exactly one track per mapped section, in map
 * order, each with its anchor, narrator and a duration. Anything else (no manifest, the older plain
 * array of tracks, a partial or failed generation) returns undefined so the existing narration stays.
 */
export function completeMultiVoiceTracks(
  map: NarrationMap,
  manifest: unknown,
): readonly NarrationTrack[] | undefined {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return undefined;
  const { dir, tracks } = manifest as { dir?: unknown; tracks?: unknown };
  if (dir !== map.audioDir || !Array.isArray(tracks) || tracks.length !== map.sections.length) return undefined;
  const complete = map.sections.every((section, i) => {
    const track = tracks[i] as Partial<NarrationTrack> | null;
    return (
      !!track &&
      track.index === i &&
      track.filename === `${section.key}.mp3` &&
      track.anchor === section.anchor &&
      typeof track.heading === 'string' &&
      typeof track.narrator === 'string' &&
      track.narrator.length > 0 &&
      typeof track.duration_seconds === 'number' &&
      track.duration_seconds > 0
    );
  });
  return complete ? (tracks as NarrationTrack[]) : undefined;
}

/**
 * Chapters first narrated by scripts/case-narration.py (Kokoro). Each one's manifest lives at
 * src/data/<slug>-audio.json and its clips at public/audio/<slug>/; a chapter is narrated only once
 * its manifest exists, so each chapter's audio can land on its own. A chapter switches to its
 * multi-voice ElevenLabs narration (map src/data/narration/<slug>.map.json, clips in
 * public/audio/<audioDir>/) only once that manifest is complete; until then, and for rollback, the
 * Kokoro recording is served. The Difficult Airway is not listed: it is registered below.
 */
const chapterTitles: Readonly<Record<string, string>> = {
  'acute-respiratory-failure': 'Acute Respiratory Failure',
  'septic-shock': 'Septic Shock',
  'cardiogenic-pulmonary-edema': 'Acute Cardiogenic Pulmonary Edema',
};
const chapterManifests = import.meta.glob<unknown>('../data/*-audio.json', { eager: true, import: 'default' });
const narratorMaps = import.meta.glob<NarrationMap>('../data/narration/*.map.json', {
  eager: true,
  import: 'default',
});

/** The narration served for one chapter: multi-voice when complete, else Kokoro, else none. */
export function chapterNarration(
  slug: string,
  title: string,
  kokoro: unknown,
  map?: NarrationMap,
  multiVoice?: unknown,
): Narration | undefined {
  const artist = `${title} — Resus First Principles`;
  const voiced = map && completeMultiVoiceTracks(map, multiVoice);
  if (map && voiced) {
    // Its own resume key: track indexes differ from the Kokoro recording.
    return { dir: map.audioDir, artist, storageKey: `rfp-audio-${map.audioDir}`, tracks: voiced };
  }
  if (Array.isArray(kokoro)) {
    return { dir: slug, artist, storageKey: `rfp-audio-${slug}`, tracks: kokoro as NarrationTrack[] };
  }
  return undefined;
}

/** Repository path (src/data/...) to the key import.meta.glob uses from this file (../data/...). */
function globKey(repoPath: string | undefined): string {
  return repoPath ? repoPath.replace(/^src\//, '../') : '';
}

const chapterNarrations: Record<string, Narration> = {};
for (const [slug, title] of Object.entries(chapterTitles)) {
  const map = narratorMaps[`../data/narration/${slug}.map.json`];
  const narration = chapterNarration(
    slug,
    title,
    chapterManifests[`../data/${slug}-audio.json`],
    map,
    map && chapterManifests[globKey(map.manifest)],
  );
  if (narration) chapterNarrations[slug] = narration;
}

/** Narrated cases, keyed by case slug. A case without an entry has no audio. */
const narrations: Readonly<Record<string, Narration>> = {
  ...chapterNarrations,
  'adult-cardiac-arrest': {
    dir: 'cardiac-arrest',
    artist: 'Adult Cardiac Arrest — Resus First Principles',
    storageKey: 'rfp-audio-cardiac-arrest',
    tracks: cardiacArrestTracks as readonly NarrationTrack[],
  },
  'shock-pressure-flow': {
    dir: 'shock',
    artist: 'Shock — Resus First Principles',
    storageKey: 'rfp-audio-shock',
    tracks: shockTracks as readonly NarrationTrack[],
  },
  'physiologically-difficult-airway': {
    dir: airwayAudio.dir,
    artist: 'The Physiologically Difficult Airway — Resus First Principles',
    storageKey: 'rfp-audio-difficult-airway',
    tracks: airwayAudio.tracks as readonly NarrationTrack[],
  },
};

export function narrationFor(slug: string | undefined): Narration | undefined {
  return slug ? narrations[slug] : undefined;
}

export function hasNarration(slug: string | undefined): boolean {
  return narrationFor(slug) !== undefined;
}

/** The track whose anchor is `anchor` on the page for `slug`, if any. */
export function narrationTrack(slug: string | undefined, anchor: string): NarrationTrack | undefined {
  return narrationFor(slug)?.tracks.find((track) => track.anchor === anchor);
}

export function narrationSrc(narration: Narration, filename: string): string {
  return `/audio/${narration.dir}/${filename}`;
}
