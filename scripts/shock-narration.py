#!/usr/bin/env python3
"""Render the Shock chapter narration with a local Kokoro voice (no network, no hosted TTS).

Usage (from repo root, inside a venv with kokoro-onnx, soundfile, numpy; ffmpeg on PATH):
  python scripts/shock-narration.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin [--text-only]

Writes public/audio/shock/*.mp3, src/data/shock-audio.json, and the narrated text
of each clip to --text-dir (default: outside the repo is fine).
One clip per top-level part (children included), after a title-and-introduction clip,
and a final approach-to-treatment clip. Questions, tables, figures and reference marks are not read.
"""
import argparse, json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASE = os.path.join(ROOT, 'src/content/cases/shock-pressure-flow.json')
OUT = os.path.join(ROOT, 'public/audio/shock')
MANIFEST = os.path.join(ROOT, 'src/data/shock-audio.json')
VOICE, LANG, PAUSE = 'af_heart', 'en-us', 0.6
ROMAN = {'I': 'one', 'II': 'two', 'III': 'three', 'IV': 'four', 'V': 'five', 'VI': 'six', 'VII': 'seven', 'VIII': 'eight'}
STEPS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

# Exact rewrites for equations, applied before the general rules.
EXACT = [
    ('CO = HR × SV', 'cardiac output equals heart rate times stroke volume'),
    ('115 × 0.030 L = 3.45 L/min', '115 times 0.030 litres equals 3.45 litres per minute'),
    ('MAP − RAP = CO × SVR', 'MAP minus R A P equals cardiac output times S V R'),
    ('CO = (MAP − RAP)/SVR', 'cardiac output equals MAP minus R A P, divided by S V R'),
    ('multiply by 80 to obtain the dyn·s·cm⁻⁵ units', 'multiply by 80 to obtain the dyne-seconds per centimetre to the fifth units'),
    ('venous return = (mean systemic filling pressure − RAP) ÷ resistance to venous return',
     'venous return equals mean systemic filling pressure minus R A P, divided by resistance to venous return'),
    ('area = π × (2.0/2)² ≈ 3.14 cm²', 'area equals pi times one squared, about 3.14 square centimetres'),
    ('44 × 100 / 1,000', '44 times 100, divided by 1000,'),
    ('(16 − 14)/14 ≈ 14 percent', '16 minus 14, divided by 14, is about 14 percent'),
    ('CaO2 = (1.34 × Hb × SaO2) + (0.003 × PaO2)', 'C A O two equals 1.34 times hemoglobin times S A O two, plus 0.003 times P A O two'),
    ('DO2 = CO × CaO2 × 10', 'D O two equals cardiac output times C A O two times 10'),
    ('(1.34 × 14 × 0.98) + (0.003 × 95) = 18.38 + 0.29', '1.34 times 14 times 0.98, plus 0.003 times 95, equals 18.38 plus 0.29,'),
    ('(1.34 × 7 × 0.98) + 0.29 = 9.19 + 0.29', '1.34 times 7 times 0.98, plus 0.29, equals 9.19 plus 0.29,'),
    ('(1.34 × 7 × 1.00) + (0.003 × 400) = 9.38 + 1.20', '1.34 times 7 times 1.00, plus 0.003 times 400, equals 9.38 plus 1.20,'),
    ('(250 ÷ 930)', '(250 divided by 930)'), ('(250 ÷ 390)', '(250 divided by 390)'),
    ('Figure 01', 'Figure 1'),
    ('where HR is heart rate in beats per minute and SV is stroke volume,', 'where heart rate is in beats per minute and stroke volume is'),
]
# Parenthetical abbreviation definitions after the spoken expansion are dropped.
DEFS = r' \((?:MAP|RAP|CO|PPV|SVV|LVOT|VTI|VExUS|PLR)\)'
WORDS = [  # whole-word readings, order matters
    (r'mm Hg·min/L', 'millimeters of mercury minutes per litre'),
    (r'mL O2/dL', 'millilitres of oxygen per decilitre'), (r'mL O2/min', 'millilitres of oxygen per minute'),
    (r'mm Hg', 'millimeters of mercury'), (r'L/min', 'litres per minute'), (r'mL/kg', 'millilitres per kilogram'),
    (r'mL/dL', 'millilitres per decilitre'), (r'g/dL', 'grams per decilitre'), (r'mL/min', 'millilitres per minute'),
    (r'(?<=\d) mL\b', ' millilitres'), (r'\bmL\b', 'millilitres'), (r'\bdL\b', 'decilitre'),
    (r'(?<=\d) cm\b', ' centimetres'), (r'(?<=\d) L\b', ' litres'),
    (r'\b110s\b', 'one-hundred-and-tens'),
    (r'\bVExUS\b', 'vex-us'), (r'\bPaO2\b', 'P A O two'), (r'\bSaO2\b', 'S A O two'), (r'\bSpO2\b', 'S P O two'),
    (r'\bCaO2\b', 'C A O two'), (r'\bDO2\b', 'D O two'), (r'\bVO2\b', 'V O two'), (r'\bO2\b', 'oxygen'),
    (r'\bRAP\b', 'R A P'), (r'\bSVR\b', 'S V R'), (r'\bPPV\b', 'P P V'), (r'\bSVV\b', 'S V V'), (r'\bLVOT\b', 'L V O T'),
    (r'\bVTI\b', 'V T I'), (r'\bPLR\b', 'P L R'), (r'\bESICM\b', 'E S I C M'), (r'\bPEEP\b', 'peep'),
    (r'\bHR\b', 'heart rate'), (r'\bSV\b', 'stroke volume'), (r'\bCO\b', 'cardiac output'), (r'\bHb\b', 'hemoglobin'),
    (r'\bPart (VIII|VII|VI|IV|V|III|II|I)\b', lambda m: 'Part ' + ROMAN[m.group(1)]),
    (r'×', ' times '), (r'÷', ' divided by '), (r'(?<=[a-z]) ≈', ' is about'), (r'(?<=\d) ≈', ', about'), (r'≈', ' about '), (r' − ', ' minus '), (r' = ', ' equals '),
    (r'–', '-'), (r'\u00a0', ' '), (r'\*\*', ''), (r'(?<=\d),(?=\d{3}\b)', ''),
]

