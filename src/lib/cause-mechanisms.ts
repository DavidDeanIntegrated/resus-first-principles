/**
 * Groups for the reversible-cause overlap figure.
 * A cause is listed only where the case text already names that mechanism:
 * preload is the "too little to pump" pair (hypovolemia, and tension as loss of venous return);
 * tension is also an obstruction, so it is listed again under afterload / obstruction with tamponade and pulmonary thrombosis;
 * pump, oxygenation, and electrical substrate follow each cause's own failure text.
 */

export const causeMechanismGroups = [
  {
    id: 'preload',
    label: 'Preload',
    causeIds: ['hypovolemia', 'tension-pneumothorax'],
  },
  {
    id: 'pump',
    label: 'Pump',
    causeIds: ['hydrogen-ion', 'hypothermia', 'toxins', 'coronary-thrombosis'],
  },
  {
    id: 'afterload-obstruction',
    label: 'Afterload / obstruction',
    causeIds: ['tension-pneumothorax', 'tamponade', 'pulmonary-thrombosis'],
  },
  {
    id: 'oxygenation',
    label: 'Oxygenation',
    causeIds: ['hypoxia', 'toxins'],
  },
  {
    id: 'electrical-substrate',
    label: 'Electrical substrate',
    causeIds: [
      'hydrogen-ion',
      'hyperkalemia',
      'hypokalemia',
      'hypothermia',
      'toxins',
      'coronary-thrombosis',
    ],
  },
] as const;

export type CauseMechanismGroup = (typeof causeMechanismGroups)[number];

function englishJoin(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function overlapCaption(causeNames: Readonly<Record<string, string>>): string {
  const sentences = causeMechanismGroups.map((group) => {
    const names = group.causeIds.map((id) => {
      const name = causeNames[id];
      if (!name) throw new Error(`Overlap figure is missing the case label for ${id}`);
      return name;
    });
    return `${group.label} shows ${englishJoin(names)}.`;
  });
  return `Schematic, not measured data. Each reversible cause is drawn under the mechanism it disrupts, and each name links to that cause. ${sentences.join(' ')} A name is repeated when the cause is drawn under more than one mechanism. The drawing ranks none of them and shows no measured weight.`;
}

export const overlapTitle =
  'Schematic, not measured data. Reversible causes grouped by the mechanism they disrupt: preload, pump, afterload or obstruction, oxygenation, and electrical substrate. Each name links to that cause. A repeated name is the same cause under more than one mechanism. The drawing ranks none of them and shows no measured weight.';
