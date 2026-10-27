#!/usr/bin/env python3
"""Automated checks for a generated multi-voice narration. Makes no network calls and spends nothing.

Usage (from repo root; ffprobe on PATH; run `npm run build` first for the anchor and dist checks):
  python3 scripts/narration/check-audio.py src/data/narration/physiologically-difficult-airway.map.json [--json OUT]

Confirms that:
  1. every mapped section has exactly one track, in map order, read by the mapped narrator's voice;
  2. the lock still matches the published chapter (no prose omitted, duplicated or reordered), and each
     track's source hash matches its section in the lock;
  3. every audio file exists, decodes as audio, and has a positive, plausible duration for its text;
  4. every listening anchor resolves on the built page;
  5. neither the repository nor the build output calls ElevenLabs at runtime or contains the API key.
Exits non-zero if any check fails.
"""
import argparse, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import ROOT, build, lock_path, manifest_path, read_manifest  # noqa: E402

REGISTRY = os.path.join(ROOT, 'src/data/narration/elevenlabs-voices.json')
# Spoken English narration runs at roughly 12-18 characters a second; allow a wide margin.
CHARS_PER_SECOND = (8, 25)
SKIP = {'.git', 'node_modules', '.astro', '.vercel', '.wrangler', 'coverage', '__pycache__'}
# Only the offline generator (and these checks) may name the ElevenLabs API.
OFFLINE = {'scripts/narration/elevenlabs.py', 'scripts/narration/check-audio.py'}


def probe(path: str) -> dict:
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name',
                          '-of', 'json', path], capture_output=True, text=True)
    return json.loads(out.stdout or '{}') if out.returncode == 0 else {}


def decodes(path: str) -> bool:
    return subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', path, '-f', 'null', '-'],
                          capture_output=True).returncode == 0


