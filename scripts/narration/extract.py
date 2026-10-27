#!/usr/bin/env python3
"""Deterministic narration text for a chapter, split by its narrator map (no network).

Usage (from repo root):
  python3 scripts/narration/extract.py src/data/narration/physiologically-difficult-airway.map.json \
      [--text-dir DIR] [--write-lock | --check-lock]

The verbatim text is the published prose: titles, body paragraphs and worked examples, the
title and summary, and the treatment steps. Questions, tables, figures and reference lists are
not read. Markdown links keep their text and bold markers are dropped; nothing else changes.
The pronunciation dictionary is applied only to the synthesis text, never to the verbatim text.

The lock file (<map>.lock.json, committed) records the case file hash and a hash of each
section's verbatim and synthesis text, so a later run can prove it read the published version.
"""
import argparse, hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PRONUNCIATION = os.path.join(ROOT, 'scripts/narration/pronunciation.json')
STEPS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']


def sha256(data: bytes | str) -> str:
    return hashlib.sha256(data.encode() if isinstance(data, str) else data).hexdigest()


def plain(text: str) -> str:
    """Markdown as displayed: link text without the URL, bold without the markers."""
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    text = text.replace('**', '')
    return re.sub(r'\s+', ' ', text).strip()


def load_rules(path: str = PRONUNCIATION):
    spec = json.load(open(path))
    return [(re.compile(r['match']), r['say']) for r in spec['rules']], re.compile(spec['unhandled'])


def speak(text: str, rules) -> str:
    compiled, unhandled = rules
    for pattern, say in compiled:
        text = pattern.sub(say, text)
    text = re.sub(r'\s+', ' ', text).strip()
    if text and text[-1] not in '.?!:':
        text += '.'  # headings end without punctuation and would otherwise run into the next sentence
    left = unhandled.findall(text)
    if left:
        sys.exit(f'unhandled symbols {sorted(set(left))} in: {text[:160]}')
    return text


def principle_paras(p) -> list[str]:
    paras = [p['title']] + p['body']
    ex = p.get('workedExample')
    if ex:
        paras += [ex['title']] + ex['body']
    return paras


def sections(narration_map: dict, case: dict) -> list[dict]:
    """Verbatim paragraphs per mapped section, after checking the map covers the chapter exactly."""
    by_id = {p['id']: p for p in case['principles']}
    mapped = [pid for s in narration_map['sections'] for pid in s['principles']]
    if mapped != [p['id'] for p in case['principles']]:
        missing = [p['id'] for p in case['principles'] if p['id'] not in mapped]
        extra = [pid for pid in mapped if pid not in by_id]
        dupes = sorted({pid for pid in mapped if mapped.count(pid) > 1})
        sys.exit(f'map does not cover the chapter once in order: missing={missing} unknown={extra} duplicated={dupes}')
    if sum(1 for s in narration_map['sections'] if s.get('intro')) != 1 or \
            sum(1 for s in narration_map['sections'] if s.get('treatment')) != 1:
        sys.exit('map needs exactly one intro section and one treatment section')
    out = []
    for s in narration_map['sections']:
        if s.get('intro'):
            paras = [case['title'], case['summary']]
        elif s.get('treatment'):
            paras = ['Approach to treatment'] + [
                f"Step {STEPS[i]}. {step['title']}. {step['action']} {step['why']}"
                for i, step in enumerate(case['treatmentApproach'])]
        else:
            paras = [para for pid in s['principles'] for para in principle_paras(by_id[pid])]
        out.append(dict(key=s['key'], label=s['label'], narrator=s['narrator'], anchor=s['anchor'],
                        principles=s['principles'], verbatim=[plain(p) for p in paras]))
    return out


def build(map_path: str) -> tuple[dict, list[dict]]:
    narration_map = json.load(open(map_path))
    case_path = os.path.join(ROOT, narration_map['case'])
    case_bytes = open(case_path, 'rb').read()
    case = json.loads(case_bytes)
    if case.get('contentStatus') != 'published':
        sys.exit(f"{narration_map['case']} is not published (contentStatus={case.get('contentStatus')!r})")
    rules = load_rules()
    plan = sections(narration_map, case)
    for s in plan:
        s['synthesis'] = [speak(p, rules) for p in s['verbatim']]
    lock = dict(
        case=narration_map['case'],
        caseSha256=sha256(case_bytes),
        pronunciationSha256=sha256(open(PRONUNCIATION, 'rb').read()),
        sections=[dict(key=s['key'], narrator=s['narrator'], anchor=s['anchor'],
                       paragraphs=len(s['verbatim']),
                       verbatimChars=len('\n\n'.join(s['verbatim'])),
                       verbatimSha256=sha256('\n\n'.join(s['verbatim'])),
                       synthesisChars=sum(len(p) for p in s['synthesis']),
                       synthesisSha256=sha256('\n\n'.join(s['synthesis'])))
                  for s in plan])
    return lock, plan


def lock_path(map_path: str) -> str:
    return re.sub(r'\.map\.json$', '', map_path) + '.lock.json'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('map')
    ap.add_argument('--text-dir', help='write <key>.verbatim.txt and <key>.synthesis.txt here')
    group = ap.add_mutually_exclusive_group()
    group.add_argument('--write-lock', action='store_true')
    group.add_argument('--check-lock', action='store_true')
    args = ap.parse_args()
    lock, plan = build(args.map)
    if args.text_dir:
        os.makedirs(args.text_dir, exist_ok=True)
        for s in plan:
            for kind in ('verbatim', 'synthesis'):
                open(os.path.join(args.text_dir, f"{s['key']}.{kind}.txt"), 'w').write('\n\n'.join(s[kind]) + '\n')
    text = json.dumps(lock, indent=2, ensure_ascii=False) + '\n'
    if args.write_lock:
        open(lock_path(args.map), 'w').write(text)
    elif args.check_lock:
        if open(lock_path(args.map)).read() != text:
            sys.exit(f'{lock_path(args.map)} is stale: the chapter, map or pronunciation changed')
        print('lock matches')
    for s in lock['sections']:
        print(f"{s['key']:28} {s['narrator']:18} {s['verbatimChars']:6} verbatim {s['synthesisChars']:6} synthesis")
    print(f"total {sum(s['synthesisChars'] for s in lock['sections'])} synthesis characters")


if __name__ == '__main__':
    main()
