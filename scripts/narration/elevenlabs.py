#!/usr/bin/env python3
"""Offline multi-voice narration with the user's saved ElevenLabs voices. Never run by the website.

Usage (from repo root; ffmpeg and ffprobe on PATH; the key comes only from the environment):
  export ELEVENLABS_API_KEY=...            # never pass it as an argument or write it to a file
  python3 scripts/narration/elevenlabs.py check    MAP [--json OUT]
  python3 scripts/narration/elevenlabs.py estimate MAP [--balance]
  python3 scripts/narration/elevenlabs.py sample   MAP --narrator KEY --out FILE.mp3 [--chars 450]
  python3 scripts/narration/elevenlabs.py generate MAP --confirm [--only KEY ...]

check     confirms every registry voice exists and its name matches the character, that the map's
          model is available for text to speech, and reports the subscription balance.
estimate  counts synthesis characters and requests for the whole chapter (no paid calls).
sample    synthesizes the first sentences of the narrator's first section, up to --chars.
generate  synthesizes every section (or --only), writes public/audio/<slug>/<key>.mp3 and the
          track manifest. It refuses to run without --confirm and stops before spending if a
          voice fails the check or the balance does not cover the uncached characters.

Each request is cached by the SHA-256 of model, voice, output format and text under --cache
(outside the repository by default), so re-running never pays twice for unchanged text.
Voices are used with their saved settings; nothing is cloned, edited or substituted.
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import ROOT, build  # noqa: E402

API = 'https://api.elevenlabs.io'
REGISTRY = os.path.join(ROOT, 'src/data/narration/elevenlabs-voices.json')
OUTPUT_FORMAT = 'mp3_44100_128'
MAX_REQUEST_CHARS = 2500  # well under the model's per-request limit, and short enough to hold prosody
PAUSE_SECONDS = 0.8  # silence between requests within one section
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


def synthesize(model_id: str, voice_id: str, text: str, cache_dir: str) -> tuple[str, int | None, bool]:
    """Path to the cached MP3 for text, the billed character count, and whether it was a cache hit."""
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, cache_key(model_id, voice_id, text) + '.mp3')
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path, None, True
    status, headers, raw = request('POST', f'/v1/text-to-speech/{voice_id}?output_format={OUTPUT_FORMAT}',
                                   dict(text=text, model_id=model_id))
    if status != 200 or not raw.startswith((b'ID3', b'\xff\xfb', b'\xff\xf3', b'\xff\xf2')):
        sys.exit(f'text-to-speech failed for voice {voice_id}: {status} {raw[:300].decode(errors="replace")}')
    tmp = path + '.part'
    open(tmp, 'wb').write(raw)
    os.replace(tmp, path)
    billed = headers.get('x-character-count') or headers.get('character-cost')
    return path, int(billed) if billed else None, False


def duration(path: str) -> float:
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                                capture_output=True, text=True, check=True).stdout)


def render(parts: list[str], out: str):
    """Join request MP3s with short pauses, normalize loudness, and write a mono MP3."""
    with tempfile.TemporaryDirectory() as tmp:
        inputs, filters = [], []
        for i, part in enumerate(parts):
            inputs += ['-i', part]
            filters.append(f'[{i}:a]aresample=44100,aformat=channel_layouts=mono[a{i}]')
        n = len(parts)
        silence = f'anullsrc=r=44100:cl=mono,atrim=duration={PAUSE_SECONDS}'
        joined = ''.join(f'[a{i}]' + (f'[s{i}]' if i < n - 1 else '') for i in range(n))
        filters += [f'{silence}[s{i}]' for i in range(n - 1)]
        filters.append(f'{joined}concat=n={2 * n - 1}:v=0:a=1,loudnorm=I=-17:TP=-1.5[out]')
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *inputs, '-filter_complex', ';'.join(filters),
                        '-map', '[out]', '-ac', '1', '-ar', '44100', '-b:a', '96k', '-map_metadata', '-1',
                        os.path.join(tmp, 'out.mp3')], check=True)
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
    part, billed, hit = synthesize(narration_map['model'], voice_for(args.narrator), text, args.cache)
    render([part], args.out)
    print(json.dumps(dict(narrator=args.narrator, section=section['key'], chars=len(text), billed=billed,
                          cached=hit, seconds=round(duration(args.out), 1), out=args.out, text=text)))


def cmd_generate(args, narration_map, plan):
    if not args.confirm:
        sys.exit('generate synthesizes the whole chapter and spends credits; rerun with --confirm')
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
    out_dir = os.path.join(ROOT, 'public/audio', slug)
    manifest_path = os.path.join(ROOT, 'src/data', f'{slug}-audio.json')
    old = {t['filename']: t for t in json.load(open(manifest_path))} if os.path.exists(manifest_path) else {}
    registry = json.load(open(REGISTRY))['voices']
    before = subscription()['character_count']
    manifest, billed_total = [], 0
    for i, (s, req) in enumerate(zip(plan, plan_requests(plan))):
        filename = f"{s['key']}.mp3"
        heading = s['verbatim'][0]
        if req not in todo or s['narrator'] in blocked:
            if s['narrator'] in blocked:
                print(f"HOLD {s['key']}: voice {s['narrator']} failed the check; not substituting", flush=True)
            if filename in old:
                manifest.append(old[filename])
            continue
        parts = []
        for text in req['requests']:
            part, billed, _ = synthesize(model_id, voice_for(s['narrator']), text, args.cache)
            billed_total += billed or 0
            parts.append(part)
        out = os.path.join(out_dir, filename)
        render(parts, out)
        manifest.append(dict(index=i, heading=heading, anchor=s['anchor'], filename=filename,
                             duration_seconds=round(duration(out), 1), narrator=registry[s['narrator']]['character']))
        print(filename, manifest[-1]['duration_seconds'], flush=True)
    open(manifest_path, 'w').write(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(f"billed {billed_total} characters by response header; subscription character_count "
          f"{before} -> {subscription()['character_count']} (the account count can lag by a minute)")
    if blocked:
        sys.exit(f'held sections for voices {sorted(blocked)}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('command', choices=['check', 'estimate', 'sample', 'generate'])
    ap.add_argument('map')
    ap.add_argument('--json', help='check: write the full result here')
    ap.add_argument('--balance', action='store_true', help='estimate: compare with the subscription balance')
    ap.add_argument('--narrator', help='sample: registry key')
    ap.add_argument('--chars', type=int, default=450, help='sample: maximum characters (about 30 seconds)')
    ap.add_argument('--out', help='sample: output MP3')
    ap.add_argument('--confirm', action='store_true', help='generate: spend credits on the whole chapter')
    ap.add_argument('--only', nargs='*', help='generate: section keys to render; others keep their manifest entries')
    ap.add_argument('--cache', default=DEFAULT_CACHE)
    args = ap.parse_args()
    _, plan = build(args.map)
    narration_map = json.load(open(args.map))
    dict(check=cmd_check, estimate=cmd_estimate, sample=cmd_sample, generate=cmd_generate)[args.command](
        args, narration_map, plan)


if __name__ == '__main__':
    main()
