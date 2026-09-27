/**
 * A tiny software rasteriser for verification.
 *
 * The sandbox has no canvas and no headless browser, so this implements the
 * subset of CanvasRenderingContext2D the game actually draws with, and writes
 * a PNG. It is not the browser's renderer and it is not shipped - it exists so
 * the presentation layer can be looked at during development instead of only
 * being type-checked.
 *
 * Not a dependency: nothing in src/ imports this.
 */

import { deflateSync } from 'node:zlib';

/* ------------------------------------------------------------------ */
/* PNG                                                                 */
/* ------------------------------------------------------------------ */

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(chunk('IHDR', ihdr)),
    Buffer.from(chunk('IDAT', new Uint8Array(deflateSync(raw)))),
    Buffer.from(chunk('IEND', new Uint8Array(0))),
  ]);
}

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

export type Paint =
  | { kind: 'solid'; r: number; g: number; b: number; a: number }
  | { kind: 'linear'; x0: number; y0: number; x1: number; y1: number; stops: { o: number; c: Color }[] }
  | { kind: 'radial'; x0: number; y0: number; r0: number; x1: number; y1: number; r1: number; stops: { o: number; c: Color }[] };

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parse(color: string | CanvasGradient | CanvasPattern, alpha: number): Paint {
  if (typeof color !== 'string') {
    const p = (color as { paint?: Paint }).paint;
    if (p) return p;
    return { kind: 'solid', r: 200, g: 200, b: 200, a: alpha };
  }
  const c = parseColor(color, alpha);
  if (c.a <= 0) return { kind: 'solid', r: 0, g: 0, b: 0, a: 0 };
  return { kind: 'solid', ...c, a: c.a * alpha };
}

export function parseColor(color: string, alpha = 1): Color {
  if (color.startsWith('#')) {
    const h = color.slice(1);
    const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : alpha,
    };
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((s) => s.trim());
    return {
      r: Number(parts[0]),
      g: Number(parts[1]),
      b: Number(parts[2]),
      a: parts[3] !== undefined ? Number(parts[3]) : alpha,
    };
  }
  if (color === 'white') return { r: 255, g: 255, b: 255, a: alpha };
  if (color === 'black') return { r: 0, g: 0, b: 0, a: alpha };
  return { r: 255, g: 0, b: 255, a: alpha };
}

function sampleStops(stops: { o: number; c: Color }[], t: number): Color {
  if (stops.length === 0) return { r: 0, g: 0, b: 0, a: 0 };
  if (t <= stops[0].o) return stops[0].c;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].o) {
      const a = stops[i - 1];
      const b = stops[i];
      const k = (t - a.o) / Math.max(1e-6, b.o - a.o);
      return {
        r: a.c.r + (b.c.r - a.c.r) * k,
        g: a.c.g + (b.c.g - a.c.g) * k,
        b: a.c.b + (b.c.b - a.c.b) * k,
        a: a.c.a + (b.c.a - a.c.a) * k,
      };
    }
  }
  return stops[stops.length - 1].c;
}

/* ------------------------------------------------------------------ */
/* Surface                                                             */
/* ------------------------------------------------------------------ */

export class Surface {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  blend(x: number, y: number, c: Color, alpha: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const a = Math.max(0, Math.min(1, alpha * c.a));
    if (a <= 0) return;
    const i = (y * this.width + x) * 4;
    const inv = 1 - a;
    this.data[i] = c.r * a + this.data[i] * inv;
    this.data[i + 1] = c.g * a + this.data[i + 1] * inv;
    this.data[i + 2] = c.b * a + this.data[i + 2] * inv;
    this.data[i + 3] = 255;
  }

  png(): Buffer {
    return encodePng(this.width, this.height, this.data);
  }
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

type Pt = { x: number; y: number };

function flattenArc(out: Pt[], cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, rot = 0): void {
  const span = a1 - a0;
  const steps = Math.max(6, Math.min(64, Math.ceil(Math.abs(span) / 0.25)));
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (span * i) / steps;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push({ x: cx + x * cos - y * sin, y: cy + x * sin + y * cos });
  }
}

