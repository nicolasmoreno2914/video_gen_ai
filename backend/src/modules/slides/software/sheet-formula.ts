// Evaluador de fórmulas de hoja de cálculo (subconjunto de Excel en español).
//
// El guion propone fórmulas; aquí se calculan de verdad para que el resultado que aparece en
// pantalla sea siempre correcto. Si una fórmula usa algo no soportado, se rechaza la escena
// (mejor una diapositiva de pasos que un resultado inventado).
//
// Sintaxis: separador de argumentos ";" y coma decimal, como Excel en español con
// configuración regional de coma decimal. Funciones: SUMA, PROMEDIO, MAX, MIN, CONTAR,
// CONTARA, SI, REDONDEAR. Operadores: + - * / ^ & y comparaciones = <> < > <= >=.

export type CellValue = number | string | boolean | null;
export type Cells = Record<string, CellValue | { formula: string }>;

export const SUPPORTED_FUNCTIONS = ['SUMA', 'PROMEDIO', 'MAX', 'MIN', 'CONTAR', 'CONTARA', 'SI', 'REDONDEAR'] as const;

export class FormulaError extends Error {}

type Token = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'ref'; v: string } | { t: 'range'; v: [string, string] }
  | { t: 'fn'; v: string } | { t: 'op'; v: string } | { t: '('; } | { t: ')'; } | { t: ';' };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') {
      const end = src.indexOf('"', i + 1);
      if (end < 0) throw new FormulaError('comillas sin cerrar');
      out.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const range = /^\$?([A-Z]{1,2})\$?(\d{1,4}):\$?([A-Z]{1,2})\$?(\d{1,4})/.exec(src.slice(i));
    if (range) {
      out.push({ t: 'range', v: [range[1] + range[2], range[3] + range[4]] });
      i += range[0].length;
      continue;
    }
    const word = /^[A-ZÁÉÍÓÚÑ]+(?=\()/i.exec(src.slice(i));
    if (word) {
      out.push({ t: 'fn', v: word[0].toUpperCase() });
      i += word[0].length;
      continue;
    }
    const ref = /^\$?([A-Z]{1,2})\$?(\d{1,4})/.exec(src.slice(i));
    if (ref) {
      out.push({ t: 'ref', v: ref[1] + ref[2] });
      i += ref[0].length;
      continue;
    }
    const num = /^\d+(,\d+)?/.exec(src.slice(i));
    if (num) {
      out.push({ t: 'num', v: Number(num[0].replace(',', '.')) });
      i += num[0].length;
      continue;
    }
    const op = /^(<=|>=|<>|[+\-*/^&=<>])/.exec(src.slice(i));
    if (op) {
      out.push({ t: 'op', v: op[0] });
      i += op[0].length;
      continue;
    }
    if (c === '(' || c === ')' || c === ';') {
      out.push({ t: c } as Token);
      i++;
      continue;
    }
    throw new FormulaError(`carácter no válido "${c}"`);
  }
  return out;
}

