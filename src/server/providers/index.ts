// Generation providers. The rest of the server only talks to this interface,
// so a paid provider (fal.ai, Replicate, a first-party model) is a new file
// here plus an env var; nothing else changes.
//
// The interface is job-shaped (submit, then check) because real image and
// video models are queued, and because it lets serverless functions stay
// short: no request ever waits for a model to finish.

import type { EngineId } from '@/lib/catalog';
import { horde } from './horde';

export interface ImageJobRequest {
  prompt: string;
  engine: EngineId;
  width: number;
  height: number;
  seed: number;
}

export type JobState =
  | { state: 'queued' | 'processing'; queuePosition: number | null; waitSec: number | null }
  | { state: 'done'; image: { bytes: Buffer; mime: string } }
  | { state: 'failed'; reason: string };

export interface ImageProvider {
  name: string;
  submit(req: ImageJobRequest): Promise<{ jobId: string }>;
  check(jobId: string): Promise<JobState>;
  cancel?(jobId: string): Promise<void>;
}

export function imageProvider(): ImageProvider {
  return horde;
}