function fillPolys(surf: Surface, polys: Pt[][], paint: Paint, alpha: number, lighter: boolean): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(surf.height - 1, Math.ceil(maxY));
  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    xs.length = 0;
    const cy = y + 0.5;
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (a.y === b.y) continue;
        if (cy >= Math.min(a.y, b.y) && cy < Math.max(a.y, b.y)) {
          xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.round(xs[i]));
      const xb = Math.min(surf.width - 1, Math.round(xs[i + 1]) - 1);
      for (let x = xa; x <= xb; x++) {
        const c = paintAt(paint, x + 0.5, cy);
        if (lighter) addLight(surf, x, y, c, alpha);
        else surf.blend(x, y, c, alpha);
      }
    }
  }
}

function addLight(surf: Surface, x: number, y: number, c: Color, alpha: number): void {
  const a = Math.max(0, Math.min(1, alpha * c.a));
  if (a <= 0) return;
  const i = (y * surf.width + x) * 4;
  surf.data[i] = Math.min(255, surf.data[i] + c.r * a);
  surf.data[i + 1] = Math.min(255, surf.data[i + 1] + c.g * a);
  surf.data[i + 2] = Math.min(255, surf.data[i + 2] + c.b * a);
  surf.data[i + 3] = 255;
}

function paintAt(paint: Paint, x: number, y: number): Color {
  if (paint.kind === 'solid') return paint;
  if (paint.kind === 'linear') {
    const dx = paint.x1 - paint.x0;
    const dy = paint.y1 - paint.y0;
    const len2 = dx * dx + dy * dy || 1;
    const t = ((x - paint.x0) * dx + (y - paint.y0) * dy) / len2;
    return sampleStops(paint.stops, Math.max(0, Math.min(1, t)));
  }
  const d = Math.hypot(x - paint.x1, y - paint.y1);
  const t = (d - paint.r0) / Math.max(1e-6, paint.r1 - paint.r0);
  return sampleStops(paint.stops, Math.max(0, Math.min(1, t)));
}

function strokePolys(surf: Surface, polys: Pt[][], paint: Paint, width: number, alpha: number, lighter: boolean): void {
  const w = Math.max(0.6, width);
  const quads: Pt[][] = [];
  const dots: Pt[] = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const nx = (-dy / len) * (w / 2);
      const ny = (dx / len) * (w / 2);
      quads.push([
        { x: a.x + nx, y: a.y + ny },
        { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny },
        { x: a.x - nx, y: a.y - ny },
      ]);
      dots.push(a, b);
    }
  }
  for (const q of quads) fillPolys(surf, [q], paint, alpha, lighter);
  if (w > 2.2) {
    for (const d of dots) fillPolys(surf, [circle(d.x, d.y, w / 2)], paint, alpha, lighter);
  }
}

function circle(cx: number, cy: number, r: number): Pt[] {
  const out: Pt[] = [];
  const steps = Math.max(8, Math.min(40, Math.ceil(r * 2)));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

export class Mat {
  constructor(
    readonly a = 1,
    readonly b = 0,
    readonly c = 0,
    readonly d = 1,
    readonly e = 0,
    readonly f = 0,
  ) {}

  static get identity(): Mat {
    return new Mat();
  }

  translate(x: number, y: number): Mat {
    return new Mat(this.a, this.b, this.c, this.d, this.e + this.a * x + this.c * y, this.f + this.b * x + this.d * y);
  }

  scale(x: number, y: number): Mat {
    return new Mat(this.a * x, this.b * x, this.c * y, this.d * y, this.e, this.f);
  }

  multiply(m: Mat): Mat {
    return new Mat(
      this.a * m.a + this.c * m.b,
      this.b * m.a + this.d * m.b,
      this.a * m.c + this.c * m.d,
      this.b * m.c + this.d * m.d,
      this.a * m.e + this.c * m.f + this.e,
      this.b * m.e + this.d * m.f + this.f,
    );
  }

  apply(x: number, y: number): Pt {
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f };
  }
}

interface State {
  fill: Paint | string;
  stroke: Paint | string;
  lineWidth: number;
  alpha: number;
  mat: Mat;
  composite: GlobalCompositeOperation;
  font: string;
  align: CanvasTextAlign;
}

