import type { Page } from 'puppeteer';

// Revisión de distribución de una escena animada ya cargada en el navegador: al final de cada beat
// se mide cada pieza visible y se buscan piezas fuera del escenario o que se tapan entre sí.
// Los mensajes van en el idioma del guion de animación para devolverlos a la IA ("corrige esto").

export interface LayoutIssue {
  beat: number;
  message: string;
}

/** Parte del área de la pieza más chica que puede quedar tapada antes de considerarlo un problema. */
const MAX_OVERLAP = 0.15;
/** Píxeles que una pieza puede asomarse fuera del escenario (sombras, anillo de resaltado). */
const EDGE_TOLERANCE = 6;

export async function checkMotionLayout(page: Page): Promise<LayoutIssue[]> {
  return page.evaluate((maxOverlap: number, tolerance: number) => {
    interface Box { id: string; l: number; t: number; r: number; b: number }
    const anim = (window as unknown as {
      __anim?: { seek(t: number): void; pieces: string[]; movers?: string[]; checkpoints: number[] };
    }).__anim;
    const stageEl = document.querySelector('.mo-stage');
    if (!anim || !stageEl) return [{ beat: 0, message: 'la escena no tiene runtime de animación' }];
    const stage = stageEl.getBoundingClientRect();
    const cam = document.getElementById('m-cam');
    const issues: Array<{ beat: number; message: string }> = [];
    const seen = new Set<string>();
    const name = (id: string): string => `"${id.replace(/^m-/, '')}"`;
    const report = (beat: number, message: string): void => {
      if (seen.has(message)) return;
      seen.add(message);
      issues.push({ beat, message });
    };
    const box = (el: Element, id: string): Box => {
      const r = el.getBoundingClientRect();
      return { id, l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const area = (a: Box): number => Math.max(0, a.r - a.l) * Math.max(0, a.b - a.t);
    const overlap = (a: Box, b: Box): number =>
      Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

    anim.checkpoints.forEach((t, i) => {
      anim.seek(t);
      // Con la cámara acercada es normal que parte de la escena quede fuera de cuadro
      const zoomed = !!cam && /scale\((?!1(\.0+)?\))/.test(cam.style.transform);
      const bodies: Box[] = [];
      const labels: Box[] = [];
      for (const id of anim.pieces) {
        const el = document.getElementById(id);
        if (!el || Number(getComputedStyle(el).opacity) < 0.5) continue;
        const body = box(el, id);
        bodies.push(body);
        const label = el.querySelector('.mo-label');
        if (label) labels.push(box(label, id));
        if (zoomed) continue;
        for (const part of label ? [body, box(label, id)] : [body]) {
          if (part.l < stage.left - tolerance || part.r > stage.right + tolerance ||
              part.t < stage.top - tolerance || part.b > stage.bottom + tolerance) {
            report(i + 1, `${name(id)}${part === body ? '' : ' (su etiqueta)'} se sale del escenario: muévelo hacia el centro o usa un tamaño menor`);
          }
        }
      }
      if (zoomed) return;
      const movers = new Set(anim.movers ?? []);
      for (let a = 0; a < bodies.length; a++) {
        for (let b = a + 1; b < bodies.length; b++) {
          // Lo que se desplaza puede llegar encima de otra pieza a propósito; eso lo juzga la revisión visual
          if (movers.has(bodies[a]!.id) || movers.has(bodies[b]!.id)) continue;
          const o = overlap(bodies[a]!, bodies[b]!);
          if (o > maxOverlap * Math.min(area(bodies[a]!), area(bodies[b]!))) {
            report(i + 1, `${name(bodies[a]!.id)} y ${name(bodies[b]!.id)} se tapan: sepáralos al menos una celda`);
          }
        }
      }
      for (const l of labels) {
        for (const b of bodies) {
          if (b.id === l.id) continue;
          if (overlap(l, b) > maxOverlap * area(l)) {
            report(i + 1, `la etiqueta de ${name(l.id)} tapa a ${name(b.id)}: deja una fila libre debajo de ${name(l.id)} o quita la etiqueta`);
          }
        }
      }
    });
    return issues;
  }, MAX_OVERLAP, EDGE_TOLERANCE);
}
