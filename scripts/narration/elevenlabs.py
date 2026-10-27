#!/usr/bin/env python3
"""Offline multi-voice narration with the user's saved ElevenLabs voices. Never run by the website.

Usage (from repo root; ffmpeg and ffprobe on PATH; the key comes only from the environment):
  export ELEVENLABS_API_KEY=...            # never pass it as an argument or write it to a file
  python3 scripts/narration/elevenlabs.py check    MAP [--json OUT]
  python3 scripts/narration/elevenlabs.py estimate MAP [--balance]
  python3 scripts/narration/elevenlabs.py balance  MAP
  python3 scripts/narration/elevenlabs.py sample   MAP --narrator KEY --out FILE.mp3 [--chars 450] [--balance-floor N]
  python3 scripts/narration/elevenlabs.py generate MAP --confirm [--only KEY ...] [--balance-floor N [--floor-rate R]]

check     confirms every registry voice exists and its name matches the character, that the map's
          model is available for text to speech, and reports the subscription balance.
estimate  counts synthesis characters and requests for the whole chapter (no paid calls).
balance   prints the subscription balance as JSON (character_count, character_limit, remaining).
sample    synthesizes the first sentences of the narrator's first section, up to --chars.
generate  synthesizes every section (or --only), writes public/audio/<audioDir>/<key>.mp3 and the
          track manifest named by the map's "manifest" (default src/data/<case>-audio.json). An existing
          manifest may be the structured object or an older plain array of tracks. Failed requests are
          retried; finished ones stay cached, so a rerun pays only for what failed. It refuses to run without --confirm and stops before spending if a
          voice fails the check or the balance does not cover the uncached characters.

--balance-floor N is a hard spending floor. Before every uncached request the balance is read again,
and the request is refused if the remaining credits, less the request's full character count (the
worst case of one credit per character), would fall below N. The remaining credits used are the lower
of the account's figure and the starting balance less everything this run has sent (billed header, or
the character count when no header comes back), so a lagging account figure cannot let a request
through. --floor-rate R (default 1) is the credits per character that check assumes; a lower value
(e.g. 0.44, the measured eleven_multilingual_v2 rate) turns it into an expected-cost check. Use it only
for a single, owner-approved request whose worst case would cross the floor but whose expected cost
would not. A refused generate keeps every finished track and cached request, writes the manifest with
what is complete, and exits non-zero; rerunning resumes from the cache.

Each request is cached by the SHA-256 of model, voice, output format and text under --cache
(outside the repository by default), so re-running never pays twice for unchanged text.
Voices are used with their saved settings; nothing is cloned, edited or substituted.
"""
import argparse, hashlib, json, math, os, re, subprocess, sys, tempfile, time, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import ROOT, build, manifest_path, read_manifest, sha256  # noqa: E402

API = 'https://api.elevenlabs.io'
REGISTRY = os.path.join(ROOT, 'src/data/narration/elevenlabs-voices.json')
OUTPUT_FORMAT = 'mp3_44100_128'
MAX_REQUEST_CHARS = 2500  # well under the model's per-request limit, and short enough to hold prosody
PAUSE_SECONDS = 0.8  # silence between requests within one section
LEAD_SECONDS, TAIL_SECONDS = 0.4, 0.9  # padding at the start and end of each track: the pause between sections
LOUDNESS = dict(I=-17, TP=-1.5, LRA=11)  # matches the existing cardiac-arrest and shock tracks (about -17 to -19 LUFS)
DEESS = 'deesser=i=0.35:m=0.4:f=0.5'  # gentle; synthetic voices can be bright on sibilants
TRIM = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05'
RETRIES = 3
DEFAULT_CACHE = os.path.join(os.path.expanduser('~'), '.cache', 'rfp-narration', 'elevenlabs')


def api_key() -> str:
    key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    if not key:
        sys.exit('ELEVENLABS_API_KEY is not set')
    return key