/**
 * A CanvasRenderingContext2D-compatible surface for verification.
 */
export class RasterContext {
  private state: State = {
    fill: '#000',
    stroke: '#000',
    lineWidth: 1,
    alpha: 1,
    mat: Mat.identity,
    composite: 'source-over',
    font: '10px sans-serif',
    align: 'left',
  };
  private stack: State[] = [];
  private sub: Pt[] = [];
  private current: Pt[] | null = null;
  /** Text drawn, for layout assertions. */
  readonly texts: { s: string; x: number; y: number; size: number }[] = [];
  /** Text is drawn as a faint bar: this rasteriser has no fonts. */
  drawTextBars = true;

  constructor(readonly surf: Surface) {}

  /* ---- state ---- */
  save(): void {
    this.stack.push({ ...this.state });
  }

  restore(): void {
    const s = this.stack.pop();
    if (s) this.state = s;
  }

  get fillStyle(): unknown {
    return this.state.fill;
  }

  set fillStyle(v: unknown) {
    this.state.fill = v as Paint;
  }

  get strokeStyle(): unknown {
    return this.state.stroke;
  }

  set strokeStyle(v: unknown) {
    this.state.stroke = v as Paint;
  }

  get lineWidth(): number {
    return this.state.lineWidth;
  }

  set lineWidth(v: number) {
    this.state.lineWidth = v;
  }

  get globalAlpha(): number {
    return this.state.alpha;
  }

  set globalAlpha(v: number) {
    this.state.alpha = v;
  }

  get globalCompositeOperation(): GlobalCompositeOperation {
    return this.state.composite;
  }

  set globalCompositeOperation(v: GlobalCompositeOperation) {
    this.state.composite = v;
  }

  get font(): string {
    return this.state.font;
  }

  set font(v: string) {
    this.state.font = v;
  }

  get textAlign(): CanvasTextAlign {
    return this.state.align;
  }

  set textAlign(v: CanvasTextAlign) {
    this.state.align = v;
  }

  get textBaseline(): CanvasTextBaseline {
    return 'alphabetic';
  }

  set textBaseline(_v: CanvasTextBaseline) {
    /* fixed */
  }

  lineCap = 'butt';
  lineJoin = 'miter';
  miterLimit = 10;
  filter = 'none';
  lineDashOffset = 0;
  canvas = { width: 0, height: 0 };

  /* ---- transform ---- */
  translate(x: number, y: number): void {
    this.state.mat = this.state.mat.translate(x, y);
  }

  scale(x: number, y: number): void {
    this.state.mat = this.state.mat.scale(x, y);
  }

  rotate(a: number): void {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.state.mat = this.state.mat.multiply(new Mat(c, s, -s, c, 0, 0));
  }

  setTransform(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0): void {
    this.state.mat = new Mat(a, b, c, d, e, f);
  }

  resetTransform(): void {
    this.state.mat = Mat.identity;
  }

  /* ---- paths ---- */
  beginPath(): void {
    this.sub = [];
    this.current = null;
  }

  closePath(): void {
    if (this.current) this.current.push(this.current[0]);
  }

  moveTo(x: number, y: number): void {
    this.current = [this.state.mat.apply(x, y)];
    this.sub.push(this.current);
  }

  lineTo(x: number, y: number): void {
    if (!this.current) this.moveTo(x, y);
    else this.current.push(this.state.mat.apply(x, y));
  }

