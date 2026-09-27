/**
 * Projectile rendering.
 *
 * Each kind has to be identifiable on sight, because in a fight you get one
 * frame of recognition. Form 1 spears are thin gold lines; Form 2 spears are
 * white-gold and drag arcs; the lightning line is a crack, not a ball.
 */

import { GOLD, GOLD_HI, WHITE_GOLD, rgba, mix } from './palette';
import type { Shot } from '../sim/types';

export function drawShot(
  ctx: CanvasRenderingContext2D,
  shot: Shot,
  toScreen: (x: number, y: number) => [number, number],
  zoom: number,
  frame: number,
): void {
  const [x, y] = toScreen(shot.x, shot.y);
  const kind = shot.kind;
  const form2 = kind.startsWith('mk2f2');
  const hot = form2 ? WHITE_GOLD : GOLD_HI;
  const base = form2 ? WHITE_GOLD : GOLD;
  const len = Math.hypot(shot.vx, shot.vy) || 1;
  const ux = (shot.vx / len) * 26 * zoom;
  const uy = (-shot.vy / len) * 26 * zoom;
  const flicker = 0.7 + 0.3 * ((frame + shot.id) & 1);

  ctx.save();
  switch (kind) {
    /* ---------------- Form 1 ---------------- */
    case 'mk2:thunderline-line': {
      // A crack of light lying along the floor line.
      const g = ctx.createLinearGradient(x - ux, y - uy, x + ux * 2, y + uy * 2);
      g.addColorStop(0, 'rgba(240,194,74,0)');
      g.addColorStop(0.5, rgba(base, 0.85 * flicker));
      g.addColorStop(1, 'rgba(255,233,168,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 5 * zoom;
      ctx.beginPath();
      ctx.moveTo(x - ux * 3, y - uy * 3);
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const jx = (Math.sin((frame + i * 2.7) * 1.7) * 3 + (i % 2 ? 4 : -4)) * zoom;
        ctx.lineTo(x - ux * 3 + ux * 6 * t + jx, y - uy * 3 + uy * 6 * t);
      }
      ctx.stroke();
      ctx.strokeStyle = rgba('#fff6d2', 0.9 * flicker);
      ctx.lineWidth = 1.6 * zoom;
      ctx.stroke();
      break;
    }
    case 'mk2:array-spear': {
      // A gold lightning spear travelling as a line.
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(base, 0.35);
      ctx.lineWidth = 9 * zoom;
      ctx.beginPath();
      ctx.moveTo(x - ux * 4, y - uy * 4);
      ctx.lineTo(x + ux, y + uy);
      ctx.stroke();
      ctx.strokeStyle = hot;
      ctx.lineWidth = 2.4 * zoom;
      ctx.beginPath();
      ctx.moveTo(x - ux * 4, y - uy * 4);
      ctx.lineTo(x + ux * 1.6, y + uy * 1.6);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'mk2:judgement-bolt-shot': {
      const r = 12 * zoom;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, rgba(GOLD_HI, 0.9));
      g.addColorStop(1, 'rgba(240,194,74,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.9 * flicker);
      ctx.lineWidth = 2 * zoom;
      ctx.beginPath();
      ctx.moveTo(x - ux * 2, y - uy * 2);
      ctx.lineTo(x + ux * 1.5, y + uy * 1.5);
      ctx.stroke();
      break;
    }
    /* ---------------- Form 2 ---------------- */
    case 'mk2f2:array-spear': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(WHITE_GOLD, 0.4);
      ctx.lineWidth = 14 * zoom;
      ctx.beginPath();
      ctx.moveTo(x - ux * 5, y - uy * 5);
      ctx.lineTo(x + ux, y + uy);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.4 * zoom;
      ctx.beginPath();
      ctx.moveTo(x - ux * 5, y - uy * 5);
      ctx.lineTo(x + ux * 2, y + uy * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'mk2f2:refine-bolt': {
      ctx.globalCompositeOperation = 'lighter';
      const r = 16 * zoom;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, rgba(WHITE_GOLD, 0.95));
      g.addColorStop(1, 'rgba(255,248,224,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'mk2f2:judgement-pillar': {
      // The judgement pillar: a vertical column of judgement falling.
      const h = 520 * zoom;
      const w = 46 * zoom;
      const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, 'rgba(255,248,224,0)');
      g.addColorStop(0.5, rgba(WHITE_GOLD, 0.8 * flicker));
      g.addColorStop(1, 'rgba(255,248,224,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - w, y - h, w * 2, h);
      break;
    }
    case 'mk2f2:divine-arc': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(WHITE_GOLD, 0.9 * flicker);
      ctx.lineWidth = 3 * zoom;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let i = 1; i <= 4; i++) {
        ctx.lineTo(x + Math.sin(frame * 0.4 + i) * 12 * zoom, y - i * 9 * zoom);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'mk2f2:divine-smite': {
      const r = 20 * zoom;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.5, rgba(base, 0.8));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'mk2f2:divine-confine-spear': {
      ctx.strokeStyle = rgba(mix(GOLD, WHITE_GOLD, 0.7), 0.95);
      ctx.lineWidth = 3 * zoom;
      ctx.beginPath();
      ctx.moveTo(x - ux * 6, y - uy * 6);
      ctx.lineTo(x + ux * 2, y + uy * 2);
      ctx.stroke();
      break;
    }
    case 'mk2f2:divine-phase-trail': {
      ctx.globalAlpha = Math.min(1, shot.life / 30);
      ctx.fillStyle = rgba(WHITE_GOLD, 0.5);
      ctx.beginPath();
      ctx.arc(x, y, 7 * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    default: {
      ctx.fillStyle = rgba(base, 0.9);
      ctx.beginPath();
      ctx.arc(x, y, 5 * zoom, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}