def request(method: str, path: str, body: dict | None = None) -> tuple[int, dict, bytes]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={'xi-api-key': api_key(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()
    except urllib.error.HTTPError as err:
        return err.code, {k.lower(): v for k, v in err.headers.items()}, err.read()
    except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
        return 0, {}, str(err).encode()


def get_json(path: str) -> tuple[int, dict | list]:
    status, _, raw = request('GET', path)
    try:
        return status, json.loads(raw)
    except ValueError:
        return status, {'raw': raw[:300].decode(errors='replace')}


def normalize(name: str) -> str:
    """Case, quotes and punctuation do not count: 'Margaret "Mags" Callahan' ~ 'Margaret “Mags” Callahan'."""
    return ' '.join(re.findall(r'[a-z0-9]+', name.lower()))


def name_matches(character: str, returned: str) -> bool:
    """The returned name, without its ' - The Role' description, must spell the character exactly."""
    return normalize(re.split(r'\s+[-–—]\s+', returned, maxsplit=1)[0]) == normalize(character)


def subscription() -> dict:
    status, sub = get_json('/v1/user/subscription')
    if status != 200:
        sys.exit(f'GET /v1/user/subscription failed: {status} {sub}')
    sub['remaining'] = sub['character_limit'] - sub['character_count']
    return sub


def check(model_id: str, narrators: set[str]) -> dict:
    registry = json.load(open(REGISTRY))['voices']
    voices = []
    for key, v in registry.items():
        status, body = get_json(f"/v1/voices/{v['voiceId']}")
        returned = body.get('name') if status == 200 else None
        voices.append(dict(key=key, character=v['character'], voiceId=v['voiceId'], status=status,
                           returnedName=returned, category=body.get('category') if status == 200 else None,
                           nameMatches=bool(returned) and name_matches(v['character'], returned),
                           usedInChapter=key in narrators,
                           error=None if status == 200 else body.get('detail', body)))
    status, models = get_json('/v1/models')
    model = next((m for m in models if m.get('model_id') == model_id), None) if status == 200 else None
    model_info = dict(model_id=model_id, listed=model is not None,
                      can_do_text_to_speech=bool(model and model.get('can_do_text_to_speech')),
                      name=model and model.get('name'),
                      max_characters_request_subscribed_user=model and model.get('max_characters_request_subscribed_user'),
                      character_cost_multiplier=model and (model.get('model_rates') or {}).get('character_cost_multiplier'),
                      status=status)
    sub = subscription()
    return dict(voices=voices, model=model_info,
                subscription={k: sub.get(k) for k in ('tier', 'status', 'character_count', 'character_limit',
                                                      'remaining', 'next_character_count_reset_unix',
                                                      'can_extend_character_limit')})


def sentences(text: str) -> list[str]:
    return re.split(r'(?<=[.?!])\s+(?=[A-Z0-9"])', text)


def chunks(paragraphs: list[str], limit: int = MAX_REQUEST_CHARS) -> list[str]:
    """Group whole paragraphs into requests; split an oversized paragraph only at sentence ends."""
    pieces = []
    for p in paragraphs:
        if len(p) <= limit:
            pieces.append(p)
            continue
        current = ''
        for s in sentences(p):
            if current and len(current) + 1 + len(s) > limit:
                pieces.append(current)
                current = s
            else:
                current = f'{current} {s}'.strip()
        pieces.append(current)
    out, current = [], ''
    for piece in pieces:
        if current and len(current) + 2 + len(piece) > limit:
            out.append(current)
            current = piece
        else:
            current = f'{current}\n\n{piece}' if current else piece
    return out + ([current] if current else [])


def cache_key(model_id: str, voice_id: str, text: str) -> str:
    return hashlib.sha256(json.dumps([model_id, voice_id, OUTPUT_FORMAT, 'saved-settings', text]).encode()).hexdigest()


class FloorReached(Exception):
    """A paid request was refused because it could take the balance below --balance-floor."""


class Guard:
    """Refuses any paid request that could leave fewer than `floor` credits (None: no floor)."""

    def __init__(self, floor: int | None, rate: float = 1.0):
        self.floor, self.rate, self.start, self.spent = floor, rate, None, 0

    def allow(self, chars: int):
        if self.floor is None:
            return
        remaining = subscription()['remaining']
        if self.start is None:
            self.start = remaining
        remaining = min(remaining, self.start - self.spent)
        cost = math.ceil(chars * self.rate)
        if remaining - cost < self.floor:
            raise FloorReached(f'refused a {chars}-character request: {remaining} remaining - {cost} '
                               f'< floor {self.floor}')

    def charge(self, billed: int | None, chars: int):
        self.spent += billed if billed is not None else chars


def synthesize(model_id: str, voice_id: str, text: str, cache_dir: str,
               guard: Guard | None = None) -> tuple[str, int | None, bool]:
    """Path to the cached MP3 for text, the billed character count, and whether it was a cache hit."""
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, cache_key(model_id, voice_id, text) + '.mp3')
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path, None, True
    if guard:
        guard.allow(len(text))
    for attempt in range(1, RETRIES + 1):
        if guard and attempt > 1:
            guard.allow(len(text))  # a failed attempt may still have been billed
        status, headers, raw = request('POST', f'/v1/text-to-speech/{voice_id}?output_format={OUTPUT_FORMAT}',
                                       dict(text=text, model_id=model_id))
        if guard:
            billed = headers.get('x-character-count') or headers.get('character-cost')
            # Count a failed attempt at full length: it may have been billed without saying so.
            guard.charge(int(billed) if status == 200 and billed else None, len(text))
        if status == 200 and raw.startswith((b'ID3', b'\xff\xfb', b'\xff\xf3', b'\xff\xf2')):
            break
        # Only rate limits, server errors and network failures are worth retrying.
        if attempt == RETRIES or not (status == 0 or status == 429 or status >= 500):
            raise RuntimeError(f'text-to-speech failed for voice {voice_id}: {status} {raw[:300].decode(errors="replace")}')
        time.sleep(5 * attempt)
    tmp = path + '.part'
    open(tmp, 'wb').write(raw)
    os.replace(tmp, path)
    billed = headers.get('x-character-count') or headers.get('character-cost')
    return path, int(billed) if billed else None, False


def duration(path: str) -> float:
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                                capture_output=True, text=True, check=True).stdout)


