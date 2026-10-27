#!/usr/bin/env python3
"""Render a chapter's narration with a local Kokoro voice (no network, no hosted TTS).

Same setup as scripts/shock-narration.py: voice af_heart, one clip per top-level part after a
title-and-introduction clip, then an approach-to-treatment clip; 0.6 s between paragraphs;
loudnorm I=-17 TP=-1.5, mono 24 kHz, 48 kb/s MP3, no metadata.

Usage (from repo root, inside a venv with kokoro-onnx, soundfile, numpy; ffmpeg on PATH):
  python scripts/case-narration.py --slug septic-shock --model kokoro-v1.0.onnx --voices voices-v1.0.bin [--text-only]

Writes public/audio/<slug>/*.mp3 and src/data/<slug>-audio.json. Questions, tables, figures,
reference marks and reference lists are not read. Link targets are dropped; link text is read.
"""
import argparse, json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE, LANG, PAUSE = 'af_heart', 'en-us', 0.6
STEPS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
ROMAN = {'I': 'one', 'II': 'two', 'III': 'three', 'IV': 'four', 'V': 'five', 'VI': 'six', 'VII': 'seven',
         'VIII': 'eight', 'IX': 'nine', 'X': 'ten'}
DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

def integer_words(n: int) -> str:
    if n < 10: return DIGITS[n]
    if n < 20: return TEENS[n - 10]
    if n < 100: return TENS[n // 10] + ('' if n % 10 == 0 else '-' + DIGITS[n % 10])
    if n < 1000: return DIGITS[n // 100] + ' hundred' + ('' if n % 100 == 0 else ' ' + integer_words(n % 100))
    return str(n)

def decimal_words(m: re.Match) -> str:
    """Kokoro splits '4.4' into two sentences, so decimals are spoken in words."""
    return integer_words(int(m.group(1))) + ' point ' + ' '.join(DIGITS[int(d)] for d in m.group(2))

# Gas and physiology symbols, read the way clinicians say them.
SYMBOLS = [
    ('VD/VT', 'V D over V T'), ('ERS/ATS', 'E R S and A T S'), ('ACC/AHA', 'A C C and A H A'), ('V/Q', 'V over Q'), ('L/s', 'liters per second'),
    ('PaO2/FiO2', 'P A O two over F I O two'), ('SpO2/FiO2', 'S P O two over F I O two'), ('PaCO2/R', 'P A C O two over R'),
    ('PaCO2', 'P A C O two'), ('PvCO2', 'P V C O two'), ('VCO2', 'V C O two'), ('PAO2', 'alveolar P O two'),
    ('PaO2', 'P A O two'), ('PIO2', 'inspired P O two'), ('PO2', 'P O two'), ('FiO2', 'F I O two'),
    ('SpO2', 'S P O two'), ('SaO2', 'S A O two'), ('ScvO2', 'S C V O two'), ('CvO2', 'C V O two'),
    ('CaO2', 'C A O two'), ('DO2', 'D O two'), ('VO2', 'V O two'), ('PH2O', 'P H two O'),
    ('CO2', 'carbon dioxide'), ('O2', 'oxygen'), ('H2O', 'water'), ('PDE5', 'P D E five'),
('VA', 'V A'), ('VE', 'V E'), ('VT', 'V T'), ('VD', 'V D'), ('PB', 'P B'),
    ('A–a', 'A minus a'), ('A-a', 'A minus a'),
]
# Acronyms Kokoro might read as words; spelled out. Trial names stay words (see TRIALS).
LETTERS = ['MAP', 'CVP', 'SVR', 'COPD', 'CPAP', 'NIV', 'ESC', 'FRC', 'ROX', 'LVEDP', 'CI', 'DHF', 'ICU', 'HF',
           'ERS', 'ATS', 'ATP', 'ARDS', 'UK', 'SOFA', 'RV', 'RR', 'CS', 'AHA', 'ACC', 'APO', 'LV', 'RAP',
           'PPV', 'SVV', 'LVOT', 'VTI', 'PLR', 'ECMO', 'HFNC', 'BiPAP', 'EPAP', 'IPAP', 'NT-proBNP', 'BNP',
           'ECG', 'EKG', 'ED', 'IV', 'CT', 'ABG', 'VBG', 'RSI', 'BVM', 'HFNO', 'ETCO2', 'EtCO2', 'PE', 'MI',
           'ACS', 'STEMI', 'POCUS', 'IVC', 'SVC', 'LVEF', 'EF', 'RCTs', 'RCT', 'GCS', 'ED50', 'NaCl']
TRIALS = {'PREOXI': 'pre-oxy', 'CLASSIC': 'Classic', 'ANDROMEDA': 'Andromeda', 'ADRENAL': 'Adrenal',
          'VASST': 'vast', 'FLORALI': 'Florali', 'CLOVERS': 'Clovers', 'SEPSISPAM': 'sepsis pam',
          'PreVent': 'pre-vent', 'PREPARE': 'Prepare', 'THRIVE': 'thrive', 'INTUBE': 'in-tube',
          'ATHOS': 'Athos', 'auto-PEEP': 'auto-peep', 'LeoPARDS': 'leopards', 'SCAPE': 'scape', 'DOSE': 'dose', 'SHOCK': 'shock',
          'FELLOW': 'fellow', 'APROCCHSS': 'A P R O C C H S S', 'COIITSS': 'C O I I T S S',
          'VExUS': 'vex-us', 'PEEP': 'peep', 'ESICM': 'E S I C M', 'CO': 'cardiac output', 'HR': 'heart rate',
          'SV': 'stroke volume', 'Hb': 'hemoglobin', 'oedema': 'edema', 'Oedema': 'Edema'}
UNITS = [
    (r'(?<=\d) L/s\b', ' liter per second'),
    (r'cm H2O/L/s', 'centimeters of water per liter per second'), (r'mL/cm H2O', 'milliliters per centimeter of water'),
    (r'cm ?H2O', 'centimeters of water'), (r'mm ?Hg·min/L', 'millimeters of mercury minutes per liter'),
    (r'mm ?Hg', 'millimeters of mercury'), (r'dyn·s·cm-5', 'dyne-seconds per centimeter to the fifth'),
    (r'dyn·s·cm⁻⁵', 'dyne-seconds per centimeter to the fifth'),
    (r'mL O2/dL', 'milliliters of oxygen per deciliter'), (r'mL O2/min', 'milliliters of oxygen per minute'),
    (r'mmol/L', 'millimoles per liter'), (r'mEq/L', 'milliequivalents per liter'), (r'mg/dL', 'milligrams per deciliter'),
    (r'g/dL', 'grams per deciliter'), (r'mL/kg', 'milliliters per kilogram'), (r'mL/min', 'milliliters per minute'),
    (r'mL/dL', 'milliliters per deciliter'), (r'dL/min', 'deciliters per minute'), (r'L/min', 'liters per minute'), (r'breaths/min', 'breaths per minute'),
    (r'beats/min', 'beats per minute'), (r'(?<=\d)/min\b', ' per minute'), (r'(?<=\d) ?mL\b', ' milliliters'),
    (r'\bmL\b', 'milliliters'), (r'(?<=\d) cm\b', ' centimeters'), (r'(?<=\d) L\b', ' liters'), (r'\bdL\b', 'deciliter'),
    (r'(?<=\d) ?kg\b', ' kilograms'), (r'(?<=\d) ?mg\b', ' milligrams'),
]

def speak(text: str) -> str:
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)           # markdown link -> its text
    text = re.sub(r' \((?:[A-Z][A-Za-z]?){1,3}[A-Z]\)', '', text)   # '(MAP)' after the spoken expansion
    text = text.replace('**', '').replace('\u00a0', ' ')
    for a, b in UNITS:
        text = re.sub(a, b, text)
    for a, b in SYMBOLS:
        text = re.sub(r'(?<!\w)' + re.escape(a) + r'(?!\w)', b, text)
    text = re.sub(r'\blog\(', 'log of (', text)
    text = re.sub(r'(?<=\d)%', ' percent', text)
    text = re.sub(r'(?<=[\w)]) [x×] (?=[\d(])', ' times ', text)
    text = re.sub(r'\bvs\.? ', 'versus ', text).replace('3CPO', 'three C P O')
    text = re.sub(r'(?<![\d.])(\d+)\.(\d+)(?!\d|\.\d)', decimal_words, text)
    text = re.sub(r'(?<=\d),(?=\d{3}\b)', '', text)
    text = re.sub(r'(?<=\d)/(?=\d)', ' over ', text)                 # 92/60, 7/4
    text = re.sub(r'(?<=[\w)]) ?/ ?(?=[\w(])', ' divided by ', text)    # 32 over 0.8 already handled; VCO2 / VA
    text = re.sub(r' \+ ', ' plus ', text)
    text = re.sub(r'(?<=\d) x (?=[a-z])', ' times ', text)
    text = text.replace('×', ' times ').replace('÷', ' divided by ')
    text = re.sub(r' [−-] ', ' minus ', text).replace('(1 −', '(1 minus').replace('−', ' minus ')
    text = re.sub(r'(?<=[a-z]) ≈', ' is about', text)
    text = re.sub(r'(?<=\d) ≈', ', about', text)
    text = text.replace('≈', ' about ').replace(' = ', ' equals ')
    text = re.sub(r'(?<![\w])>\s?(?=\d)', 'greater than ', text)
    text = re.sub(r'(?<![\w])<\s?(?=\d)', 'less than ', text)
    text = re.sub(r'(?<=\d)%', ' percent', text)
    text = re.sub(r'\bParts? (IX|VIII|VII|VI|IV|V|III|II|I)\b', lambda m: m.group(0).split()[0] + ' ' + ROMAN[m.group(1)], text)
    text = re.sub(r'\b(IX|VIII|VII|VI|III|II)\b', lambda m: ROMAN[m.group(1)], text)  # 'Parts VI and VII'
    text = re.sub(r'\bClass (I|II|III)(a|b)?\b', lambda m: 'Class ' + ROMAN[m.group(1)] + (' ' + m.group(2).upper() if m.group(2) else ''), text)
    text = re.sub(r'\b(two|one|three)(a|b)\b', lambda m: m.group(1) + ' ' + m.group(2).upper(), text)  # IIa
    for a, b in TRIALS.items():
        text = re.sub(r'(?<!\w)' + re.escape(a) + r'(?!\w)', b, text)
    for a in LETTERS:
        text = re.sub(r'(?<!\w)' + re.escape(a) + r'(?!\w)', ' '.join(a.replace('-', ' ')), text)
    text = text.replace('–', '-').replace('—', ', ')
    text = re.sub(r'\s+', ' ', text).replace(' ,', ',').strip()
    left = re.findall(r'[×÷≈−·²⁻⁵π=<>\[\]#\\/*_]', text)
    if left:
        sys.exit(f'unhandled symbols {left} in: {text[:200]}')
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
    ap.add_argument('--slug', required=True)
    ap.add_argument('--model'); ap.add_argument('--voices')
    ap.add_argument('--text-dir')
    ap.add_argument('--text-only', action='store_true')
    ap.add_argument('--only', nargs='*', help='filenames to re-render; other manifest entries are kept')
    args = ap.parse_args()
    case = json.load(open(os.path.join(ROOT, f'src/content/cases/{args.slug}.json')))
    out_dir = os.path.join(ROOT, 'public/audio', args.slug)
    manifest_path = os.path.join(ROOT, f'src/data/{args.slug}-audio.json')
    text_dir = args.text_dir or os.path.join(tempfile.gettempdir(), f'{args.slug}-narration-text')
    plan = clips(case)
    os.makedirs(text_dir, exist_ok=True)
    for c in plan:
        c['spoken'] = [speak(p) for p in c['paras']]
        open(os.path.join(text_dir, c['filename'][:-4] + '.txt'), 'w').write('\n\n'.join(c['spoken']) + '\n')
    if args.text_only:
        return
    import numpy as np, soundfile as sf
    from kokoro_onnx import Kokoro
    kokoro = Kokoro(args.model, args.voices)
    os.makedirs(out_dir, exist_ok=True)
    only = set(args.only or [])
    old = {t['filename']: t for t in json.load(open(manifest_path))} if only else {}
    manifest = []
    for i, c in enumerate(plan):
        if only and c['filename'] not in only:
            manifest.append(old[c['filename']])
            continue
        chunks = []
        for p in c['spoken']:
            audio, sr = kokoro.create(p, voice=VOICE, speed=1.0, lang=LANG)
            chunks += [audio, np.zeros(int(sr * PAUSE), dtype=audio.dtype)]
        wav = os.path.join(tempfile.gettempdir(), f'{args.slug}-narration.wav')
        sf.write(wav, np.concatenate(chunks[:-1]), sr)
        mp3 = os.path.join(out_dir, c['filename'])
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-af', 'loudnorm=I=-17:TP=-1.5',
                        '-ac', '1', '-ar', '24000', '-b:a', '48k', '-map_metadata', '-1', mp3], check=True)
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3],
                                   capture_output=True, text=True, check=True).stdout)
        manifest.append(dict(index=i, heading=c['heading'], anchor=c['anchor'], filename=c['filename'],
                             duration_seconds=round(dur, 1)))
        print(args.slug, c['filename'], round(dur, 1), flush=True)
    open(manifest_path, 'w').write(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')

if __name__ == '__main__':
    main()
