import { narrationFor, narrationSrc as srcFor, type Narration, type NarrationTrack } from './narration.ts';

export type { NarrationTrack } from './narration.ts';

const cardiacArrest = narrationFor('adult-cardiac-arrest') as Narration;

/** Narration for the adult cardiac arrest case. Files are served from `/audio/cardiac-arrest/`. */
export const cardiacArrestAudio: readonly NarrationTrack[] = cardiacArrest.tracks;

export const narrationArtist = cardiacArrest.artist;

export function narrationSrc(filename: string): string {
  return srcFor(cardiacArrest, filename);
}
