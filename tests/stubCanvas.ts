/**
 * Headless render harness.
 *
 * The renderer talks to a real CanvasRenderingContext2D. In Node there is no
 * canvas, so this provides a recording stub that implements the subset of the
 * API the game draws with. Running the real render path against it proves the
 * presentation code is free of runtime errors, NaN coordinates and unbounded
 * particle growth - things a type checker cannot see.
 */

export interface Recorded {
  ops: string;
  paths: number;
  strokes: number;
  fills: number;
  texts: string[];
  /** Every coordinate the renderer emitted, so NaN can be detected. */
  coords: number[];
}

type Ctx = CanvasRenderingContext2D;

function isBad(v: number): boolean {
  return !Number.isFinite(v);
}

/** A drawing context that records and validates. */
export class StubContext {
  readonly rec: Recorded = { ops: '', paths: 0, strokes: 0, fills: 0, texts: [], coords: [] };
  canvas = { width: 1280, height: 720 };
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  lineWidth = 1;
  lineCap = 'round' as CanvasLineCap;
  lineJoin = 'miter' as CanvasLineJoin;
  globalAlpha = 1;
  globalCompositeOperation = 'source-over' as GlobalCompositeOperation;
  font = '10px sans-serif';
  textAlign = 'left' as CanvasTextAlign;
  textBaseline = 'alphabetic' as CanvasTextBaseline;
  filter = 'none';
  lineDashOffset = 0;
  miterLimit = 10;

  private track(...vals: number[]): void {
    for (const v of vals) {
      this.rec.coords.push(v);
      if (isBad(v)) {
        throw new Error(`renderer produced a non-finite coordinate: ${v}`);
      }
    }
  }

  save(): void {
    this.rec.ops += 'save';
  }

  restore(): void {
    this.rec.ops += 'restore';
  }

  translate(x: number, y: number): void {
    this.track(x, y);
  }

  scale(x: number, y: number): void {
    this.track(x, y);
  }

  rotate(a: number): void {
    this.track(a);
  }

  beginPath(): void {
    this.rec.paths += 1;
  }

  closePath(): void {
    this.rec.ops += 'close';
  }

  moveTo(x: number, y: number): void {
    this.track(x, y);
  }

  lineTo(x: number, y: number): void {
    this.track(x, y);
  }

  arc(x: number, y: number, r: number, a: number, b: number): void {
    this.track(x, y, r, a, b);
  }

  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a: number, b: number): void {
    this.track(x, y, rx, ry, rot, a, b);
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.track(x, y, w, h);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.track(x, y, w, h);
    this.rec.fills += 1;
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.track(x, y, w, h);
    this.rec.strokes += 1;
  }

  fill(): void {
    this.rec.fills += 1;
  }

  stroke(): void {
    this.rec.strokes += 1;
  }

  clip(): void {
    this.rec.ops += 'clip';
  }

  fillText(s: string, x: number, y: number): void {
    this.track(x, y);
    this.rec.texts.push(s);
  }

  strokeText(): void {
    this.rec.ops += 'strokeText';
  }

  measureText(s: string): { width: number } {
    return { width: s.length * 6 };
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    this.track(x0, y0, x1, y1);
    const gradient = {
      addColorStop: (offset: number) => {
        this.track(offset);
        return gradient;
      },
    } as unknown as CanvasGradient;
    return gradient;
  }

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient {
    this.track(x0, y0, r0, x1, y1, r1);
    const gradient = {
      addColorStop: (offset: number) => {
        this.track(offset);
        return gradient;
      },
    } as unknown as CanvasGradient;
    return gradient;
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

  setTransform(): void {}

  resetTransform(): void {}
}

export function makeCtx(): Ctx {
  return new StubContext() as unknown as Ctx;
}
