import type { EngineId } from '@/lib/catalog';
import type { ImageProvider, JobState } from './index';

// AI Horde: a free, crowdsourced Stable Diffusion network. Works anonymously;
// set HORDE_API_KEY (free at aihorde.net) for better queue priority.
const API = 'https://aihorde.net/api/v2';
const CLIENT_AGENT = 'parallax-higgsfield-rebuild:1.0:github.com/hesbon-osoro';

// Each engine is a set of real, different checkpoints. Listing several lets
// any idle worker that serves one of them pick the job up.
const ENGINE_MODELS: Record<EngineId, { models: string[]; steps: number; cfg: number }> = {
  photo: { models: ['Deliberate', 'Realistic Vision', 'AbsoluteReality', "ICBINP - I Can't Believe It's Not Photography"], steps: 25, cfg: 6.5 },
  cinema: { models: ['Deliberate', 'Dreamshaper', 'Realistic Vision'], steps: 25, cfg: 7 },
  illustration: { models: ['Anything v5', 'Abyss OrangeMix', 'Dreamshaper'], steps: 25, cfg: 7.5 },
  draft: { models: ['Dreamshaper', 'Deliberate'], steps: 14, cfg: 6 },
};

const NEGATIVE = 'lowres, blurry, watermark, text, signature, jpeg artifacts, deformed, extra limbs, bad anatomy, nsfw';

function headers() {
  return {
    apikey: process.env.HORDE_API_KEY || '0000000000',
    'Client-Agent': CLIENT_AGENT,
    'content-type': 'application/json',
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Horde rate-limits per IP (e.g. "2 per 1 second"); back off and retry
// rather than failing the user's job.
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, { ...init, headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429 && attempt < 5) {
      await sleep(600 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(body?.message || `Image provider error ${res.status}`);
    return body as T;
  }
}

export const horde: ImageProvider = {
  name: 'aihorde',

  async submit({ prompt, engine, width, height, seed }) {
    const cfg = ENGINE_MODELS[engine];
    const body = {
      prompt: `${prompt} ### ${NEGATIVE}`,
      models: cfg.models,
      params: {
        width,
        height,
        steps: cfg.steps,
        cfg_scale: cfg.cfg,
        sampler_name: 'k_euler_a',
        seed: String(seed),
        n: 1,
        karras: true,
      },
      nsfw: false,
      censor_nsfw: true,
      r2: true,
      shared: false,
    };
    const res = await call<{ id: string }>('/generate/async', { method: 'POST', body: JSON.stringify(body) });
    if (!res.id) throw new Error('Image provider did not accept the job');
    return { jobId: res.id };
  },

  async check(jobId): Promise<JobState> {
    const c = await call<{
      done: boolean;
      faulted: boolean;
      is_possible: boolean;
      processing: number;
      queue_position: number;
      wait_time: number;
    }>(`/generate/check/${jobId}`);
    if (c.faulted) return { state: 'failed', reason: 'The model worker failed on this job' };
    if (!c.is_possible) return { state: 'failed', reason: 'No worker can run this job right now' };
    if (!c.done) {
      return {
        state: c.processing > 0 ? 'processing' : 'queued',
        queuePosition: c.queue_position ?? null,
        waitSec: c.wait_time ?? null,
      };
    }
    const s = await call<{ generations: { img: string; censored: boolean }[] }>(`/generate/status/${jobId}`);
    const gen = s.generations?.[0];
    if (!gen?.img) return { state: 'failed', reason: 'The provider returned no image' };
    if (gen.censored) return { state: 'failed', reason: 'The image was blocked by the safety filter' };
    const img = await fetch(gen.img, { signal: AbortSignal.timeout(30_000) });
    if (!img.ok) return { state: 'failed', reason: `Could not download the image (${img.status})` };
    const mime = img.headers.get('content-type')?.split(';')[0] || 'image/webp';
    return { state: 'done', image: { bytes: Buffer.from(await img.arrayBuffer()), mime } };
  },

  async cancel(jobId) {
    await call(`/generate/status/${jobId}`, { method: 'DELETE' }).catch(() => undefined);
  },
};
