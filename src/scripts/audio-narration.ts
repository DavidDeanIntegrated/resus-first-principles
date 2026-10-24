import {
  cardiacArrestAudio,
  narrationArtist,
  narrationSrc,
  type NarrationTrack,
} from '../lib/cardiac-arrest-audio.ts';

const STORAGE_KEY = 'rfp-audio-cardiac-arrest';
const SEEK_STEP = 10;

interface ResumePoint {
  index: number;
  position: number;
}

/**
 * Drives Atelier's mini-player. Nothing is fetched until the listener presses play
 * or a control that continues playback. Section and position are restored from localStorage.
 */
export function mountCardiacArrestAudio(player: HTMLElement): void {
  const audio = player.querySelector<HTMLAudioElement>('[data-audio-element]');
  const title = player.querySelector<HTMLElement>('[data-audio-title]');
  const elapsed = player.querySelector<HTMLElement>('[data-audio-elapsed]');
  const total = player.querySelector<HTMLElement>('[data-audio-total]');
  const progress = player.querySelector<HTMLElement>('[data-audio-progress]');
  const toggle = player.querySelector<HTMLButtonElement>('[data-audio-action="toggle"]');
  if (!audio || !title || !elapsed || !total || !progress || !toggle) return;
  wirePlayer(player, audio, title, elapsed, total, progress, toggle);
}

