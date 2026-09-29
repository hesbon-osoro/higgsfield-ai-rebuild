// One-off: renders the curated Explore recipes through the real provider and
// writes them to seed/ as fixtures (JSON + image files). `npm run db:seed`
// then loads the fixtures into any database without waiting on a model queue.
//
//   npx tsx scripts/seed-generate.ts

import fs from 'node:fs';
import path from 'node:path';
import { ASPECT_BY_ID, ENGINE_BY_ID, type AspectId, type EngineId } from '../src/lib/catalog';
import { imageProvider } from '../src/server/providers';

interface Recipe {
  key: string;
  prompt: string;
  engine: EngineId;
  aspect: AspectId;
  seed: number;
  motion?: { preset: string; duration: 5 | 10 };
}

const RECIPES: Recipe[] = [
  { key: 'paris-snow', prompt: 'Portrait of a young woman in a red wool coat on a snowy Paris street, falling snow, bokeh lights', engine: 'photo', aspect: '3:4', seed: 1101, motion: { preset: 'dolly-in', duration: 5 } },
  { key: 'astronaut-sunflowers', prompt: 'A lone astronaut standing in a vast sunflower field at golden hour', engine: 'cinema', aspect: '16:9', seed: 2202, motion: { preset: 'push-tilt', duration: 5 } },
  { key: 'ramen-rain', prompt: 'Neon-lit ramen stall in the rain, Tokyo alley at night, steam rising, reflections on wet asphalt', engine: 'cinema', aspect: '16:9', seed: 3303, motion: { preset: 'pan-right', duration: 5 } },
  { key: 'rooftop-anime', prompt: 'Anime girl on a rooftop at sunset, wind in her hair, city skyline below, warm clouds', engine: 'illustration', aspect: '3:4', seed: 4404, motion: { preset: 'levitate', duration: 5 } },
  { key: 'watch-rock', prompt: 'Luxury steel wristwatch on black volcanic rock, water droplets, dramatic studio lighting, product photography', engine: 'photo', aspect: '1:1', seed: 5505, motion: { preset: 'orbit', duration: 5 } },
  { key: 'jungle-temple', prompt: 'Ancient stone temple ruins in a misty jungle, shafts of light through the canopy, explorers in the distance', engine: 'cinema', aspect: '16:9', seed: 6606, motion: { preset: 'dolly-out', duration: 10 } },
  { key: 'skater-lagos', prompt: 'Street portrait of a young skateboarder in Lagos, vivid colorful clothes, afternoon sun, shallow depth of field', engine: 'photo', aspect: '3:4', seed: 7707 },
  { key: 'wizard-library', prompt: 'Cozy wizard library with floating candles and towering bookshelves, painterly fantasy illustration', engine: 'illustration', aspect: '1:1', seed: 8808, motion: { preset: 'handheld', duration: 5 } },
  { key: 'surfer-wave', prompt: 'Surfer riding a giant turquoise wave, aerial view, spray and foam, bright sunlight', engine: 'cinema', aspect: '9:16', seed: 9909, motion: { preset: 'tilt-down', duration: 5 } },
  { key: 'desert-car', prompt: 'Red vintage sports car on an empty desert highway at dusk, long shadows, cinematic', engine: 'cinema', aspect: '4:3', seed: 1212, motion: { preset: 'crash-zoom', duration: 5 } },
  { key: 'viking-fjord', prompt: 'Viking longship sailing through a fjord in a storm, lightning, crashing waves, epic scene', engine: 'cinema', aspect: '16:9', seed: 1313, motion: { preset: 'earthquake', duration: 5 } },
  { key: 'samurai-blossom', prompt: 'Samurai standing in a field of cherry blossoms, petals in the wind, ink and watercolor style', engine: 'illustration', aspect: '3:4', seed: 1414, motion: { preset: 'bullet-time', duration: 5 } },
  { key: 'coffee-still', prompt: 'Overhead shot of a latte with heart latte art on a rustic wooden table, morning light, croissant', engine: 'photo', aspect: '1:1', seed: 1515 },
  { key: 'lighthouse', prompt: 'A lighthouse on a cliff at dusk, calm sea, pastel sky, film scene', engine: 'cinema', aspect: '16:9', seed: 1616, motion: { preset: 'vertigo', duration: 5 } },
];

const OUT = path.join(process.cwd(), 'seed');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function styled(r: Recipe) {
  const suffix = ENGINE_BY_ID[r.engine].styleSuffix;
  return suffix ? `${r.prompt}, ${suffix}` : r.prompt;
}

async function render(r: Recipe): Promise<string | null> {
  const file = path.join(OUT, 'images', `${r.key}.webp`);
  if (fs.existsSync(file)) return file;
  const provider = imageProvider();
  const { width, height } = ASPECT_BY_ID[r.aspect];
  for (let attempt = 1; attempt <= 3; attempt++) {
    let jobId: string;
    try {
      ({ jobId } = await provider.submit({ prompt: styled(r), engine: r.engine, width, height, seed: r.seed }));
    } catch (e) {
      console.log(`✗ ${r.key} submit ${attempt}: ${(e as Error).message}`);
      await sleep(3000);
      continue;
    }
    const started = Date.now();
    while (Date.now() - started < 20 * 60 * 1000) {
      await sleep(5000);
      const job = await provider.check(jobId).catch(() => null);
      if (!job) continue;
      if (job.state === 'done') {
        fs.writeFileSync(file, job.image.bytes);
        console.log(`✓ ${r.key} (${Math.round((Date.now() - started) / 1000)}s)`);
        return file;
      }
      if (job.state === 'failed') {
        console.log(`✗ ${r.key} attempt ${attempt}: ${job.reason}`);
        break;
      }
    }
  }
  return null;
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'images'), { recursive: true });
  // A few at a time: anonymous Horde users get limited concurrency.
  const queue = [...RECIPES];
  const workers = Array.from({ length: 3 }, async (_, w) => {
    await sleep(w * 1500);
    while (queue.length) await render(queue.shift()!);
  });
  await Promise.all(workers);
  const done = RECIPES.filter((r) => fs.existsSync(path.join(OUT, 'images', `${r.key}.webp`)));
  fs.writeFileSync(path.join(OUT, 'fixtures.json'), JSON.stringify(done, null, 2) + '\n');
  console.log(`wrote ${done.length}/${RECIPES.length} recipes`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
