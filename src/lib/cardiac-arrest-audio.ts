import tracks from '../data/cardiac-arrest-audio.json' with { type: 'json' };

export interface NarrationTrack {
  index: number;
  heading: string;
  anchor: string | null;
  filename: string;
  duration_seconds: number;
}

/** Narration for the adult cardiac arrest case. Files are served from `/audio/cardiac-arrest/`. */
export const cardiacArrestAudio = tracks as readonly NarrationTrack[];

export const narrationArtist = 'Adult Cardiac Arrest — Resus First Principles';

export function narrationSrc(filename: string): string {
  return `/audio/cardiac-arrest/${filename}`;
}
