// Shared product catalog: engines, motion presets, aspect ratios and pricing.
// Imported by both the server (to validate and charge) and the client (to
// show the cost on the Generate button), so the two can never disagree.

export type Kind = 'IMAGE' | 'VIDEO';

export type EngineId = 'photo' | 'cinema' | 'illustration' | 'draft';

export interface Engine {
  id: EngineId;
  name: string;
  blurb: string;
  bestFor: string;
  speed: 'Fastest' | 'Fast' | 'Standard';
  cost: number; // credits per image
  models: string; // the checkpoints behind the engine, shown for transparency
  // Style conditioning appended to the prompt by the demo provider.
  styleSuffix: string;
}

export const ENGINES: Engine[] = [
  {
    id: 'photo',
    name: 'Photo',
    blurb: 'Photoreal people, products and places',
    bestFor: 'Portraits, fashion, product shots',
    speed: 'Fast',
    cost: 2,
    models: 'Deliberate · Realistic Vision · AbsoluteReality',
    styleSuffix: 'photorealistic, editorial photography, natural light, fine skin texture, 50mm lens, sharp focus',
  },
  {
    id: 'cinema',
    name: 'Cinema',
    blurb: 'Film stills with lenses and lighting',
    bestFor: 'Scenes, moods, keyframes for motion',
    speed: 'Standard',
    cost: 3,
    models: 'Deliberate · Dreamshaper · Realistic Vision',
    styleSuffix: 'cinematic film still, anamorphic lens, dramatic lighting, shallow depth of field, color graded, 35mm film grain',
  },
  {
    id: 'illustration',
    name: 'Illustration',
    blurb: 'Anime, painterly and graphic styles',
    bestFor: 'Characters, concept art, posters',
    speed: 'Fast',
    cost: 2,
    models: 'Anything v5 · Abyss OrangeMix · Dreamshaper',
    styleSuffix: 'highly detailed illustration, clean line art, rich color palette, concept art',
  },
  {
    id: 'draft',
    name: 'Draft',
    blurb: 'Quick explorations before you commit',
    bestFor: 'Trying ideas cheaply',
    speed: 'Fastest',
    cost: 1,
    models: 'Dreamshaper · Deliberate, fewer steps',
    styleSuffix: '',
  },
];

export const ENGINE_BY_ID = Object.fromEntries(ENGINES.map((e) => [e.id, e])) as Record<EngineId, Engine>;

const ILLUSTRATION_HINTS = /\b(anime|manga|cartoon|illustrat\w*|drawing|painting|watercolou?r|pixel art|comic|sketch|vector|poster|3d render|clay)\b/i;
const CINEMA_HINTS = /\b(film|cinematic|movie|scene|shot|noir|epic|establishing|dramatic|trailer|keyframe|landscape|city|street)\b/i;

// "Auto" picks an engine from the prompt so a first-time user never has to
// make a model decision before seeing a result.
export function resolveAutoEngine(prompt: string, kind: Kind): EngineId {
  if (ILLUSTRATION_HINTS.test(prompt)) return 'illustration';
  if (kind === 'VIDEO' || CINEMA_HINTS.test(prompt)) return 'cinema';
  return 'photo';
}

export type AspectId = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

// Render sizes suit the SD 1.5-class checkpoints behind the demo provider
// (multiples of 64, around 0.4 megapixels).
export const ASPECTS: { id: AspectId; width: number; height: number; label: string }[] = [
  { id: '1:1', width: 640, height: 640, label: 'Square' },
  { id: '3:4', width: 576, height: 768, label: 'Portrait' },
  { id: '4:3', width: 768, height: 576, label: 'Landscape' },
  { id: '9:16', width: 448, height: 768, label: 'Story' },
  { id: '16:9', width: 768, height: 448, label: 'Widescreen' },
];

export const ASPECT_BY_ID = Object.fromEntries(ASPECTS.map((a) => [a.id, a])) as Record<AspectId, (typeof ASPECTS)[number]>;

export type MotionCategory = 'Push' | 'Pull' | 'Pan & tilt' | 'Orbit' | 'Handheld' | 'Stylized';

export interface MotionPreset {
  id: string;
  name: string;
  category: MotionCategory;
  description: string;
}

export const MOTION_PRESETS: MotionPreset[] = [
  { id: 'dolly-in', name: 'Dolly In', category: 'Push', description: 'Slow, steady push toward the subject' },
  { id: 'crash-zoom', name: 'Crash Zoom', category: 'Push', description: 'Hard, fast punch-in for impact' },
  { id: 'push-tilt', name: 'Push + Tilt', category: 'Push', description: 'Push in while tilting up to reveal' },
  { id: 'dolly-out', name: 'Dolly Out', category: 'Pull', description: 'Pull back to reveal the scene' },
  { id: 'vertigo', name: 'Vertigo', category: 'Pull', description: 'Dolly zoom: background stretches, subject holds' },
  { id: 'pan-left', name: 'Pan Left', category: 'Pan & tilt', description: 'Lateral sweep to the left' },
  { id: 'pan-right', name: 'Pan Right', category: 'Pan & tilt', description: 'Lateral sweep to the right' },
  { id: 'tilt-up', name: 'Tilt Up', category: 'Pan & tilt', description: 'Camera tilts up the frame' },
  { id: 'tilt-down', name: 'Tilt Down', category: 'Pan & tilt', description: 'Camera tilts down the frame' },
  { id: 'orbit', name: 'Orbit', category: 'Orbit', description: 'Arc around the subject' },
  { id: 'bullet-time', name: 'Bullet Time', category: 'Orbit', description: 'Frozen moment, sweeping arc' },
  { id: 'handheld', name: 'Handheld', category: 'Handheld', description: 'Documentary-style breathing camera' },
  { id: 'earthquake', name: 'Earthquake', category: 'Handheld', description: 'Violent shake, rising intensity' },
  { id: 'levitate', name: 'Levitate', category: 'Stylized', description: 'Dreamy float and drift' },
  { id: 'spin', name: 'Barrel Roll', category: 'Stylized', description: 'Camera rolls around its axis' },
  { id: 'static', name: 'Locked Off', category: 'Stylized', description: 'Tripod shot, subtle life' },
];

export const PRESET_BY_ID = Object.fromEntries(MOTION_PRESETS.map((p) => [p.id, p])) as Record<string, MotionPreset>;

export const DURATIONS = [5, 10] as const;
export type Duration = (typeof DURATIONS)[number];

export const MAX_IMAGES_PER_BATCH = 4;
export const STARTER_CREDITS = 150;
export const MAX_PROMPT_LENGTH = 1500;

export const TOP_UP_PACKS = [
  { id: 'small', credits: 100, label: 'Starter', price: '$5' },
  { id: 'medium', credits: 500, label: 'Creator', price: '$20' },
  { id: 'large', credits: 1500, label: 'Studio', price: '$50' },
] as const;

const VIDEO_COST: Record<Duration, number> = { 5: 6, 10: 10 };

export interface CostInput {
  kind: Kind;
  engine: EngineId;
  count: number;
  duration?: Duration;
  hasStartFrame?: boolean;
}

// Total credits for one Generate click. A video without a start frame needs a
// keyframe first, which is charged at the engine's image price.
export function quoteCost({ kind, engine, count, duration, hasStartFrame }: CostInput): number {
  if (kind === 'IMAGE') return ENGINE_BY_ID[engine].cost * count;
  const motion = VIDEO_COST[duration ?? 5];
  return motion + (hasStartFrame ? 0 : ENGINE_BY_ID[engine].cost);
}
