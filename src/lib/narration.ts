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

/**
 * Chapters rendered by scripts/case-narration.py. Each one's manifest lives at
 * src/data/<slug>-audio.json and its clips at public/audio/<slug>/; a chapter is narrated
 * only once its manifest exists, so each chapter's audio can land on its own. The Difficult
 * Airway is not listed: it uses the ElevenLabs multi-voice manifest registered below.
 */
const chapterTitles: Readonly<Record<string, string>> = {
  'acute-respiratory-failure': 'Acute Respiratory Failure',
  'septic-shock': 'Septic Shock',
  'cardiogenic-pulmonary-edema': 'Acute Cardiogenic Pulmonary Edema',
};
const chapterManifests = import.meta.glob<readonly NarrationTrack[]>('../data/*-audio.json', {
  eager: true,
  import: 'default',
});
const chapterNarrations: Record<string, Narration> = {};
for (const [slug, title] of Object.entries(chapterTitles)) {
  const tracks = chapterManifests[`../data/${slug}-audio.json`];
  if (tracks) {
    chapterNarrations[slug] = {
      dir: slug,
      artist: `${title} — Resus First Principles`,
      storageKey: `rfp-audio-${slug}`,
      tracks,
    };
  }
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