def ffmpeg(*args: str) -> str:
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-y', *args], capture_output=True, text=True,
                          check=True).stderr


def render(parts: list[str], out: str):
    """Join request MP3s into one track and write a mono MP3.

    Each request is trimmed of leading and trailing silence and joined with a short pause. The track is
    gently de-essed, padded so consecutive sections have a short pause between them, and loudness
    normalized in two passes (measure, then apply linearly) so every narrator plays at the same level.
    """
    with tempfile.TemporaryDirectory() as tmp:
        inputs, filters = [], []
        for i, part in enumerate(parts):
            inputs += ['-i', part]
            filters.append(f'[{i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono,'
                           f'{TRIM},areverse,{TRIM},areverse[a{i}]')
        n = len(parts)
        silence = f'anullsrc=r=44100:cl=mono,atrim=duration={PAUSE_SECONDS}'
        joined = ''.join(f'[a{i}]' + (f'[s{i}]' if i < n - 1 else '') for i in range(n))
        filters += [f'{silence}[s{i}]' for i in range(n - 1)]
        filters.append(f'{joined}concat=n={2 * n - 1}:v=0:a=1,{DEESS},'
                       f'adelay={int(LEAD_SECONDS * 1000)}:all=1,apad=pad_dur={TAIL_SECONDS}[out]')
        joined_wav = os.path.join(tmp, 'joined.wav')
        ffmpeg(*inputs, '-filter_complex', ';'.join(filters), '-map', '[out]', '-ac', '1', joined_wav)
        target = ':'.join(f'{k}={v}' for k, v in LOUDNESS.items())
        log = ffmpeg('-i', joined_wav, '-af', f'loudnorm={target}:print_format=json', '-f', 'null', '-')
        m = json.loads(log[log.rindex('{'):log.rindex('}') + 1])
        second = (f"loudnorm={target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
                  f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
                  f"offset={m['target_offset']}:linear=true")
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        ffmpeg('-i', joined_wav, '-af', second, '-ar', '44100', '-ac', '1', '-b:a', '96k', '-map_metadata', '-1',
               os.path.join(tmp, 'out.mp3'))
        os.replace(os.path.join(tmp, 'out.mp3'), out)


def plan_requests(plan: list[dict]) -> list[dict]:
    return [dict(key=s['key'], narrator=s['narrator'], requests=chunks(s['synthesis'])) for s in plan]