  arc(x: number, y: number, r: number, a0: number, a1: number): void {
    const c = this.state.mat.apply(x, y);
    const out: Pt[] = [];
    flattenArc(out, c.x, c.y, r * Math.abs(this.state.mat.a), r * Math.abs(this.state.mat.d), a0, a1);
    if (this.current) this.current.push(...out);
    else this.sub.push(out);
  }

  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rot: number,
    a0: number,
    a1: number,
  ): void {
    const c = this.state.mat.apply(x, y);
    const out: Pt[] = [];
    flattenArc(out, c.x, c.y, rx * Math.abs(this.state.mat.a), ry * Math.abs(this.state.mat.d), a0, a1, rot);
    if (this.current) this.current.push(...out);
    else this.sub.push(out);
  }

  rect(x: number, y: number, w: number, h: number): void {
    const p0 = this.state.mat.apply(x, y);
    const p1 = this.state.mat.apply(x + w, y);
    const p2 = this.state.mat.apply(x + w, y + h);
    const p3 = this.state.mat.apply(x, y + h);
    this.sub.push([p0, p1, p2, p3]);
  }

  /* ---- painting ---- */
  fill(): void {
    fillPolys(this.surf, this.sub, parse(this.state.fill as string, this.state.alpha), this.state.alpha, this.state.composite === 'lighter');
  }

  stroke(): void {
    strokePolys(
      this.surf,
      this.sub,
      parse(this.state.stroke as string, this.state.alpha),
      this.state.lineWidth,
      this.state.alpha,
      this.state.composite === 'lighter',
    );
  }

  clip(): void {
    /* not needed by the game's own drawing */
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const p0 = this.state.mat.apply(x, y);
    const p1 = this.state.mat.apply(x + w, y);
    const p2 = this.state.mat.apply(x + w, y + h);
    const p3 = this.state.mat.apply(x, y + h);
    fillPolys(this.surf, [[p0, p1, p2, p3]], parse(this.state.fill as string, this.state.alpha), this.state.alpha, this.state.composite === 'lighter');
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    const p0 = this.state.mat.apply(x, y);
    const p1 = this.state.mat.apply(x + w, y);
    const p2 = this.state.mat.apply(x + w, y + h);
    const p3 = this.state.mat.apply(x, y + h);
    strokePolys(this.surf, [[p0, p1, p2, p3]], parse(this.state.stroke as string, this.state.alpha), this.state.lineWidth, this.state.alpha, this.state.composite === 'lighter');
  }

  fillText(s: string, x: number, y: number): void {
    const p = this.state.mat.apply(x, y);
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.state.font)?.[1] ?? 12);
    this.texts.push({ s, x: p.x, y: p.y, size });
    if (!this.drawTextBars) return;
    // A translucent bar where the glyphs would be: enough to verify layout.
    const width = s.length * size * 0.52;
    const left = this.state.align === 'center' ? p.x - width / 2 : this.state.align === 'right' ? p.x - width : p.x;
    const paint = parse(this.state.fill as string, this.state.alpha * 0.55);
    fillPolys(
      this.surf,
      [[
        { x: left, y: p.y - size * 0.72 },
        { x: left + width, y: p.y - size * 0.72 },
        { x: left + width, y: p.y + size * 0.12 },
        { x: left, y: p.y + size * 0.12 },
      ]],
      paint,
      this.state.alpha,
      false,
    );
  }

  strokeText(): void {}
  measureText(s: string): { width: number } {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.state.font)?.[1] ?? 12);
    return { width: s.length * size * 0.52 };
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    const a = this.state.mat.apply(x0, y0);
    const b = this.state.mat.apply(x1, y1);
    const stops: { o: number; c: Color }[] = [];
    const g = {
      addColorStop: (o: number, c: string) => {
        stops.push({ o, c: parseColor(c, this.state.alpha) });
      },
      paint: { kind: 'linear', x0: a.x, y0: a.y, x1: b.x, y1: b.y, stops } as Paint,
    };
    return g as unknown as CanvasGradient;
  }

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient {
    const a = this.state.mat.apply(x0, y0);
    const b = this.state.mat.apply(x1, y1);
    const stops: { o: number; c: Color }[] = [];
    const g = {
      addColorStop: (o: number, c: string) => {
        stops.push({ o, c: parseColor(c, this.state.alpha) });
      },
      paint: {
        kind: 'radial',
        x0: a.x,
        y0: a.y,
        r0: r0 * Math.abs(this.state.mat.a),
        x1: b.x,
        y1: b.y,
        r1: r1 * Math.abs(this.state.mat.a),
        stops,
      } as Paint,
    };
    return g as unknown as CanvasGradient;
  }

  createPattern(): CanvasPattern {
    return {} as CanvasPattern;
  }

  getImageData(): ImageData {
    return { data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: 'srgb' } as ImageData;
  }

  putImageData(): void {}
  drawImage(): void {}
  setLineDash(): void {}
  getLineDash(): number[] {
    return [];
  }
}
