import { Cells, CellValue, FormulaError, Sheet, display, expandRange, indexToCol, splitRef } from './sheet-formula';
import { DOC_STYLES, EMAIL_FIELDS, UI_PACKS, UiApp } from './ui-packs';

// Demostración de software: el guion describe pasos (clic, escribir, seleccionar); aquí se
// validan contra la ficha del programa y se traducen a efectos visuales concretos que la
// plantilla reproduce al ritmo de la voz. Cualquier paso inválido invalida la demo (la escena
// cae a la diapositiva de pasos de siempre).

export class UiDemoError extends Error {}

/** Efecto visual sobre la maqueta del programa, aplicado al llegar el paso. */
export type UiEffect =
  | { k: 'show' | 'hide'; sel: string; after?: boolean }
  | { k: 'cls' | 'uncls'; sel: string; cls: string; after?: boolean }
  | { k: 'attr'; sel: string; name: string; value: string; after?: boolean }
  | { k: 'text'; sel: string; text: string; after?: boolean }
  /** Escritura letra a letra; `mirror` repite el texto (p. ej. la barra de fórmulas). */
  | { k: 'type'; sel: string; text: string; mirror?: string }
  | { k: 'press'; sel: string };

export interface UiStep {
  label: string;
  cue: string | null;
  /** Selector del elemento al que va el cursor antes del paso. */
  cursor: string | null;
  effects: UiEffect[];
}

export interface SheetCellView { text: string; cls: string[]; numeric: boolean }

export type UiRender =
  | { app: 'spreadsheet'; cols: number; rows: number; cells: Record<string, SheetCellView> }
  | { app: 'document'; paragraphs: Array<{ style: string; segs: Array<{ id: string; text: string }>; hidden: boolean }> }
  | {
    app: 'email';
    inbox: Array<{ from: string; subject: string; snippet: string }>;
    chips: string[];
    sent: { to: string; subject: string } | null;
    /** Mensaje ya abierto al empezar la escena (continúa la demo anterior). */
    compose: { fields: Record<string, string>; attached: number } | null;
  };

