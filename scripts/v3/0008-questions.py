# V3-AC2: >=6 new reversible-causes questions + F07 (replace 3 recall-style transfer questions).
# DEPENDS ON Engineering Lead's v3 structure PR (kind "insufficient-information" with missingData). Edits JSON only.
# Run after 0006 and 0007. Stops loudly on any missing/duplicate id or unknown ref.
import json,sys
p=sys.argv[1] if len(sys.argv)>1 else 'src/content/cases/adult-cardiac-arrest.json'
d=json.load(open(p))
def Q(id,kind,prompt,conclusion,chain,assumption,misc,refs,missing=None):
  q={"id":id,"kind":kind,"prompt":prompt,"answer":conclusion,"causalChain":chain,"assumption":assumption,"misconception":misc,"conclusion":conclusion,"refs":refs}
  if missing is not None: q["missingData"]=missing
  return q
NEW=[
Q("pea-etco2-sudden-fall","prediction",
 "Predict: in PEA with an advanced airway, end-tidal CO2 has held near 25 mm Hg for several minutes with the same ventilation rate. It suddenly drops to 8 mm Hg. Name the competing explanations, and the order in which you test them.",
 "With ventilation unchanged, a sudden fall means less CO2 is reaching the exhaled gas. The quickest explanations to test are a displaced or obstructed tube and a fall in compression quality. If both are excluded, a new obstruction to pulmonary blood flow, such as a tension pneumothorax, becomes more likely.",
 "End-tidal CO2 needs blood to carry CO2 to ventilated lung and a patent airway to carry it out. A dislodged tube removes the second; a tired compressor, a change of hands, or a pause reduces the first; a tension pneumothorax or a new embolus blocks blood from reaching the lung. Each of these can produce the same number, so the number tells you to look, not where.",
 "Ventilation really was constant, and no drug was just given. A recent dose of epinephrine can lower the reading transiently by itself.",
 "The belief that a falling end-tidal CO2 is a prognosis. Here it is a signal that something changed, and several of the candidates are quickly correctable.",
 ["aha-2025-als","aha-2025-special"]),
Q("post-intubation-arrest","transfer",
 "Transfer: a hypotensive septic patient is intubated after induction and arrests within three minutes. The rhythm is a fast, narrow PEA and the capnography waveform is present. Using the filling and obstruction categories, which causes compete, and what would distinguish them?",
 "Three causes compete. Induction drugs remove sympathetic tone and positive pressure raises right atrial pressure, so a patient short of volume loses venous return; a tension pneumothorax from positive pressure obstructs it; and a severe metabolic acidosis loses its respiratory compensation if the ventilator rate is lower than the patient's own. A present waveform makes esophageal intubation less likely. Unilateral signs and rising airway pressure point to tension, a pre-intubation blood gas and breathing pattern point to acidosis, and the shock state before induction points to filling.",
 "Before intubation, venous return was sustained by vasoconstriction keeping mean systemic filling pressure up and by negative-pressure breathing keeping right atrial pressure low. Induction lowers filling pressure; positive pressure raises right atrial pressure. Both narrow the gradient for venous return at once, and in an underfilled patient the combination can drop output below the threshold for a pulse.",
 "The tube is in the trachea, which the waveform supports but does not prove if pulmonary blood flow is very low.",
 "The belief that an arrest right after intubation is a coincidence or a drug reaction alone. Its timing is the clue that the procedure changed the physiology.",
 ["aha-2025-als","jellinek-2000"]),
Q("wide-slow-pea-unknown","insufficient-information",
 "Not enough information: a 70-year-old is found unresponsive at home. The rhythm is a wide, slow PEA at 30 per minute. A team member wants calcium now for hyperkalemia. What data would you need before you could attribute this arrest to hyperkalemia rather than another cause?",
 "You cannot tell from the rhythm alone. A wide, slow PEA fits hyperkalemia, but it also fits sodium-channel-blocker or calcium-channel-blocker poisoning, severe acidosis, hypothermia, and a long low-flow interval from any cause. The decision depends on history and data you do not yet have.",
 "Several mechanisms slow conduction through the myocardium: a less negative resting potential in hyperkalemia, sodium-channel blockade, acidosis, and cold. Each widens the QRS and slows the rate. Prolonged ischemia from an arrest of any cause does the same, so the rhythm narrows the field without choosing within it.",
 "The arrest was unwitnessed, so the downtime, which can produce this rhythm by itself, is unknown.",
 "The belief that a rhythm pattern is a diagnosis. The wide, slow pattern is a category, and calcium's benefit even in suspected hyperkalemic arrest is not well established.",
 ["aha-2025-special","aha-2025-algorithm"],
 ["Kidney function, dialysis schedule, and potassium-raising medications","Any ingestion or access to tricyclics, calcium-channel blockers, or beta blockers","A pre-arrest ECG or EMS rhythm strip","Point-of-care potassium and blood gas, interpreted knowing that acidosis during arrest raises measured potassium","Core temperature","Estimated downtime before CPR"]),
Q("calcium-without-lower-potassium","prediction",
 "Predict: a hyperkalemic patient with a wide QRS and a weak pulse is given intravenous calcium, and the QRS narrows within minutes. If you drew a potassium five minutes later, what would it show, and what does that imply for the next hour?",
 "The potassium would be essentially unchanged. Calcium stabilizes the membrane by raising the threshold potential; it does not move or remove potassium. Its effect wears off, so potassium must still be shifted into cells and then removed.",
 "Hyperkalemia makes the resting potential less negative, bringing it close to threshold and inactivating sodium channels. Calcium raises the threshold, restoring the gap between resting and threshold potential, so the cell can again fire a normal action potential. The extracellular potassium concentration is the same before and after.",
 "The rhythm improvement was due to calcium and not to another treatment given at the same time.",
 "The belief that a narrowing QRS means the potassium is falling. It means the membrane has been temporarily protected from the potassium.",
 ["aha-2025-special"]),
Q("narrow-fast-rule-breaks","transfer",
 "Transfer: a patient on a high-dose beta blocker develops massive gastrointestinal bleeding and arrests. The PEA is slow, at about 45 per minute, with a narrow complex. Does the slow rate argue against hypovolemia?",
 "No. The rule that empty-heart states produce fast PEA depends on an intact sympathetic response. Beta blockade blunts the tachycardia, so a hypovolemic arrest can present with a slow rate. The history of bleeding outweighs the rate.",
 "In hypovolemia, falling stroke volume triggers catecholamine release, which speeds the sinus node. A beta blocker blocks that response at the receptor, so the rate stays low even as filling fails. The rhythm then looks less like an empty heart than the physiology really is.",
 "The narrow complex reflects intact conduction rather than a toxin or metabolic cause, which supports reading this as a filling problem.",
 "Applying the narrow-fast versus wide-slow rule as a diagnosis. It is a probability shift that depends on intact autonomic responses and a short arrest.",
 ["aha-2025-algorithm"]),
Q("dilated-rv-late","insufficient-information",
 "Not enough information: after 25 minutes of CPR for an unwitnessed arrest, ultrasound shows a dilated right ventricle. A colleague proposes thrombolysis for pulmonary embolism. What would you need to know before you could attribute the arrest to embolism?",
 "A dilated right ventricle after a long arrest is not specific for embolism, because blood pools in the right heart once the circulation stops. You would need history and timing that point to embolism before weighing thrombolysis on suspicion, with its bleeding risk and its need for prolonged CPR afterward.",
 "When the heart stops, pressures equalize and the compliant right heart distends with venous blood. Prolonged CPR and right ventricular ischemia add to this. So a late dilated right ventricle can be a consequence of any arrest as well as the signature of an obstructed pulmonary outflow.",
 "The ultrasound view is adequate and was obtained without interrupting compressions.",
 "The belief that one ultrasound finding names the cause. During arrest its usefulness is not well established, and the finding has to be weighed against the history.",
 ["aha-2025-special","aha-2025-als"],
 ["Symptoms before collapse, such as sudden dyspnea or pleuritic pain","Risk factors such as recent surgery, immobility, cancer, or known deep vein thrombosis","Whether the right ventricle was dilated on the first view or only after prolonged CPR","Bleeding risk and contraindications to thrombolysis","Availability of catheter or surgical embolectomy or extracorporeal support"]),
Q("dka-volume-first","prediction",
 "Predict: a patient in diabetic ketoacidosis arrests with a fast, narrow PEA. The pH is very low and the potassium is high. Someone asks for bicarbonate first. Which failure is most likely limiting compressions, and what treatment addresses it?",
 "Filling is most likely the limiting failure. Osmotic diuresis and vomiting have emptied the circulation, which fits the fast, narrow PEA. Volume restores filling pressure; bicarbonate does not, and routine use is not recommended. Acidosis and the potassium shift are real, but they are not what is emptying the heart.",
 "Glucose in the urine pulls water and salt with it, and vomiting adds to the loss. Mean systemic filling pressure falls, and venous return falls with it. Acidosis weakens the heart and shifts potassium out of cells, so the measured potassium is high even though total-body potassium is low. Volume treats the first failure; insulin will later push potassium back into cells and can make it fall sharply.",
 "The fast, narrow rhythm reflects intact conduction. If the QRS were wide, hyperkalemia or acidosis would be a stronger competitor.",
 "The belief that the most abnormal number is the cause. The pH is the most striking value, but the empty circulation is what compressions cannot overcome.",
 ["aha-2025-als","aha-2025-algorithm"]),
]
# F07: replace three recall-style transfer questions in place (new ids).
F07={
"cpp-rate-and-recoil":Q("cpp-two-catheters","transfer",
 "Transfer: in the cath lab, a patient in arrest has an arterial line and a central venous line. During compressions that look deep and fast, the relaxation-phase aortic pressure is 30 mm Hg and the right atrial pressure is 25 mm Hg. What does the gradient tell you, and what would you check?",
 "The coronary perfusion pressure is only about 5 mm Hg, so coronary flow is minimal despite vigorous-looking compressions. The high right atrial pressure is the problem to explain: check recoil and leaning, the ventilation rate, and causes that raise right atrial pressure, such as tamponade, tension pneumothorax, or a massive embolus.",
 "Coronary perfusion pressure is aortic minus right atrial pressure during relaxation. A right atrial pressure close to aortic pressure collapses the gradient regardless of depth. Incomplete recoil, rapid ventilation, and obstruction around or beyond the right heart all raise right atrial pressure.",
 "The catheters are correctly zeroed and positioned, and the pressures are read during the relaxation phase.",
 "The belief that compressions that look good must produce good perfusion. The pressures show what the eye cannot.",
 ["yannopoulos-2005","aha-2025-bls"]),
"pause-with-advanced-airway":Q("pause-for-imaging","transfer",
 "Transfer: in the cath lab, compressions are paused every 30 seconds so fluoroscopy can image the coronary arteries. Each pause lasts about 10 seconds. Using what you know about pauses, what is the cost, and what alternative does the guideline support?",
 "Each pause restarts the climb of coronary perfusion pressure, so frequent short pauses cost more perfusion than their total time suggests. Mechanical CPR is reasonable in the cath lab, because it allows imaging and intervention without stopping compressions.",
 "Aortic pressure falls quickly when compressions stop and takes several compressions to rebuild. Repeated pauses keep the gradient below its plateau for most of the time. A mechanical device removes the operator from the field and keeps compressions continuous during imaging.",
 "A device is available and can be placed without a long interruption.",
 "The belief that brief pauses are harmless if each is short. Their cost is multiplied by how often they occur.",
 ["aha-2025-special","aha-2025-bls"]),
"map-and-paco2-floors":Q("paco2-not-etco2","transfer",
 "Transfer: after ROSC, a comatose patient's end-tidal CO2 reads 30 mm Hg, and the team wants to slow the ventilator to bring it up to 40. A blood gas has not been drawn. Using what you know about end-tidal CO2, what could go wrong?",
 "End-tidal CO2 after cardiac arrest may be falsely low and may not reflect PaCO2, because poorly perfused lung adds dead space. If the PaCO2 is already normal or high, slowing the ventilator could push it higher. Obtain a blood gas and target a PaCO2 generally of 35 to 45 mm Hg.",
 "End-tidal CO2 approximates PaCO2 only when ventilated lung is well perfused. After arrest, low cardiac output and lung injury create ventilated areas with little blood flow, which dilute the exhaled CO2. The gap between end-tidal and arterial CO2 widens, so the end-tidal value underestimates PaCO2.",
 "The gap is large in this patient, which only a blood gas can show.",
 "The belief that end-tidal CO2 and PaCO2 are interchangeable after ROSC. The guideline notes the end-tidal value can be falsely low and supports measuring PaCO2.",
 ["aha-2025-pcac","tame-2023"]),
}
refids={r['id'] for r in d['references']}
allq={q['id'] for pr in d['principles'] for q in pr['questions']}
for q in NEW+list(F07.values()):
  for r in q['refs']:
    if r not in refids: sys.exit(f"{q['id']} unknown ref {r}")
  if q['id'] in allq: sys.exit(f"duplicate id {q['id']}")
  if q['kind']=='insufficient-information' and not q.get('missingData'): sys.exit(f"{q['id']} needs missingData")
found=set()
for pr in d['principles']:
  for i,q in enumerate(pr['questions']):
    if q['id'] in F07:
      pr['questions'][i]=F07[q['id']]; found.add(q['id'])
if found!=set(F07): sys.exit(f"F07 targets missing: {set(F07)-found}")
rc=[pr for pr in d['principles'] if pr['id']=='reversible-causes'][0]
rc['questions'].extend(NEW)
open(p,'w').write(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
print(f"0008 ok: {len(NEW)} new questions, {len(F07)} replaced; reversible-causes now has {len(rc['questions'])}")