def text_files(top: str):
    for dirpath, dirnames, filenames in os.walk(top):
        dirnames[:] = [d for d in dirnames if d not in SKIP]
        for name in filenames:
            path = os.path.join(dirpath, name)
            if name.endswith(('.mp3', '.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2', '.ico', '.pdf')):
                continue
            try:
                if os.path.getsize(path) > 20_000_000:
                    continue
                yield path, open(path, 'rb').read()
            except OSError:
                continue


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('map')
    ap.add_argument('--json', help='write the results here')
    args = ap.parse_args()

    narration_map = json.load(open(args.map))
    slug = os.path.splitext(os.path.basename(narration_map['case']))[0]
    manifest = read_manifest(manifest_path(narration_map), slug)
    registry = json.load(open(REGISTRY))['voices']
    lock, plan = build(args.map)
    committed_lock = json.load(open(lock_path(args.map)))
    tracks = manifest['tracks']
    results = []

    def record(name: str, ok: bool, detail=''):
        results.append(dict(check=name, ok=bool(ok), detail=detail))
        print(f"{'PASS' if ok else 'FAIL'} {name}{': ' + str(detail) if detail else ''}")

    # 1. Each mapped section exactly once, in order, with the mapped narrator and voice.
    keys = [s['key'] for s in narration_map['sections']]
    names = [os.path.splitext(t['filename'])[0] for t in tracks]
    record('every section has exactly one track, in order', names == keys,
           '' if names == keys else f'expected {keys}, got {names}')
    wrong = [t['filename'] for t, s in zip(tracks, narration_map['sections'])
             if t.get('narrator') != registry[s['narrator']]['character']
             or t.get('voice_id') != registry[s['narrator']]['voiceId']
             or t.get('model_id') != narration_map['model'] or t.get('anchor') != s['anchor']]
    record('each track uses its mapped narrator, voice, model and anchor', not wrong, wrong or '')

    # 2. Source hashes: the chapter is unchanged since generation and each track matches its section.
    record('lock matches the published chapter and pronunciation rules', lock == committed_lock)
    record('manifest chapter hash matches the lock', manifest.get('caseSha256') == lock['caseSha256'])
    by_key = {s['key']: s for s in lock['sections']}
    stale = [t['filename'] for t in tracks
             if by_key.get(os.path.splitext(t['filename'])[0], {}).get('verbatimSha256') != t.get('source_sha256')
             or by_key.get(os.path.splitext(t['filename'])[0], {}).get('synthesisSha256') != t.get('synthesis_sha256')]
    record('each track source hash matches its section text', not stale, stale or '')
    verbatim = '\n\n'.join(p for s in plan for p in s['verbatim'])
    paragraphs = [p for s in plan for p in s['verbatim']]
    record('sections cover the chapter prose once, in order',
           sum(s['verbatimChars'] for s in lock['sections']) + 2 * (len(plan) - 1) == len(verbatim)
           and len(paragraphs) == sum(s['paragraphs'] for s in lock['sections']))

    # 3. Audio exists in the map's own folder, decodes, and has a plausible duration for its text.
    expected_dir = narration_map.get('audioDir', slug)
    record('manifest serves the map\'s audio folder', manifest['dir'] == expected_dir,
           '' if manifest['dir'] == expected_dir else f"{manifest['dir']} != {expected_dir}")
    audio_dir = os.path.join(ROOT, 'public/audio', manifest['dir'])
    bad = []
    for t in tracks:
        path = os.path.join(audio_dir, t['filename'])
        info = probe(path) if os.path.exists(path) else {}
        streams = info.get('streams', [])
        seconds = float(info.get('format', {}).get('duration', 0) or 0)
        chars = by_key[os.path.splitext(t['filename'])[0]]['synthesisChars']
        rate = chars / seconds if seconds else 0
        problems = []
        if not streams or streams[0].get('codec_type') != 'audio':
            problems.append('not audio')
        elif not decodes(path):
            problems.append('decode errors')
        if seconds <= 0 or not CHARS_PER_SECOND[0] <= rate <= CHARS_PER_SECOND[1]:
            problems.append(f'{seconds:.1f}s for {chars} chars ({rate:.1f} chars/s)')
        if abs(seconds - t['duration_seconds']) > 0.2:
            problems.append(f"manifest says {t['duration_seconds']}s, file is {seconds:.1f}s")
        if problems:
            bad.append(f"{t['filename']}: {', '.join(problems)}")
    extra = sorted(set(os.listdir(audio_dir)) - {t['filename'] for t in tracks}) if os.path.isdir(audio_dir) else []
    record('audio files exist, decode, and have plausible durations', not bad, bad or '')
    record('no unlisted files in the audio folder', not extra, extra or '')

    # 4. Listening anchors resolve on the built page.
    page_path = os.path.join(ROOT, 'dist/cases', slug, 'index.html')
    if os.path.exists(page_path):
        page = open(page_path, encoding='utf-8').read()
        anchors = [t['anchor'] for t in tracks if t['anchor']]
        missing = [a for a in anchors if f'id="{a}"' not in page]
        buttons = re.findall(r'data-audio-anchor="([^"]+)"', page)
        record('every listening anchor resolves on the built page', not missing, missing or '')
        record('one "Listen from here" control per anchored track', buttons == anchors,
               '' if buttons == anchors else f'buttons {buttons}')
        built = os.path.join(ROOT, 'dist/audio', manifest['dir'])
        unshipped = [t['filename'] for t in tracks if not os.path.exists(os.path.join(built, t['filename']))]
        record('every track is in the build output', not unshipped, unshipped or '')
    else:
        record('built page present for anchor checks (run npm run build)', False, page_path)

    # 5. No runtime ElevenLabs calls and no key in the repository or the build output.
    key = os.environ.get('ELEVENLABS_API_KEY', '').strip().encode()
    calls, leaks = [], []
    for path, data in text_files(ROOT):
        rel = os.path.relpath(path, ROOT)
        if key and len(key) >= 16 and key in data:
            leaks.append(rel)  # never print the key itself
        if rel not in OFFLINE and re.search(rb'api\.elevenlabs\.io|xi-api-key|elevenlabs\.io/v1', data, re.I):
            calls.append(rel)
    record('no ElevenLabs API calls outside the offline generator', not calls, calls or '')
    record('ELEVENLABS_API_KEY value not present in the repository or dist' + ('' if key else ' (key not set; skipped)'),
           not leaks, leaks or '')

    total = sum(t['duration_seconds'] for t in tracks)
    print(f'{len(tracks)} tracks, {total:.1f} seconds ({total / 60:.1f} minutes)')
    if args.json:
        open(args.json, 'w').write(json.dumps(dict(results=results, tracks=len(tracks), seconds=round(total, 1)),
                                              indent=2) + '\n')
    if not all(r['ok'] for r in results):
        sys.exit(1)


if __name__ == '__main__':
    main()