function wirePlayer(
  player: HTMLElement,
  audio: HTMLAudioElement,
  title: HTMLElement,
  elapsed: HTMLElement,
  total: HTMLElement,
  progress: HTMLElement,
  toggle: HTMLButtonElement,
): void {
  const tracks = cardiacArrestAudio;
  audio.preload = 'none';

  let index = 0;
  let position = 0;
  let resumeAt = 0;
  let advancing = false;
  let lastPersist = 0;

  const saved = readResume(tracks);
  if (saved) {
    index = saved.index;
    position = saved.position;
    resumeAt = saved.position;
  }

  document.documentElement.setAttribute('data-audio', 'available');
  registerMediaSession();
  render();
  openPlayer('paused');
  syncBarHeight();

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const listen = target.closest<HTMLElement>('[data-audio-listen]');
    if (listen) {
      const anchor = listen.getAttribute('data-audio-anchor');
      if (anchor) listenFrom(anchor);
      return;
    }
    const control = target.closest<HTMLElement>('[data-audio-action]');
    if (!control || !player.contains(control)) return;
    const action = control.getAttribute('data-audio-action');
    if (action === 'toggle') onToggle();
    else if (action === 'next') onNext();
    else if (action === 'previous') onPrevious();
    else if (action === 'close') onClose();
  });

  audio.addEventListener('loadedmetadata', () => {
    if (!srcMatches()) return;
    const duration = audio.duration;
    if (resumeAt > 0.2 && Number.isFinite(duration)) {
      const cap = Math.max(0, duration - 0.05);
      const at = Math.min(resumeAt, cap);
      if (Math.abs(audio.currentTime - at) > 0.3) audio.currentTime = at;
    }
    render();
    updatePositionState();
  });

  audio.addEventListener('timeupdate', () => {
    if (!srcMatches()) return;
    position = audio.currentTime;
    render();
    updatePositionState();
    const now = Date.now();
    if (now - lastPersist > 1000) {
      lastPersist = now;
      persist();
    }
  });

  audio.addEventListener('seeked', () => {
    if (!srcMatches()) return;
    position = audio.currentTime;
    resumeAt = position;
    render();
    updatePositionState();
  });

  audio.addEventListener('play', () => {
    if (player.dataset.state === 'closed') return;
    openPlayer('playing');
    setPlaybackState('playing');
  });

  audio.addEventListener('pause', () => {
    if (advancing || player.dataset.state === 'closed' || player.hidden) return;
    if (srcMatches() && Number.isFinite(audio.currentTime)) position = audio.currentTime;
    resumeAt = position;
    openPlayer('paused');
    persist();
    updatePositionState();
    setPlaybackState('paused');
  });

  audio.addEventListener('ended', () => {
    if (index >= tracks.length - 1) {
      position = Number.isFinite(audio.duration) ? audio.duration : position;
      resumeAt = position;
      openPlayer('paused');
      render();
      persist();
      updatePositionState();
      setPlaybackState('paused');
      return;
    }
    index += 1;
    position = 0;
    resumeAt = 0;
    render();
    persist();
    updateMetadata();
    beginPlayback();
  });

  window.addEventListener('pagehide', persist);
  window.addEventListener('resize', syncBarHeight);
  window.addEventListener('load', syncBarHeight);
  document.fonts?.ready.then(() => syncBarHeight()).catch(() => undefined);

  function onToggle(): void {
    if (player.dataset.state === 'playing') {
      audio.pause();
      return;
    }
    beginPlayback();
  }

  function onNext(): void {
    if (index >= tracks.length - 1) return;
    goTo(index + 1, 0, player.dataset.state === 'playing');
  }

  function onPrevious(): void {
    if (index === 0) {
      goTo(0, 0, player.dataset.state === 'playing');
      return;
    }
    goTo(index - 1, 0, player.dataset.state === 'playing');
  }

  function onClose(): void {
    if (srcMatches() && Number.isFinite(audio.currentTime)) position = audio.currentTime;
    resumeAt = position;
    player.dataset.state = 'closed';
    player.hidden = true;
    document.documentElement.removeAttribute('data-audio-player');
    audio.pause();
    persist();
    setPlaybackState('paused');
  }

  function listenFrom(anchor: string): void {
    const next = tracks.findIndex((track) => track.anchor === anchor);
    if (next < 0) return;
    goTo(next, 0, true);
  }

  function goTo(nextIndex: number, nextPosition: number, shouldPlay: boolean): void {
    if (nextIndex < 0 || nextIndex >= tracks.length) return;
    const changed = nextIndex !== index;
    index = nextIndex;
    position = nextPosition;
    resumeAt = nextPosition;
    render();
    persist();
    updateMetadata();
    if (shouldPlay) {
      beginPlayback();
      return;
    }
    if (changed && audio.currentSrc) {
      advancing = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      advancing = false;
    } else if (srcMatches() && audio.readyState >= 1) {
      audio.currentTime = 0;
    }
    if (player.dataset.state !== 'closed') openPlayer('paused');
  }

  function beginPlayback(): void {
    const url = absoluteSrc(tracks[index].filename);
    if (audio.currentSrc !== url) {
      advancing = true;
      audio.src = url;
      advancing = false;
    } else if (audio.readyState >= 1 && Number.isFinite(audio.duration)) {
      const cap = Math.max(0, audio.duration - 0.05);
      audio.currentTime = Math.min(resumeAt, cap);
    }
    openPlayer('playing');
    updateMetadata();
    const pending = audio.play();
    pending.catch(() => {
      openPlayer('paused');
      setPlaybackState('paused');
    });
  }

  function openPlayer(state: 'playing' | 'paused'): void {
    player.hidden = false;
    player.dataset.state = state;
    document.documentElement.setAttribute('data-audio-player', 'open');
    toggle.setAttribute('aria-label', state === 'playing' ? 'Pause narration' : 'Play narration');
    syncBarHeight();
  }

  function render(): void {
    const track = tracks[index];
    const duration = displayedDuration(track);
    title.textContent = track.heading;
    elapsed.textContent = formatClock(position);
    total.textContent = formatClock(duration);
    const percent = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
    progress.style.setProperty('--ap-progress', `${percent.toFixed(2)}%`);
    progress.setAttribute('aria-valuenow', String(Math.round(percent)));
    progress.setAttribute('aria-valuetext', `${formatClock(position)} of ${formatClock(duration)}`);
    for (const button of document.querySelectorAll<HTMLElement>('[data-audio-listen]')) {
      if (track.anchor && button.getAttribute('data-audio-anchor') === track.anchor) {
        button.setAttribute('aria-current', 'true');
      } else {
        button.removeAttribute('aria-current');
      }
    }
  }

  function displayedDuration(track: NarrationTrack): number {
    if (srcMatches() && Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    return track.duration_seconds;
  }

  function srcMatches(): boolean {
    return audio.currentSrc === absoluteSrc(tracks[index].filename);
  }

  function persist(): void {
    const point: ResumePoint = {
      index,
      position: Math.round(Math.max(0, position) * 10) / 10,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(point));
    } catch {
      /* Private browsing can reject storage; playback still works for this view. */
    }
  }

  function syncBarHeight(): void {
    if (player.hidden || player.dataset.state === 'idle' || player.dataset.state === 'closed') return;
    const height = Math.ceil(player.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty('--ap-h', `${height}px`);
  }

  function updateMetadata(): void {
    const session = navigator.mediaSession;
    if (!session) return;
    const track = tracks[index];
    session.metadata = new MediaMetadata({
      title: track.heading,
      artist: narrationArtist,
      artwork: siteArtwork(),
    });
  }

  function updatePositionState(): void {
    const session = navigator.mediaSession;
    if (!session?.setPositionState) return;
    const duration = displayedDuration(tracks[index]);
    if (!Number.isFinite(duration) || duration <= 0) return;
    const at = Math.min(Math.max(0, position), duration);
    try {
      session.setPositionState({
        duration,
        playbackRate: audio.playbackRate || 1,
        position: at,
      });
    } catch {
      /* Rejected while the element is still resolving duration. */
    }
  }

  function setPlaybackState(state: 'playing' | 'paused'): void {
    const session = navigator.mediaSession;
    if (session) session.playbackState = state;
  }

  function seekTo(seconds: number, fast: boolean): void {
    const duration = displayedDuration(tracks[index]);
    position = Math.min(Math.max(0, seconds), duration);
    resumeAt = position;
    if (srcMatches() && audio.readyState >= 1 && Number.isFinite(audio.duration)) {
      const at = Math.min(position, audio.duration);
      if (fast && typeof audio.fastSeek === 'function') audio.fastSeek(at);
      else audio.currentTime = at;
    }
    render();
    persist();
    updatePositionState();
  }

  function registerMediaSession(): void {
    const session = navigator.mediaSession;
    if (!session) return;
    updateMetadata();
    const bind = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        /* This browser does not support the action. */
      }
    };
    bind('play', () => {
      if (audio.paused) beginPlayback();
    });
    bind('pause', () => {
      if (!audio.paused) audio.pause();
    });
    bind('nexttrack', () => {
      onNext();
    });
    bind('previoustrack', () => {
      onPrevious();
    });
    bind('seekto', (details) => {
      if (details.seekTime == null) return;
      seekTo(details.seekTime, Boolean(details.fastSeek));
    });
    bind('seekbackward', (details) => {
      const base = srcMatches() && Number.isFinite(audio.currentTime) ? audio.currentTime : position;
      seekTo(base - (details.seekOffset ?? SEEK_STEP), false);
    });
    bind('seekforward', (details) => {
      const base = srcMatches() && Number.isFinite(audio.currentTime) ? audio.currentTime : position;
      seekTo(base + (details.seekOffset ?? SEEK_STEP), false);
    });
  }
}

function readResume(tracks: readonly NarrationTrack[]): ResumePoint | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { index?: unknown; position?: unknown };
    if (typeof parsed.index !== 'number' || !Number.isInteger(parsed.index)) return null;
    if (parsed.index < 0 || parsed.index >= tracks.length) return null;
    if (typeof parsed.position !== 'number' || !Number.isFinite(parsed.position) || parsed.position < 0) {
      return null;
    }
    const duration = tracks[parsed.index]?.duration_seconds ?? 0;
    return { index: parsed.index, position: Math.min(parsed.position, Math.max(0, duration)) };
  } catch {
    return null;
  }
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function absoluteSrc(filename: string): string {
  return new URL(narrationSrc(filename), document.baseURI).href;
}

function siteArtwork(): MediaImage[] {
  return [
    { src: new URL('/favicon-32.png', document.baseURI).href, sizes: '32x32', type: 'image/png' },
    { src: new URL('/apple-touch-icon.png', document.baseURI).href, sizes: '180x180', type: 'image/png' },
    { src: new URL('/icon-512.png', document.baseURI).href, sizes: '512x512', type: 'image/png' },
  ];
}
