import cardiacArrestTracks from '../data/cardiac-arrest-audio.json' with { type: 'json' };
import shockTracks from '../data/shock-audio.json' with { type: 'json' };

export interface NarrationTrack {
  index: number;
  heading: string;
  anchor: string | null;
  filename: string;
  duration_seconds: number;
}

export interface Narration {
  /** Directory under `/audio/` that serves this case's files. */
  dir: string;
  artist: string;
  storageKey: string;
  tracks: readonly NarrationTrack[];
}

/** Narrated cases, keyed by case slug. A case without an entry has no audio. */
const narrations: Readonly<Record<string, Narration>> = {
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
