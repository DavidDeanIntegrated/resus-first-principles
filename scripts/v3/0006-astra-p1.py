# V3-AC3: Astra F01-F06 (+F05 sentence) and ventilation-principle paragraph 5. Exact-text; stops on any miss.
# Base: origin/main 074a4a6. Edits JSON only. Run from repo root:
#   python3 0006-astra-p1.py [path] [--quotes out.md]
import json,sys
args=[a for a in sys.argv[1:] if not a.startswith('--')]
p=args[0] if args else 'src/content/cases/adult-cardiac-arrest.json'
s=open(p).read()
# (finding, old, new, expected count)
R=[
# F04 + F05: perfusion principle, paragraph 1
("F04/F05",
 "In cardiac arrest the heart has stopped generating pressure, so every milliliter of coronary and cerebral blood flow has to be manufactured from outside the chest. It helps to keep three quantities apart. Pressure is what the compression produces in the aorta. A gradient is the difference between two pressures. Flow is what actually reaches tissue, and it follows the gradient, not the pressure alone.",
 "In cardiac arrest the heart is no longer generating effective pressure, so nearly all coronary and cerebral blood flow during CPR depends on what compressions produce from outside the chest. It helps to keep four quantities apart. Pressure is what the compression produces in the aorta. A gradient is the difference between two pressures. Resistance is how much a vascular bed opposes flow. Flow is what actually reaches tissue, and it is set by the gradient divided by the resistance, not by the pressure alone. Resistance is why the same gradient can deliver different flow: coronary resistance is high while the compressed myocardium squeezes its own vessels and lower during release, and a vasoconstrictor such as epinephrine raises aortic pressure largely by raising peripheral resistance, which helps the heart and brain only if their own beds are not constricted to the same degree.",1),
# F04: perfusion principle, paragraph 5
("F04",
 "The model predicts that anything raising right atrial or intrathoracic pressure, or lowering aortic pressure, will reduce coronary flow even when the compressions look vigorous.",
 "The model predicts that a rise in right atrial or intrathoracic pressure, or a fall in aortic relaxation pressure, will tend to reduce coronary flow even when the compressions look vigorous, unless something else widens the gradient at the same time.",1),
# F04: reversible-causes paragraph 3
("F04",
 "This is why compressions and epinephrine alone often fail in these arrests. Compressions cannot fill an empty ventricle, drain a tamponade, decompress a tension pneumothorax, or open an occluded coronary artery.",
 "This is why compressions and epinephrine alone often fail in these arrests. Compressions do little to fill an empty ventricle, and they do not drain a tamponade, decompress a tension pneumothorax, or open an occluded coronary artery.",1),
# F02: reversible-causes paragraph 4
("F02",
 "Neither is a routine drug for undifferentiated arrest. Randomized and registry evidence does not show a survival benefit, and routine calcium has a signal toward harm. In arrest suspected to be from hyperkalemia, the benefit of intravenous calcium and of intravenous sodium bicarbonate is not well established.",
 "Undifferentiated arrest means the cause is unknown, not that no cause is present, and four different statements need to be kept apart here. Routine use is not recommended: giving either drug to every arrest, without a specific indication, has not improved survival in randomized and registry evidence, and routine calcium has a signal toward harm. Benefit is uncertain in some specific settings: in arrest suspected to be from hyperkalemia, the benefit of intravenous calcium and of intravenous sodium bicarbonate is not well established. A mechanism being plausible is not the same as it being established in this patient, which usually cannot be confirmed during CPR. And none of this makes either drug contraindicated; it makes them targeted rather than default.",1),
# F02: no-routine-calcium-bicarb causalChain
("F02",
 "These drugs treat specific mechanisms, such as calcium-channel blockade or sodium-channel blockade. In undifferentiated arrest that mechanism is not present, and trials and registry data have not shown better survival. Routine calcium leans toward harm.",
 "These drugs treat specific mechanisms, such as calcium-channel blockade or sodium-channel blockade. In undifferentiated arrest the cause is unknown, so the mechanism the drug targets has not been established in this patient. Given routinely across such arrests, trials and registry data have not shown better survival, and routine calcium leans toward harm.",1),
# F02: antiarrhythmic step why
("F02",
 "Calcium and bicarbonate do not improve undifferentiated arrest, and their benefit in arrest suspected from hyperkalemia is not well established.",
 "Routine calcium and bicarbonate, given without a specific indication, have not improved outcomes, and their benefit in arrest suspected from hyperkalemia is not well established.",1),
# F04: pea-is-a-cause answer and conclusion
("F04",
 "The rhythm will not become a pulse until the obstruction is treated.",
 "While the tamponade persists, the organized rhythm is unlikely to produce a pulse; relieving it is what gives the rhythm a chance to.",2),
# F01: ventilation principle paragraph 2
("F01",
 "Every positive-pressure breath is also a circulatory event. It raises intrathoracic pressure, and blood returns to the heart only when the pressure outside the chest exceeds the pressure inside it. Extra breaths narrow that difference, so venous return falls, and with less blood entering the heart, the compressions produce less coronary perfusion pressure.",
 "Every positive-pressure breath is also a circulatory event. Venous return is driven by the difference between mean systemic filling pressure, the pressure the blood volume exerts on the stretched walls of the systemic veins, and right atrial pressure, and it is opposed by the resistance to venous return. A positive-pressure breath raises intrathoracic pressure, and with it right atrial pressure. If filling pressure and venous resistance stay roughly constant over that breath, the driving gradient narrows and venous return falls. More breaths, or breaths held longer, keep that gradient narrowed for more of each minute. With less blood entering the heart, each compression has less to eject, and coronary perfusion pressure tends to fall. The prediction weakens when those held-constant terms move: a volume-loaded or vasoconstricted patient has a higher filling pressure and tolerates the same breath better, while a hypovolemic patient loses venous return sooner.",1),
# Ventilation principle paragraph 5 (v2 polish item)
("VENT",
 "Its limits are real. A low or falling value is a prompt to reassess compression quality and tube position. Do not use end-tidal CO2 alone to stop resuscitation. In an intubated adult, failure to exceed 10 mm Hg after 20 minutes of ALS may be one part of a multimodal decision to stop. A sudden rise can accompany ROSC, but there is no single cutoff that proves it.",
 "Because the number has so many inputs, it is better used as a question than as a verdict. A low or falling value asks first whether the compressions have weakened or the tube has moved, and only later whether the patient can be resuscitated. Even then it should not decide the matter alone: in an intubated adult, failure to exceed 10 mm Hg after 20 minutes of ALS may be one part of a multimodal decision to stop. A sudden rise can accompany ROSC, though no single cutoff proves it, so the rise prompts a pulse check rather than replacing one.",1),
# F06: etco2-after-epinephrine answer and conclusion
("F06",
 "Because epinephrine usually lowers end-tidal CO2 for 1 to 2 minutes even while it raises coronary perfusion pressure. The number has several determinants, and a drug can move it in the opposite direction from the quantity you care about.",
 "Because epinephrine can lower end-tidal CO2 for a short time even while it raises aortic pressure and, with it, coronary perfusion pressure. The number has several determinants, and a drug can move it in the opposite direction from the quantity you care about.",2),
# F06: etco2-after-epinephrine causalChain
("F06",
 "Epinephrine raises aortic pressure, which helps coronary perfusion, but it also redistributes flow so that less blood reaches the lungs for a short time. Less pulmonary blood flow carries less CO2 to be exhaled, so the reading dips while perfusion of the heart may be improving.",
 "Epinephrine raises aortic pressure, which helps coronary perfusion, but a transient fall in end-tidal CO2 after a dose has been observed, and the proposed explanations, less CO2 delivered to ventilated lung or more ventilated lung that is poorly perfused, are not settled. Whatever the mechanism, the reading can dip while perfusion of the heart is unchanged or improving.",1),
# F03: post-ROSC paragraph 5
("F03",
 "That uncertainty is not a reason for emergency angiography: in a comatose patient without ST elevation, shock, or instability, emergency angiography has shown no benefit.",
 "Persistent ST elevation with a suspected cardiac cause calls for emergency coronary angiography, whether or not the patient is comatose. Without ST elevation, emergency angiography is reasonable for selected patients with a suspected cardiac cause who have cardiogenic shock, recurrent ventricular arrhythmias, or evidence of significant ongoing myocardial ischemia, again regardless of coma. In a comatose patient with none of those features, no ST elevation, shock, electrical instability, or significant ongoing ischemia, emergency angiography is not recommended over a delayed or selective strategy, because randomized trials found no benefit from going early.",1),
]
log=[]
for f,a,b,n in R:
  c=s.count(a)
  if c!=n: sys.exit(f"[{f}] expected {n} match(es), found {c}: {a[:70]}")
  s=s.replace(a,b); log.append((f,a,b,n))