export interface ResolvedUiDemo {
  app: UiApp;
  title: string;
  steps: UiStep[];
  render: UiRender;
}

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');
const cssEsc = (s: string): string => s.replace(/["\\]/g, '\\$&');

export function resolveUiDemo(raw: unknown): ResolvedUiDemo {
  const demo = (raw ?? {}) as Record<string, unknown>;
  const app = demo.app as UiApp;
  if (!(app in UI_PACKS)) throw new UiDemoError(`programa no soportado: ${String(demo.app)}`);
  const steps = Array.isArray(demo.steps) ? (demo.steps as Array<Record<string, unknown>>) : [];
  if (steps.length < 2 || steps.length > 8) throw new UiDemoError(`la demo necesita entre 2 y 8 pasos (tiene ${steps.length})`);
  const pack = UI_PACKS[app];
  for (const s of steps) {
    if (s.action === 'click' && !(str(s.target) in pack.targets)) throw new UiDemoError(`elemento inexistente: ${str(s.target)}`);
  }
  const initial = (demo.initial ?? {}) as Record<string, unknown>;
  const resolved = app === 'spreadsheet' ? resolveSheet(initial, steps)
    : app === 'document' ? resolveDocument(initial, steps)
      : resolveEmail(initial, steps);
  return { app, title: str(demo.file_name, 60) || defaultTitle(app), ...resolved };
}

function defaultTitle(app: UiApp): string {
  return app === 'spreadsheet' ? 'Libro1.xlsx' : app === 'document' ? 'Documento sin título' : 'Recibidos';
}

function baseStep(s: Record<string, unknown>): Pick<UiStep, 'label' | 'cue'> {
  const label = str(s.label, 60);
  if (!label) throw new UiDemoError('paso sin etiqueta');
  return { label, cue: str(s.cue, 120) || null };
}

// ─── Hoja de cálculo ────────────────────────────────────────────────────────

const SHEET_COLS = 6;
const SHEET_ROWS = 11;

function resolveSheet(initial: Record<string, unknown>, rawSteps: Array<Record<string, unknown>>): Pick<ResolvedUiDemo, 'steps' | 'render'> {
  const cells: Cells = {};
  const fmt: Record<string, 'money' | 'pct'> = {};
  const inGrid = (ref: string): boolean => {
    const { col, row } = splitRef(ref);
    return col < SHEET_COLS && row >= 1 && row <= SHEET_ROWS;
  };
  const parseValue = (v: unknown): CellValue | { formula: string } => {
    if (typeof v === 'number') return v;
    const s = str(v, 120);
    if (s.startsWith('=')) return { formula: s };
    if (/^-?\d+(,\d+)?$/.test(s)) return Number(s.replace(',', '.'));
    return s || null;
  };
  for (const [ref, v] of Object.entries((initial.cells ?? {}) as Record<string, unknown>)) {
    const r = ref.toUpperCase();
    if (!/^[A-Z]{1,2}\d{1,4}$/.test(r) || !inGrid(r)) throw new UiDemoError(`celda fuera de la vista: ${ref}`);
    cells[r] = parseValue(v);
  }

  const shown = (ref: string): string => {
    const v = new Sheet(cells).value(ref);
    if (typeof v === 'number' && fmt[ref] === 'money') {
      return `$ ${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (typeof v === 'number' && fmt[ref] === 'pct') return `${display(Math.round(v * 10000) / 100)} %`;
    return display(v);
  };
  const rawText = (ref: string): string => {
    const v = cells[ref];
    if (v && typeof v === 'object') return v.formula;
    return typeof v === 'number' ? display(v) : display((v ?? null) as CellValue);
  };
  const sel = (ref: string): string => `[data-cell="${ref}"]`;
  // Un rango que incluye resultados calculados (p. ej. sumar el total junto con los datos) enseña
  // justo el error que el tutorial debe evitar
  const checkRanges = (formula: string, target: string): void => {
    for (const m of formula.toUpperCase().matchAll(/([A-Z]{1,2}\d{1,4}):([A-Z]{1,2}\d{1,4})/g)) {
      const refs = expandRange(m[1], m[2]);
      if (refs.includes(target)) throw new UiDemoError(`la fórmula de ${target} se incluye a sí misma`);
      const calc = refs.filter((r) => { const v = cells[r]; return !!v && typeof v === 'object'; });
      if (calc.length) throw new UiDemoError(`el rango ${m[0]} incluye celdas calculadas (${calc.join(', ')}): usa solo los datos`);
    }
  };
  // Vista inicial: también valida que las fórmulas iniciales se puedan calcular
  const views: Record<string, SheetCellView> = {};
  try {
    for (const ref of Object.keys(cells)) {
      const v = new Sheet(cells).value(ref);
      views[ref] = { text: shown(ref), cls: [], numeric: typeof v === 'number' };
    }
  } catch (e) {
    throw new UiDemoError(`fórmula inicial inválida: ${(e as Error).message}`);
  }

  // Tras cada cambio, refrescar las celdas con fórmula cuyo valor cambió
  const last: Record<string, string> = Object.fromEntries(Object.keys(views).map((r) => [r, views[r].text]));
  const refresh = (): UiEffect[] => {
    const out: UiEffect[] = [];
    for (const ref of Object.keys(cells)) {
      const now = shown(ref);
      if (last[ref] !== now) {
        out.push({ k: 'text', sel: `${sel(ref)} .v`, text: now, after: true });
        last[ref] = now;
      }
    }
    return out;
  };

  let selection: string[] = [];
  const selectEffects = (refs: string[]): UiEffect[] => {
    selection = refs;
    return [
      { k: 'uncls', sel: '.cell', cls: 'sel' },
      { k: 'uncls', sel: '.cell', cls: 'active' },
      { k: 'cls', sel: refs.map(sel).join(','), cls: 'sel' },
      { k: 'cls', sel: sel(refs[0]), cls: 'active' },
      { k: 'text', sel: '#namebox', text: refs[0] },
      { k: 'text', sel: '#fx .val', text: rawText(refs[0]) },
    ];
  };

  const steps: UiStep[] = rawSteps.map((s) => {
    const base = baseStep(s);
    try {
      if (s.action === 'select') {
        const range = str(s.range, 12).toUpperCase().replace(/\$/g, '');
        const m = /^([A-Z]{1,2}\d{1,4})(?::([A-Z]{1,2}\d{1,4}))?$/.exec(range);
        if (!m) throw new UiDemoError(`rango no válido: ${range}`);
        const refs = m[2] ? expandRange(m[1], m[2]) : [m[1]];
        if (!refs.every(inGrid)) throw new UiDemoError(`rango fuera de la vista: ${range}`);
        return { ...base, cursor: sel(refs[Math.floor((refs.length - 1) / 2)]), effects: selectEffects(refs) };
      }
      if (s.action === 'type') {
        const ref = str(s.cell, 6).toUpperCase();
        if (!/^[A-Z]{1,2}\d{1,4}$/.test(ref) || !inGrid(ref)) throw new UiDemoError(`celda no válida: ${ref}`);
        const value = parseValue(s.value);
        const text = value && typeof value === 'object' ? value.formula : display((value ?? null) as CellValue);
        if (!text) throw new UiDemoError(`celda ${ref} sin valor`);
        const effects = selectEffects([ref]);
        if (value && typeof value === 'object') checkRanges(value.formula, ref);
        cells[ref] = value;
        new Sheet(cells).value(ref); // valida la fórmula ahora: si falla, la demo se descarta
        return {
          ...base,
          cursor: sel(ref),
          effects: [...effects, { k: 'type', sel: `${sel(ref)} .v`, text, mirror: '#fx .val' }, ...refresh(),
            { k: 'cls', sel: sel(ref), cls: 'num', after: true }],
        };
      }
      if (s.action === 'click') {
        const target = str(s.target, 40);
        const press: UiEffect = { k: 'press', sel: `[data-ui="${target}"]` };
        const cls = { btn_negrita: 'b', btn_cursiva: 'i', btn_subrayado: 'u' }[target];
        const effects: UiEffect[] = [press];
        if (cls) {
          if (!selection.length) throw new UiDemoError(`${target} sin selección previa`);
          effects.push({ k: 'cls', sel: selection.map(sel).join(','), cls, after: true });
        } else if (target === 'btn_contabilidad' || target === 'btn_porcentaje') {
          if (!selection.length) throw new UiDemoError(`${target} sin selección previa`);
          for (const r of selection) fmt[r] = target === 'btn_contabilidad' ? 'money' : 'pct';
          effects.push(...refresh());
        } else if (target === 'btn_combinar') {
          const rows = new Set(selection.map((r) => splitRef(r).row));
          if (selection.length < 2 || rows.size !== 1) throw new UiDemoError('Combinar y centrar necesita un rango de una fila');
          effects.push({ k: 'attr', sel: sel(selection[0]), name: 'style', value: `grid-column: span ${selection.length}`, after: true },
            { k: 'cls', sel: sel(selection[0]), cls: 'merged', after: true },
            { k: 'hide', sel: selection.slice(1).map(sel).join(','), after: true });
        } else if (target === 'btn_autosuma') {
          if (selection.length !== 1) throw new UiDemoError('Autosuma necesita una sola celda activa');
          const ref = selection[0];
          const { col, row } = splitRef(ref);
          let top = row - 1;
          // El bloque de datos (números escritos, no resultados calculados) justo encima de la celda activa
          const isNum = (r: number): boolean => typeof cells[indexToCol(col) + r] === 'number';
          while (top >= 1 && isNum(top)) top--;
          if (top === row - 1) {
            throw new UiDemoError(`Autosuma en ${ref}: la celda activa debe estar JUSTO debajo de los datos a sumar, ` +
              'sin totales ni fórmulas en medio (selecciónala antes)');
          }
          const formula = `=SUMA(${indexToCol(col)}${top + 1}:${indexToCol(col)}${row - 1})`;
          cells[ref] = { formula };
          effects.push({ k: 'type', sel: `${sel(ref)} .v`, text: formula, mirror: '#fx .val' }, ...refresh(),
            { k: 'cls', sel: sel(ref), cls: 'num', after: true });
        }
        return { ...base, cursor: `[data-ui="${target}"]`, effects };
      }
      throw new UiDemoError(`acción no soportada en hoja de cálculo: ${String(s.action)}`);
    } catch (e) {
      if (e instanceof FormulaError) throw new UiDemoError(`fórmula inválida: ${e.message}`);
      throw e;
    }
  });

  return { steps, render: { app: 'spreadsheet', cols: SHEET_COLS, rows: SHEET_ROWS, cells: views } };
}

// ─── Documento ──────────────────────────────────────────────────────────────

function resolveDocument(initial: Record<string, unknown>, rawSteps: Array<Record<string, unknown>>): Pick<ResolvedUiDemo, 'steps' | 'render'> {
  const paras = (Array.isArray(initial.paragraphs) ? initial.paragraphs : []) as Array<Record<string, unknown>>;
  if (!paras.length || paras.length > 7) throw new UiDemoError('el documento necesita entre 1 y 7 párrafos');
  const texts = paras.map((p) => str(p.text, 400));
  const styles = paras.map((p) => (DOC_STYLES as readonly string[]).includes(str(p.style)) ? str(p.style) : 'Texto normal');
  const newParas = rawSteps.filter((s) => s.action === 'type' && s.paragraph === 'nuevo').length;

  // Cortes de selección por párrafo: cada fragmento seleccionable es un <span> propio
  const cuts: Array<Set<number>> = texts.map((t) => new Set([0, t.length]));
  const findRange = (p: number, frag: string): [number, number] => {
    const at = texts[p].indexOf(frag);
    if (at < 0) throw new UiDemoError(`el fragmento "${frag}" no está en el párrafo ${p + 1}`);
    return [at, at + frag.length];
  };
  for (const s of rawSteps) {
    if (s.action !== 'select' || !str(s.text)) continue;
    const p = Number(s.paragraph) - 1;
    if (!(p >= 0 && p < texts.length + newParas)) throw new UiDemoError(`párrafo inexistente: ${String(s.paragraph)}`);
    if (p >= texts.length) continue; // párrafo escrito durante la demo: se selecciona completo
    const [a, b] = findRange(p, str(s.text, 400));
    cuts[p].add(a).add(b);
  }
  const segs = texts.map((t, p) => {
    const points = [...cuts[p]].sort((x, y) => x - y);
    return points.slice(0, -1).map((a, k) => ({ id: `p${p + 1}s${a}`, text: t.slice(a, points[k + 1]), a, b: points[k + 1] }));
  });

  const para = (p: number): string => `[data-p="${p + 1}"]`;
  let selection: { sel: string; para: number } | null = null;
  let typed = 0;
  const steps: UiStep[] = rawSteps.map((s) => {
    const base = baseStep(s);
    if (s.action === 'select') {
      const p = Number(s.paragraph) - 1;
      if (!(p >= 0 && p < texts.length + typed)) throw new UiDemoError(`párrafo inexistente: ${String(s.paragraph)}`);
      let target: string;
      if (str(s.text) && p < texts.length) {
        const [a, b] = findRange(p, str(s.text, 400));
        target = segs[p].filter((g) => g.a >= a && g.b <= b).map((g) => `[data-seg="${g.id}"]`).join(',');
      } else {
        target = `${para(p)} .seg, ${para(p)} .tail`;
      }
      selection = { sel: target, para: p };
      return {
        ...base,
        cursor: target.split(',')[0],
        effects: [{ k: 'uncls', sel: '.seg, .tail', cls: 'sel' }, { k: 'cls', sel: target, cls: 'sel' }],
      };
    }
    if (s.action === 'click') {
      const target = str(s.target, 40);
      const effects: UiEffect[] = [{ k: 'press', sel: `[data-ui="${target}"]` }];
      const cls = { btn_negrita: 'b', btn_cursiva: 'i', btn_subrayado: 'u' }[target];
      const needsSel = cls || ['btn_centrar', 'btn_lista_numerada', 'btn_vinetas'].includes(target);
      if (needsSel && !selection) throw new UiDemoError(`${target} sin selección previa`);
      if (cls) effects.push({ k: 'cls', sel: selection!.sel, cls, after: true });
      if (target === 'btn_centrar') effects.push({ k: 'attr', sel: para(selection!.para), name: 'data-align', value: 'center', after: true });
      if (target === 'btn_lista_numerada' || target === 'btn_vinetas') {
        effects.push({ k: 'attr', sel: para(selection!.para), name: 'data-list', value: target === 'btn_vinetas' ? 'bullet' : 'number', after: true });
      }
      if (target === 'btn_estilos') effects.push({ k: 'show', sel: '#style-menu' });
      return { ...base, cursor: `[data-ui="${target}"]`, effects };
    }
    if (s.action === 'style') {
      const value = str(s.value, 30);
      if (!(DOC_STYLES as readonly string[]).includes(value)) throw new UiDemoError(`estilo inexistente: ${value}`);
      if (!selection) throw new UiDemoError('estilo sin selección previa');
      return {
        ...base,
        cursor: `[data-style-item="${cssEsc(value)}"]`,
        effects: [
          { k: 'show', sel: '#style-menu' },
          { k: 'cls', sel: `[data-style-item="${cssEsc(value)}"]`, cls: 'hover' },
          { k: 'attr', sel: para(selection.para), name: 'data-style', value, after: true },
          { k: 'text', sel: '#style-label', text: value, after: true },
          { k: 'hide', sel: '#style-menu', after: true },
        ],
      };
    }
    if (s.action === 'type') {
      const text = str(s.text, 300);
      if (!text) throw new UiDemoError('escritura sin texto');
      let p: number;
      const effects: UiEffect[] = [{ k: 'uncls', sel: '.seg, .tail', cls: 'sel' }];
      if (s.paragraph === 'nuevo') {
        p = texts.length + typed++;
        effects.push({ k: 'show', sel: para(p) });
      } else {
        p = Number(s.paragraph) - 1;
        if (!(p >= 0 && p < texts.length)) throw new UiDemoError(`párrafo inexistente: ${String(s.paragraph)}`);
      }
      effects.push({ k: 'type', sel: `${para(p)} .tail`, text: s.paragraph === 'nuevo' ? text : ` ${text}` });
      return { ...base, cursor: `${para(p)} .tail`, effects };
    }
    throw new UiDemoError(`acción no soportada en documento: ${String(s.action)}`);
  });

  const paragraphs = [
    ...texts.map((_, p) => ({ style: styles[p], segs: segs[p].map(({ id, text }) => ({ id, text })), hidden: false })),
    ...Array.from({ length: newParas }, () => ({ style: 'Texto normal', segs: [], hidden: true })),
  ];
  return { steps, render: { app: 'document', paragraphs } };
}

// ─── Correo ─────────────────────────────────────────────────────────────────

function resolveEmail(initial: Record<string, unknown>, rawSteps: Array<Record<string, unknown>>): Pick<ResolvedUiDemo, 'steps' | 'render'> {
  const inboxRaw = (Array.isArray(initial.inbox) ? initial.inbox : []) as Array<Record<string, unknown>>;
  const inbox = (inboxRaw.length ? inboxRaw : [
    { from: 'Coordinación académica', subject: 'Calendario del semestre', snippet: 'Les comparto las fechas clave…' },
    { from: 'Biblioteca', subject: 'Nuevos recursos disponibles', snippet: 'Ya puedes consultar…' },
    { from: 'Equipo de soporte', subject: 'Tu cuenta está lista', snippet: 'Bienvenido a la plataforma…' },
  ]).slice(0, 6).map((m) => ({ from: str(m.from, 40), subject: str(m.subject, 70), snippet: str(m.snippet, 90) }));

  const composeRaw = (initial.compose && typeof initial.compose === 'object' ? initial.compose : null) as Record<string, unknown> | null;
  let composeOpen = !!composeRaw;
  const fields: Record<string, string> = {};
  for (const f of EMAIL_FIELDS) if (composeRaw && str(composeRaw[f], 400)) fields[f] = str(composeRaw[f], 400);
  let ccShown = !!(fields.cc || fields.cco);
  const attached = (composeRaw && Array.isArray(composeRaw.adjuntos) ? composeRaw.adjuntos : []).map((f) => str(f, 40)).filter(Boolean).slice(0, 3);
  const chips: string[] = [...attached];
  let sent = false;
  const initialFields = { ...fields };
  const steps: UiStep[] = rawSteps.map((s) => {
    const base = baseStep(s);
    const open = (): UiEffect[] => {
      if (composeOpen) return [];
      composeOpen = true;
      return [{ k: 'show', sel: '#compose' }];
    };
    if (s.action === 'click') {
      const target = str(s.target, 40);
      const effects: UiEffect[] = [{ k: 'press', sel: `[data-ui="${target}"]` }];
      if (target === 'btn_redactar') effects.push(...open());
      if (target === 'btn_cc_cco') {
        effects.push(...open(), { k: 'show', sel: '[data-field="cc"], [data-field="cco"]', after: true });
        ccShown = true;
      }
      if (target === 'btn_enviar_menu') effects.push({ k: 'show', sel: '#send-menu' });
      if (target === 'btn_enviar') {
        if (!composeOpen) throw new UiDemoError('Enviar sin mensaje abierto');
        if (!fields.para) throw new UiDemoError('Enviar sin destinatario');
        sent = true;
        composeOpen = false;
        effects.push({ k: 'hide', sel: '#compose, #send-menu', after: true }, { k: 'show', sel: '#toast', after: true });
      }
      if (target === 'carpeta_enviados' || target === 'carpeta_recibidos') {
        const enviados = target === 'carpeta_enviados';
        effects.push(
          { k: 'uncls', sel: '.folder', cls: 'active' },
          { k: 'cls', sel: `[data-ui="${target}"]`, cls: 'active' },
          { k: enviados ? 'hide' : 'show', sel: '#list-inbox', after: true },
          { k: enviados ? 'show' : 'hide', sel: '#list-sent', after: true },
          { k: 'hide', sel: '#toast' },
        );
        if (enviados && !sent) throw new UiDemoError('Enviados sin un mensaje enviado');
      }
      if (target === 'btn_adjuntar') throw new UiDemoError('el clip se usa con la acción attach');
      return { ...base, cursor: `[data-ui="${target}"]`, effects };
    }
    if (s.action === 'type') {
      const field = str(s.field, 10).toLowerCase();
      if (!(EMAIL_FIELDS as readonly string[]).includes(field)) throw new UiDemoError(`campo inexistente: ${field}`);
      const text = str(s.text, 400);
      if (!text) throw new UiDemoError(`campo ${field} sin texto`);
      fields[field] = text;
      const effects: UiEffect[] = [...open()];
      if ((field === 'cc' || field === 'cco') && !ccShown) {
        ccShown = true;
        effects.push({ k: 'show', sel: '[data-field="cc"], [data-field="cco"]' });
      }
      effects.push({ k: 'type', sel: `[data-field="${field}"] .val`, text });
      return { ...base, cursor: `[data-field="${field}"]`, effects };
    }
    if (s.action === 'attach') {
      const file = str(s.file, 40);
      if (!/^[\w\-. áéíóúñÁÉÍÓÚÑ]+\.[a-z0-9]{2,5}$/i.test(file)) throw new UiDemoError(`archivo no válido: ${file}`);
      chips.push(file);
      return {
        ...base,
        cursor: '[data-ui="btn_adjuntar"]',
        effects: [...open(), { k: 'press', sel: '[data-ui="btn_adjuntar"]' }, { k: 'show', sel: `[data-chip="${chips.length - 1}"]`, after: true }],
      };
    }
    throw new UiDemoError(`acción no soportada en correo: ${String(s.action)}`);
  });

  return {
    steps,
    render: {
      app: 'email', inbox, chips, sent: sent ? { to: fields.para ?? '', subject: fields.asunto || '(sin asunto)' } : null,
      compose: composeRaw ? { fields: initialFields, attached: attached.length } : null,
    },
  };
}