def cmd_check(args, narration_map, plan):
    result = check(narration_map['model'], {s['narrator'] for s in plan})
    if args.json:
        open(args.json, 'w').write(json.dumps(result, indent=2) + '\n')
    for v in result['voices']:
        flag = 'ok' if v['status'] == 200 and v['nameMatches'] else 'FAIL'
        print(f"{flag:4} {v['key']:18} {v['voiceId']} {v['status']} {v['returnedName']!r}")
    print('model', json.dumps(result['model']))
    print('subscription', json.dumps(result['subscription']))
    return result


def cmd_estimate(args, narration_map, plan):
    requests = plan_requests(plan)
    total = sum(len(r) for s in requests for r in s['requests'])
    count = sum(len(s['requests']) for s in requests)
    for s in requests:
        print(f"{s['key']:28} {s['narrator']:18} {len(s['requests']):2} requests {sum(map(len, s['requests'])):6} chars")
    print(f'total {total} characters in {count} requests (largest {max(len(r) for s in requests for r in s["requests"])})')
    if args.balance:
        sub = subscription()
        print(f"tier {sub['tier']}: {sub['character_count']} of {sub['character_limit']} used, {sub['remaining']} remaining; "
              f"{'covers' if sub['remaining'] >= total else 'DOES NOT cover'} {total}")


def cmd_balance(args, narration_map, plan):
    sub = subscription()
    print(json.dumps({k: sub[k] for k in ('character_count', 'character_limit', 'remaining')}))


def voice_for(narrator: str) -> str:
    return json.load(open(REGISTRY))['voices'][narrator]['voiceId']


def cmd_sample(args, narration_map, plan):
    section = next(s for s in plan if s['narrator'] == args.narrator)
    text = ''
    for para in section['synthesis']:
        for s in sentences(para):
            sep = ' ' if text and not text.endswith('\n\n') else ''
            if text and len(text) + len(sep) + len(s) > args.chars:
                break
            text += sep + s
        else:
            text += '\n\n'
            continue
        break
    text = text.strip()
    status, body = get_json(f'/v1/voices/{voice_for(args.narrator)}')
    if status != 200:
        sys.exit(f'voice {args.narrator} is not accessible ({status}); not substituting')
    try:
        part, billed, hit = synthesize(narration_map['model'], voice_for(args.narrator), text, args.cache,
                                       Guard(args.balance_floor, args.floor_rate))
    except FloorReached as err:
        sys.exit(f'STOP {args.narrator}: {err}')
    render([part], args.out)
    print(json.dumps(dict(narrator=args.narrator, section=section['key'], chars=len(text), billed=billed,
                          cached=hit, seconds=round(duration(args.out), 1), out=args.out, text=text)))