d=json.loads(s)
JEL={"id":"jellinek-2000","label":"Jellinek et al. Influence of positive airway pressure on the pressure gradient for venous return in humans. J Appl Physiol 2000;88:926-932","url":"https://doi.org/10.1152/jappl.2000.88.3.926","note":"Mean systemic filling pressure, right atrial pressure, and venous return under positive airway pressure."}
if any(r['id']=='jellinek-2000' for r in d['references']): sys.exit("jellinek-2000 already present")
d['references'].append(JEL)
pr={x['id']:x for x in d['principles']}
ov=pr['oxygenation-without-hyperventilation']
if 'jellinek-2000' in ov['refs']: sys.exit("ref already on principle")
ov['refs'].append('jellinek-2000')
for q in ov['questions']:
  if q['id']=='hyperventilation-steals-preload': q['refs']=q['refs']+['jellinek-2000']
pc=pr['post-rosc-physiology']
assert 'aha-2025-pcac' in pc['refs']
open(p,'w').write(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
if '--quotes' in sys.argv:
  out=sys.argv[sys.argv.index('--quotes')+1]
  with open(out,'w') as o:
    o.write("# V3-AC3 before/after quotes (0006-astra-p1.py, base 074a4a6)\n\n")
    for f,a,b,n in log:
      o.write(f"## {f}{' (x'+str(n)+')' if n>1 else ''}\n\n**Before:** {a}\n\n**After:** {b}\n\n")
    o.write("## F01 reference\n\nAdded `jellinek-2000` (doi:10.1152/jappl.2000.88.3.926) to references, to the ventilation principle refs, and to `hyperventilation-steals-preload` refs.\n")
print("0006 ok:",len(log),"replacements")