export function colToIndex(col: string): number {
  return col.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

export function indexToCol(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function splitRef(ref: string): { col: number; row: number } {
  const m = /^([A-Z]{1,2})(\d{1,4})$/.exec(ref);
  if (!m) throw new FormulaError(`referencia no válida "${ref}"`);
  return { col: colToIndex(m[1]), row: Number(m[2]) };
}

/** Celdas de un rango, en orden de filas. */
export function expandRange(a: string, b: string): string[] {
  const p = splitRef(a);
  const q = splitRef(b);
  const refs: string[] = [];
  for (let r = Math.min(p.row, q.row); r <= Math.max(p.row, q.row); r++) {
    for (let c = Math.min(p.col, q.col); c <= Math.max(p.col, q.col); c++) refs.push(indexToCol(c) + r);
  }
  return refs;
}

type Value = CellValue | CellValue[];

export class Sheet {
  private readonly cache = new Map<string, CellValue>();
  private readonly visiting = new Set<string>();

  constructor(private readonly cells: Cells) {}

  value(ref: string): CellValue {
    if (this.cache.has(ref)) return this.cache.get(ref)!;
    const raw = this.cells[ref];
    let v: CellValue;
    if (raw && typeof raw === 'object' && 'formula' in raw) {
      if (this.visiting.has(ref)) throw new FormulaError(`referencia circular en ${ref}`);
      this.visiting.add(ref);
      v = this.evaluate(raw.formula);
      this.visiting.delete(ref);
    } else {
      v = raw ?? null;
    }
    this.cache.set(ref, v);
    return v;
  }

  evaluate(formula: string): CellValue {
    const src = formula.trim().replace(/^=/, '');
    const tokens = tokenize(src);
    let pos = 0;
    const peek = (): Token | undefined => tokens[pos];
    const take = (): Token => {
      const t = tokens[pos++];
      if (!t) throw new FormulaError('fórmula incompleta');
      return t;
    };

    const num = (v: Value): number => {
      if (Array.isArray(v)) throw new FormulaError('rango donde se esperaba un valor');
      if (typeof v === 'number') return v;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v === null || v === '') return 0;
      throw new FormulaError(`"${v}" no es un número`);
    };

    const compare = (): Value => {
      let left = concat();
      for (let t = peek(); t?.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t.v); t = peek()) {
        pos++;
        const right = concat();
        const [a, b] = [left, right].map((x) => (Array.isArray(x) ? x[0] : x));
        const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''));
        left = { '=': cmp === 0, '<>': cmp !== 0, '<': cmp < 0, '>': cmp > 0, '<=': cmp <= 0, '>=': cmp >= 0 }[t.v]!;
      }
      return left;
    };
    const concat = (): Value => {
      let left = additive();
      while (peek()?.t === 'op' && (peek() as { v: string }).v === '&') {
        pos++;
        left = `${display(left as CellValue)}${display(additive() as CellValue)}`;
      }
      return left;
    };
    const additive = (): Value => {
      let left = term();
      for (let t = peek(); t?.t === 'op' && (t.v === '+' || t.v === '-'); t = peek()) {
        pos++;
        const right = term();
        left = t.v === '+' ? num(left) + num(right) : num(left) - num(right);
      }
      return left;
    };
    const term = (): Value => {
      let left = power();
      for (let t = peek(); t?.t === 'op' && (t.v === '*' || t.v === '/'); t = peek()) {
        pos++;
        const right = num(power());
        if (t.v === '/' && right === 0) throw new FormulaError('división por cero');
        left = t.v === '*' ? num(left) * right : num(left) / right;
      }
      return left;
    };
    const power = (): Value => {
      const base = unary();
      if (peek()?.t === 'op' && (peek() as { v: string }).v === '^') {
        pos++;
        return Math.pow(num(base), num(power()));
      }
      return base;
    };
    const unary = (): Value => {
      const t = peek();
      if (t?.t === 'op' && (t.v === '-' || t.v === '+')) {
        pos++;
        const v = num(unary());
        return t.v === '-' ? -v : v;
      }
      return primary();
    };
    const primary = (): Value => {
      const t = take();
      switch (t.t) {
        case 'num': return t.v;
        case 'str': return t.v;
        case 'ref': return this.value(t.v);
        case 'range': return expandRange(t.v[0], t.v[1]).map((r) => this.value(r));
        case '(': {
          const v = compare();
          if (take().t !== ')') throw new FormulaError('falta ")"');
          return v;
        }
        case 'fn': {
          if (take().t !== '(') throw new FormulaError('falta "("');
          const args: Value[] = [];
          if (peek()?.t !== ')') {
            args.push(compare());
            while (peek()?.t === ';') { pos++; args.push(compare()); }
          }
          if (take().t !== ')') throw new FormulaError('falta ")"');
          return this.call(t.v, args, num);
        }
        default:
          throw new FormulaError('fórmula mal formada');
      }
    };

    const result = compare();
    if (pos !== tokens.length) throw new FormulaError('sobran símbolos en la fórmula');
    if (Array.isArray(result)) throw new FormulaError('la fórmula devuelve un rango');
    return result;
  }

  private call(fn: string, args: Value[], num: (v: Value) => number): CellValue {
    const flat = args.flatMap((a) => (Array.isArray(a) ? a : [a]));
    const numbers = flat.filter((v): v is number => typeof v === 'number');
    switch (fn) {
      case 'SUMA': return numbers.reduce((a, b) => a + b, 0);
      case 'PROMEDIO':
        if (!numbers.length) throw new FormulaError('PROMEDIO sin números');
        return numbers.reduce((a, b) => a + b, 0) / numbers.length;
      case 'MAX': return numbers.length ? Math.max(...numbers) : 0;
      case 'MIN': return numbers.length ? Math.min(...numbers) : 0;
      case 'CONTAR': return numbers.length;
      case 'CONTARA': return flat.filter((v) => v !== null && v !== '').length;
      case 'SI': {
        if (args.length < 2 || args.length > 3) throw new FormulaError('SI necesita 2 o 3 argumentos');
        const cond = args[0];
        const truthy = typeof cond === 'boolean' ? cond : num(cond) !== 0;
        const pick = truthy ? args[1] : args[2] ?? false;
        if (Array.isArray(pick)) throw new FormulaError('SI devuelve un rango');
        return pick;
      }
      case 'REDONDEAR': {
        if (args.length !== 2) throw new FormulaError('REDONDEAR necesita 2 argumentos');
        const f = Math.pow(10, num(args[1]));
        return Math.round(num(args[0]) * f) / f;
      }
      default:
        throw new FormulaError(`función no soportada: ${fn}`);
    }
  }
}

/** Valor tal como lo muestra la celda: coma decimal y máximo 2 decimales. */
export function display(v: CellValue): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO';
  if (typeof v === 'number') {
    const rounded = Math.round(v * 100) / 100;
    return String(rounded).replace('.', ',');
  }
  return v;
}