def cmd_generate(args, narration_map, plan):
    if not args.confirm:
        sys.exit('generate synthesizes the whole chapter and spends credits; rerun with --confirm')
    lock, _ = build(args.map)
    slug = os.path.splitext(os.path.basename(narration_map['case']))[0]
    model_id = narration_map['model']
    status = check(model_id, {s['narrator'] for s in plan})
    blocked = {v['key'] for v in status['voices'] if v['usedInChapter'] and not (v['status'] == 200 and v['nameMatches'])}
    if not status['model']['can_do_text_to_speech']:
        sys.exit(f'model {model_id} is not available for text to speech')
    todo = [s for s in plan_requests(plan) if not args.only or s['key'] in args.only]
    uncached = sum(len(r) for s in todo if s['narrator'] not in blocked for r in s['requests']
                   if not os.path.exists(os.path.join(args.cache, cache_key(model_id, voice_for(s['narrator']), r) + '.mp3')))
    if uncached > status['subscription']['remaining']:
        sys.exit(f"{uncached} uncached characters exceed the {status['subscription']['remaining']} remaining")
    print(f'{uncached} uncached characters to synthesize', flush=True)
    guard = Guard(args.balance_floor, args.floor_rate)
    stopped = None
    audio_dir = narration_map.get('audioDir', slug)
    out_dir = os.path.join(ROOT, 'public/audio', audio_dir)
    out_manifest = manifest_path(narration_map)
    # Either manifest format can be read; only tracks already in this audio folder are kept, so an
    # older plain-array (Kokoro) manifest never lends its tracks to the new narration.
    previous = read_manifest(out_manifest, slug) if os.path.exists(out_manifest) else dict(dir=audio_dir, tracks=[])
    old = {t['filename']: t for t in previous['tracks']} if previous['dir'] == audio_dir else {}
    registry = json.load(open(REGISTRY))['voices']
    hashes = {s['key']: s for s in lock['sections']}
    before = status['subscription']['character_count']
    tracks, failed, billed_total = [], [], 0
    for i, (s, req) in enumerate(zip(plan, plan_requests(plan))):
        filename = f"{s['key']}.mp3"
        if req not in todo or s['narrator'] in blocked or stopped:
            if s['narrator'] in blocked:
                print(f"HOLD {s['key']}: voice {s['narrator']} failed the check; not substituting", flush=True)
            if filename in old:
                tracks.append(old[filename])
            continue
        parts = []
        try:
            for text in req['requests']:
                part, billed, _ = synthesize(model_id, voice_for(s['narrator']), text, args.cache, guard)
                billed_total += billed or 0
                parts.append(part)
        except FloorReached as err:
            # Spend nothing more; finished tracks and cached requests are kept for a later run.
            print(f"STOP {s['key']}: {err}", flush=True)
            stopped = s['key']
            if filename in old:
                tracks.append(old[filename])
            continue
        except RuntimeError as err:
            # Finished requests stay cached, so a rerun pays only for what failed.
            print(f"FAIL {s['key']}: {err}", flush=True)
            failed.append(s['key'])
            if filename in old:
                tracks.append(old[filename])
            continue
        out = os.path.join(out_dir, filename)
        render(parts, out)
        voice = registry[s['narrator']]
        tracks.append(dict(index=i, heading=s['verbatim'][0], anchor=s['anchor'], filename=filename,
                           duration_seconds=round(duration(out), 1), narrator=voice['character'],
                           narrator_key=s['narrator'], voice_id=voice['voiceId'], model_id=model_id,
                           source_sha256=hashes[s['key']]['verbatimSha256'],
                           synthesis_sha256=hashes[s['key']]['synthesisSha256'],
                           requests=len(parts)))
        print(filename, tracks[-1]['duration_seconds'], flush=True)
    manifest = {
        '$comment': 'Generated offline by scripts/narration/elevenlabs.py from the published chapter. '
                    'source_sha256 is the SHA-256 of the section\'s verbatim text (see the narration lock file).',
        'case': narration_map['case'], 'caseSha256': lock['caseSha256'],
        'pronunciationSha256': lock['pronunciationSha256'], 'dir': audio_dir, 'model_id': model_id,
        'tracks': tracks,
    }
    open(out_manifest, 'w').write(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(f"billed {billed_total} characters by response header; subscription character_count "
          f"{before} -> {subscription()['character_count']} (the account count can lag by a minute)")
    if stopped:
        sys.exit(f'stopped at {stopped} by --balance-floor {args.balance_floor}; finished tracks kept (rerun resumes)')
    if blocked or failed:
        sys.exit(f'held sections for voices {sorted(blocked)}; failed sections {failed} (rerun to retry)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('command', choices=['check', 'estimate', 'balance', 'sample', 'generate'])
    ap.add_argument('map')
    ap.add_argument('--json', help='check: write the full result here')
    ap.add_argument('--balance', action='store_true', help='estimate: compare with the subscription balance')
    ap.add_argument('--narrator', help='sample: registry key')
    ap.add_argument('--chars', type=int, default=450, help='sample: maximum characters (about 30 seconds)')
    ap.add_argument('--out', help='sample: output MP3')
    ap.add_argument('--confirm', action='store_true', help='generate: spend credits on the whole chapter')
    ap.add_argument('--only', nargs='*', help='generate: section keys to render; others keep their manifest entries')
    ap.add_argument('--balance-floor', type=int, default=None,
                    help='sample, generate: refuse any request that could leave fewer remaining credits than this')
    ap.add_argument('--floor-rate', type=float, default=1.0,
                    help='sample, generate: credits per character the floor check assumes (default 1, the worst case)')
    ap.add_argument('--cache', default=DEFAULT_CACHE)
    args = ap.parse_args()
    _, plan = build(args.map)
    narration_map = json.load(open(args.map))
    dict(check=cmd_check, estimate=cmd_estimate, balance=cmd_balance, sample=cmd_sample, generate=cmd_generate)[args.command](
        args, narration_map, plan)


if __name__ == '__main__':
    main()
