'use client';

import { cameraAt } from './motion';

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the frame'));
    img.src = src;
  });
}

function pickMime() {
  const options = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

export function canExportVideo() {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(pickMime());
}

// Renders the camera move to a canvas in real time and records it. Uses the
// same cameraAt() as the live player, so the file matches the preview.
export async function exportMotionVideo(opts: {
  src: string;
  preset: string;
  durationSec: number;
  width: number;
  height: number;
  onProgress?: (p: number) => void;
}): Promise<Blob> {
  const img = await loadImage(opts.src);
  const scale = Math.min(1, 1280 / Math.max(opts.width, opts.height));
  const W = Math.round((opts.width * scale) / 2) * 2;
  const H = Math.round((opts.height * scale) / 2) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';

  // object-fit: cover
  const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * cover;
  const dh = img.naturalHeight * cover;

  const draw = (t: number) => {
    const f = cameraAt(opts.preset, t, opts.durationSec);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2 + f.x * W, H / 2 + f.y * H);
    const yaw = (f.rotateY * Math.PI) / 180;
    // Approximate a perspective yaw with horizontal squash plus a slight shear.
    ctx.transform(Math.cos(yaw), Math.sin(yaw) * 0.12, 0, 1, 0, 0);
    ctx.rotate((f.rotate * Math.PI) / 180);
    ctx.scale(f.scale, f.scale);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  };

  const mimeType = pickMime();
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (recorder.onstop = () => r()));

  draw(0);
  recorder.start(250);
  const total = opts.durationSec * 1000;
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / total);
      draw(t);
      opts.onProgress?.(t);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  return new Blob(chunks, { type: mimeType.split(';')[0] || 'video/webm' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