def speak(text: str) -> str:
    for a, b in EXACT:
        text = text.replace(a, b)
    text = re.sub(DEFS, '', text)
    for a, b in WORDS:
        text = re.sub(a, b, text)
    text = re.sub(r'\s+', ' ', text).strip()
    left = re.findall(r'[×÷≈−·²⁻⁵π=]', text)
    if left:
        sys.exit(f'unhandled symbols {left} in: {text[:120]}')
    return text

def clips(case):
    out = [dict(heading=case['title'], anchor=None, filename='00-title-and-introduction.mp3',
                paras=[case['title'], case['summary']])]
    tops = [p for p in case['principles'] if not p.get('parentId')]
    for n, top in enumerate(tops, 1):
        paras = []
        for p in [top] + [c for c in case['principles'] if c.get('parentId') == top['id']]:
            paras += [p['title']] + p['body']
            ex = p.get('workedExample')
            if ex:
                paras += [ex['title']] + ex['body']
        out.append(dict(heading=top['title'], anchor=f"principle-{top['id']}",
                        filename=f"{n:02d}-{top['id']}.mp3", paras=paras))
    paras = ['Approach to treatment']
    for i, s in enumerate(case['treatmentApproach']):
        paras.append(f"Step {STEPS[i]}. {s['title']}. {s['action']} {s['why']}")
    out.append(dict(heading='Approach to treatment', anchor='treatment-heading',
                    filename=f'{len(tops) + 1:02d}-approach-to-treatment.mp3', paras=paras))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model'); ap.add_argument('--voices')
    ap.add_argument('--text-dir', default=os.path.join(tempfile.gettempdir(), 'shock-narration-text'))
    ap.add_argument('--text-only', action='store_true')
    args = ap.parse_args()
    case = json.load(open(CASE))
    plan = clips(case)
    os.makedirs(args.text_dir, exist_ok=True)
    for c in plan:
        c['spoken'] = [speak(p) for p in c['paras']]
        open(os.path.join(args.text_dir, c['filename'][:-4] + '.txt'), 'w').write('\n\n'.join(c['spoken']) + '\n')
    if args.text_only:
        return
    import numpy as np, soundfile as sf
    from kokoro_onnx import Kokoro
    kokoro = Kokoro(args.model, args.voices)
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for i, c in enumerate(plan):
        chunks = []
        for p in c['spoken']:
            audio, sr = kokoro.create(p, voice=VOICE, speed=1.0, lang=LANG)
            chunks += [audio, np.zeros(int(sr * PAUSE), dtype=audio.dtype)]
        wav = os.path.join(tempfile.gettempdir(), 'shock-narration.wav')
        sf.write(wav, np.concatenate(chunks[:-1]), sr)
        mp3 = os.path.join(OUT, c['filename'])
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-af', 'loudnorm=I=-17:TP=-1.5',
                        '-ac', '1', '-ar', '24000', '-b:a', '48k', '-map_metadata', '-1', mp3], check=True)
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3],
                                   capture_output=True, text=True, check=True).stdout)
        manifest.append(dict(index=i, heading=c['heading'], anchor=c['anchor'], filename=c['filename'],
                             duration_seconds=round(dur, 1)))
        print(c['filename'], round(dur, 1), flush=True)
    open(MANIFEST, 'w').write(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')

if __name__ == '__main__':
    main()
