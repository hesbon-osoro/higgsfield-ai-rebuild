// Camera-motion engine. One function maps (preset, progress) to a camera
// transform; the live player (CSS transforms) and the .webm export (canvas)
// both render from it, so what you preview is exactly what you download.

export interface CameraFrame {
  scale: number;
  x: number; // translation as a fraction of frame width
  y: number; // translation as a fraction of frame height
  rotate: number; // roll, degrees
  rotateY: number; // yaw, degrees (orbit illusion)
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInExpo = (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));

// Smooth pseudo-random wobble (sum of sines) so handheld motion is organic
// and deterministic for a given time.
function wobble(seconds: number, seed: number) {
  return (
    Math.sin(seconds * 1.7 + seed) * 0.5 +
    Math.sin(seconds * 3.1 + seed * 2.3) * 0.3 +
    Math.sin(seconds * 7.3 + seed * 0.7) * 0.2
  );
}

const BASE: CameraFrame = { scale: 1.12, x: 0, y: 0, rotate: 0, rotateY: 0 };

export function cameraAt(preset: string, t: number, durationSec: number): CameraFrame {
  const p = Math.min(1, Math.max(0, t));
  const s = p * durationSec;
  const e = easeInOut(p);
  switch (preset) {
    case 'dolly-in':
      return { ...BASE, scale: 1.08 + 0.32 * e };
    case 'crash-zoom': {
      // Hold, then a hard punch-in in the middle third, then settle.
      const k = p < 0.35 ? 0 : p > 0.55 ? 1 : easeInExpo((p - 0.35) / 0.2);
      const settle = p > 0.55 ? Math.sin((p - 0.55) * 40) * 0.015 * (1 - p) : 0;
      return { ...BASE, scale: 1.08 + 0.9 * k + settle };
    }
    case 'push-tilt':
      return { ...BASE, scale: 1.12 + 0.25 * e, y: 0.06 - 0.12 * e };
    case 'dolly-out':
      return { ...BASE, scale: 1.45 - 0.35 * e };
    case 'vertigo': {
      const z = 1.1 + 0.35 * e;
      return { ...BASE, scale: z, rotateY: 0, y: -0.01 * e, x: 0, rotate: 0 };
    }
    case 'pan-left':
      return { ...BASE, scale: 1.25, x: 0.09 - 0.18 * e };
    case 'pan-right':
      return { ...BASE, scale: 1.25, x: -0.09 + 0.18 * e };
    case 'tilt-up':
      return { ...BASE, scale: 1.25, y: -0.09 + 0.18 * e };
    case 'tilt-down':
      return { ...BASE, scale: 1.25, y: 0.09 - 0.18 * e };
    case 'orbit':
      return { ...BASE, scale: 1.3, rotateY: -14 + 28 * e, x: 0.06 - 0.12 * e };
    case 'bullet-time': {
      const o = easeOut(p);
      return { ...BASE, scale: 1.35 - 0.1 * o, rotateY: -22 + 44 * o, x: 0.08 - 0.16 * o, rotate: -2 + 4 * o };
    }
    case 'handheld':
      return {
        scale: 1.14,
        x: wobble(s, 1) * 0.012,
        y: wobble(s, 4) * 0.012,
        rotate: wobble(s, 9) * 0.8,
        rotateY: 0,
      };
    case 'earthquake': {
      const amp = 0.004 + 0.03 * p;
      return {
        scale: 1.2,
        x: Math.sin(s * 37) * amp + wobble(s * 3, 2) * amp,
        y: Math.cos(s * 41) * amp + wobble(s * 3, 5) * amp,
        rotate: Math.sin(s * 29) * 1.5 * p,
        rotateY: 0,
      };
    }
    case 'levitate':
      return { ...BASE, scale: 1.16 + 0.06 * e, y: Math.sin(s * 1.2) * 0.02 - 0.03 * e, rotate: Math.sin(s * 0.8) * 1.2 };
    case 'spin':
      return { ...BASE, scale: 1.45, rotate: -25 + 50 * e };
    case 'static':
    default:
      return { ...BASE, scale: 1.1 + 0.02 * p, x: wobble(s * 0.3, 3) * 0.002, y: wobble(s * 0.3, 7) * 0.002 };
  }
}

export function frameToCss(f: CameraFrame): string {
  return `perspective(1200px) translate3d(${(f.x * 100).toFixed(3)}%, ${(f.y * 100).toFixed(3)}%, 0) rotateY(${f.rotateY.toFixed(3)}deg) rotate(${f.rotate.toFixed(3)}deg) scale(${f.scale.toFixed(4)})`;
}
