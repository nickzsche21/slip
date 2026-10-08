/**
 * Where does the derivation break?
 *
 * Two questions, depending on what the lines are:
 *
 *   identities  each line should hold wherever the assumptions hold. Checked by
 *               evaluating both sides at many sampled points — after
 *               substituting "Let a = b" — in complex arithmetic. A line that
 *               fails anywhere fails, and the failing point is the evidence.
 *
 *   equations   in one unknown, each step should keep the same real solutions.
 *               Every line's solution set is found numerically, so a step that
 *               loses a root (dividing by x, taking √) or gains one (squaring) is
 *               caught, and the root itself is the evidence.
 *
 * Sampling is a test, not a proof: an identity that held at every one of 60
 * points could in principle fail elsewhere. For the polynomial, rational and
 * root expressions people write, a false identity fails almost everywhere, so a
 * few dozen random points find it (the Schwartz–Zippel idea). The page says so.
 */
import { parse, evaluate, show, vars, subst, subtrees, c, cabs, normalise, ParseError, type Node, type C, type Env } from "./expr";

/* ── lines ────────────────────────────────────────────────────────────────── */

type Rel = "=" | "≠" | "<" | ">" | "≤" | "≥";
type Eq = { L: Node; R: Node; Ls: string; Rs: string };
export type LineKind =
  | { kind: "blank" }
  | { kind: "prose"; why?: string }
  | { kind: "sub"; v: string; expr: Node; text: string }
  | { kind: "filter"; rel: Rel; L: Node; R: Node; text: string }
  | { kind: "eq"; eq: Eq; given: boolean }
  | { kind: "or"; eqs: Eq[] }
  | { kind: "chain"; exprs: Node[]; texts: string[]; cont: boolean };

const ARROWS = /^(⇒|=>|->|→|∴|⟹|⟶|⇔|<=>|iff)\s*/i;
const LEAD = /^(so|then|thus|hence|therefore|which gives|giving|gives|we get|we have|this gives|and|now|i\.e\.|ie|that is|simplify|simplifying|expand|expanding|factor|factoring|factorise|factorize|solve|solving|answer|result)\b[\s,:]*/i;
const HYP = /^(let|assume|assuming|suppose|given|where|if|with|take|set)\b[\s,:]*/i;
const FUNCS = /^(sqrt|cbrt|sin|cos|tan|exp|ln|log|abs|pi)$/i;

function splitRel(s: string): { parts: string[]; rels: Rel[] } {
  const parts: string[] = [], rels: Rel[] = [];
  let depth = 0, cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], two = s.slice(i, i + 2);
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (depth === 0) {
      const r2 = two === "<=" ? "≤" : two === ">=" ? "≥" : two === "!=" ? "≠" : null;
      if (r2) { parts.push(cur); rels.push(r2 as Rel); cur = ""; i++; continue; }
      if ("=≠<>≤≥".includes(ch)) { parts.push(cur); rels.push(ch as Rel); cur = ""; continue; }
    }
    cur += ch;
  }
  parts.push(cur);
  return { parts, rels };
}

/** Expand ± and ∓ into every combination. */
function expandPM(s: string): string[] {
  const i = s.search(/[±∓]/);
  if (i < 0) return [s];
  const plus = s[i] === "±" ? "+" : "-", minus = s[i] === "±" ? "-" : "+";
  return [...expandPM(s.slice(0, i) + plus + s.slice(i + 1)), ...expandPM(s.slice(0, i) + minus + s.slice(i + 1))];
}

function tryParse(s: string): Node | null {
  try { return parse(s); } catch { return null; }
}

/** The math in a line of working, with the words around it removed. */
function extract(raw: string): { text: string; hyp: boolean } | null {
  let s = raw.trim();
  s = s.replace(/\s(#|\/\/|--)\s.*$/, "").replace(/^(#|\/\/)\s.*$/, "");
  s = s.replace(/^\(?\s*\d{1,2}\s*[.)]\s+/, ""); // "1." or "(2)" step numbers
  let hyp = false;
  for (let k = 0; k < 4; k++) {
    const before = s;
    s = s.replace(ARROWS, "");
    if (HYP.test(s)) { hyp = true; s = s.replace(HYP, ""); }
    s = s.replace(LEAD, "");
    if (s === before) break;
  }
  s = s.replace(/[.,;:!?]+$/, "").trim();
  // "Divide both sides by (a − b): a + b = b" — the math is after the colon.
  if (/:/.test(s)) { const tail = s.slice(s.lastIndexOf(":") + 1).trim(); if (tail) s = tail; }
  // A trailing remark in brackets: "x = 3   (dividing by x)".
  s = s.replace(/\s*\(([^()]*\b[a-z]{3,}\b[^()]*)\)\s*$/i, (m, inner) => (inner.split(/\s+/).some((w: string) => /^[a-z]{3,}$/i.test(w) && !FUNCS.test(w)) ? "" : m));
  return s ? { text: s, hyp } : null;
}

function parseRelations(text: string): { parts: Node[]; rels: Rel[]; texts: string[] } | null {
  const { parts, rels } = splitRel(normalise(text));
  const nodes: Node[] = [];
  for (const p of parts) {
    if (!p.trim()) return null;
    const n = tryParse(p);
    if (!n) return null;
    nodes.push(n);
  }
  return { parts: nodes, rels, texts: parts.map((p) => p.trim()) };
}

/** Something a word cannot be: a digit, an operator, a bracket, a relation, a root sign. */
const MATHY = /[0-9=+\-*/^()√∛²³⁻<>≤≥≠|π±∓\[\]]|^[A-Za-zα-ω]{1,2}$/;

/** Drop words one at a time from either end until what is left reads as math. */
function readMath(text: string) {
  let words = text.split(/\s+/);
  const ok = (w: string) => /^[A-Za-z]{2,}$/.test(w) && !FUNCS.test(w);
  for (let k = 0; k < 10; k++) {
    const joined = words.join(" ");
    const r = MATHY.test(normalise(joined)) ? parseRelations(joined) : null;
    if (r) return r;
    if (words.length > 1 && ok(words[0])) words = words.slice(1);
    else if (words.length > 1 && ok(words[words.length - 1])) words = words.slice(0, -1);
    else return null;
  }
  return null;
}

export function readLine(raw: string): LineKind {
  if (!raw.trim()) return { kind: "blank" };
  const continuation = /^\s*=(?!>)/.test(raw);
  const ex = extract(continuation ? raw.replace(/^\s*=/, "") : raw);
  if (!ex) return { kind: "prose" };

  // "x = 2 or x = −1", "x = 2, −1", "x = ±3"
  if (!continuation && !ex.hyp && /\bor\b|,|[±∓]/.test(ex.text) && /=/.test(ex.text)) {
    const pieces = ex.text.split(/\bor\b|,/).map((p) => p.trim()).filter(Boolean).flatMap(expandPM);
    const eqs: Eq[] = [];
    let lhs: string | null = null;
    for (const p of pieces) {
      const { parts, rels } = splitRel(normalise(p));
      let L: string, R: string;
      if (rels.length === 1 && rels[0] === "=") { L = parts[0]; R = parts[1]; lhs = L; }
      else if (rels.length === 0 && lhs) { L = lhs; R = parts[0]; }
      else { eqs.length = 0; break; }
      const Ln = tryParse(L), Rn = tryParse(R);
      if (!Ln || !Rn) { eqs.length = 0; break; }
      eqs.push({ L: Ln, R: Rn, Ls: L.trim(), Rs: R.trim() });
    }
    if (eqs.length > 1) return { kind: "or", eqs };
  }

  const r = readMath(ex.text);
  if (!r) return { kind: "prose", why: (() => { try { parse(ex.text); return undefined; } catch (e) { return e instanceof ParseError ? e.message : undefined; } })() };

  if (continuation) return { kind: "chain", exprs: r.parts, texts: r.texts, cont: true };
  if (r.rels.length === 0) return { kind: "chain", exprs: r.parts, texts: r.texts, cont: false };
  if (r.rels.length === 1 && r.rels[0] !== "=") return { kind: "filter", rel: r.rels[0], L: r.parts[0], R: r.parts[1], text: ex.text };
  if (r.rels.every((x) => x === "=")) {
    if (r.rels.length === 1) {
      const [L, R] = r.parts;
      if (ex.hyp && L.k === "var" && !vars(R).has(L.name)) return { kind: "sub", v: L.name, expr: R, text: ex.text };
      return { kind: "eq", eq: { L, R, Ls: r.texts[0], Rs: r.texts[1] }, given: ex.hyp };
    }
    if (ex.hyp && r.parts[0].k === "var") {
      // "Let a = b = 3": a and b are both 3.
      return { kind: "sub", v: (r.parts[0] as { name: string }).name, expr: r.parts[r.parts.length - 1], text: ex.text };
    }
    return { kind: "chain", exprs: r.parts, texts: r.texts, cont: false };
  }
  return { kind: "prose", why: "mixed relations on one line" };
}

/* ── numbers, the way a person would write them ───────────────────────────── */

const MINUS = "−";
function frac(x: number, maxQ = 12): [number, number] | null {
  for (let q = 1; q <= maxQ; q++) {
    const p = Math.round(x * q);
    if (Math.abs(p / q - x) < 1e-9 * Math.max(1, Math.abs(x))) return [p, q];
  }
  return null;
}
export function niceReal(x: number): string {
  if (!Number.isFinite(x)) return "undefined";
  const sgn = (s: string, neg: boolean) => (neg ? MINUS + s : s);
  const f = frac(x);
  if (f) return f[1] === 1 ? sgn(String(Math.abs(f[0])), f[0] < 0) : sgn(`${Math.abs(f[0])}/${f[1]}`, f[0] < 0);
  const pf = frac(x / Math.PI, 12);
  if (pf && Math.abs(pf[0]) <= 48) {
    const a = Math.abs(pf[0]);
    return sgn(`${a === 1 ? "" : a}π${pf[1] === 1 ? "" : "/" + pf[1]}`, pf[0] < 0);
  }
  // (p ± √n)/q for small p, n, q: the roots of the quadratics people solve.
  for (const q of [1, 2]) {
    for (let k = 0; k <= 80; k++) {
      const p = k % 2 ? (k + 1) / 2 : -k / 2;
      const r = x * q - p, n = r * r, ni = Math.round(n);
      if (ni > 1 && ni <= 2000 && Math.abs(n - ni) < 1e-7 * ni && !Number.isInteger(Math.sqrt(ni))) {
        let k = 1;
        for (let f = 2; f * f <= ni; f++) if (ni % (f * f) === 0) k = f;
        const surd = k > 1 ? `${k}√${ni / (k * k)}` : `√${ni}`, head = p === 0 ? (r < 0 ? MINUS + surd : surd) : `${sgn(String(Math.abs(p)), p < 0)} ${r < 0 ? MINUS : "+"} ${surd}`;
        return q === 1 ? head : `(${head})/${q}`;
      }
    }
  }
  return sgn(String(+Math.abs(x).toPrecision(6)), x < 0);
}
export function niceC(z: C): string {
  if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) return "undefined";
  const small = (v: number) => Math.abs(v) < 1e-9 * Math.max(1, cabs(z));
  if (small(z.im)) return niceReal(z.re);
  const im = Math.abs(z.im), imS = Math.abs(im - 1) < 1e-12 ? "i" : `${niceReal(im)}i`;
  if (small(z.re)) return z.im < 0 ? MINUS + imS : imS;
  return `${niceReal(z.re)} ${z.im < 0 ? MINUS : "+"} ${imS}`;
}

/* ── sampling ─────────────────────────────────────────────────────────────── */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SAMPLE_N = 60;

type Filter = { rel: Rel; L: Node; R: Node };
const finiteC = (z: C) => Number.isFinite(z.re) && Number.isFinite(z.im) && cabs(z) < 1e10;
function ev(n: Node, env: Env): C | null {
  try { const z = evaluate(n, env); return finiteC(z) ? z : null; } catch { return null; }
}
const close = (a: C, b: C, tol = 1e-8) => cabs({ re: a.re - b.re, im: a.im - b.im }) <= tol * Math.max(1, cabs(a), cabs(b));

function passes(f: Filter, env: Env): boolean {
  const l = ev(f.L, env), r = ev(f.R, env);
  if (!l || !r) return false;
  const real = Math.abs(l.im) < 1e-9 && Math.abs(r.im) < 1e-9;
  switch (f.rel) {
    case "≠": return !close(l, r, 1e-9);
    case "<": return real && l.re < r.re - 1e-12;
    case ">": return real && l.re > r.re + 1e-12;
    case "≤": return real && l.re <= r.re + 1e-12;
    case "≥": return real && l.re >= r.re - 1e-12;
    default: return close(l, r);
  }
}

/** Points for the free variables: integers to catch sign slips, reals to catch everything else. */
function samplePoints(free: string[], filters: Filter[], seed = 7, n = SAMPLE_N): Env[] {
  const r = rng(seed), out: Env[] = [];
  for (let tries = 0; out.length < n && tries < n * 80; tries++) {
    const env: Env = {};
    for (const v of free) {
      const u = r();
      const x = u < 0.3 ? Math.round(r() * 12 - 6) : u < 0.75 ? r() * 6 - 3 : r() * 20 - 10;
      env[v] = c(x);
    }
    if (filters.every((f) => passes(f, env))) out.push(env);
  }
  return out;
}

/** Friendly points first, for showing a counterexample a person can check by hand. */
function friendlyPoints(free: string[], filters: Filter[]): Env[] {
  const vals = [3, 2, -2, 1, -1, 4, -3, 5, 0.5, -4, 6, 0];
  const out: Env[] = [];
  const rec = (i: number, env: Env) => {
    if (out.length > 400) return;
    if (i === free.length) { if (filters.every((f) => passes(f, env))) out.push({ ...env }); return; }
    for (const v of vals) { env[free[i]] = c(v); rec(i + 1, env); }
  };
  rec(0, {});
  // Keep variables distinct where possible: a = 3, b = 3 hides nothing, but a = 2, b = 3 reads better.
  const distinct = (e: Env) => new Set(Object.values(e).map((z) => z.re)).size;
  // Stable: friendliest values first, preferring points where the variables differ.
  return out.map((e, i) => ({ e, i })).sort((p, q) => distinct(q.e) - distinct(p.e) || p.i - q.i).map((x) => x.e);
}

/**
 * Points on an equation in several unknowns: pick values for all but one
 * unknown, then solve for the last one numerically. Every later line has to
 * hold at these points — the ones the starting equation allows.
 */
function premisePoints(eq: Eq, free: string[], filters: Filter[], S: (n: Node) => Node): Env[] {
  const L = S(eq.L), R = S(eq.R);
  const inEq = free.filter((v) => vars(L).has(v) || vars(R).has(v));
  const r = rng(31), out: Env[] = [];
  for (const target of [...inEq].reverse()) {
    for (let tries = 0; out.length < SAMPLE_N && tries < 160; tries++) {
      const env: Env = {};
      for (const v of free) if (v !== target) env[v] = c(Math.round((r() * 8 - 4) * 1000) / 1000);
      const f = (x: number) => { const e = { ...env, [target]: c(x) }; const l = ev(L, e), rr = ev(R, e); if (!l || !rr || Math.abs(l.im) > 1e-9 || Math.abs(rr.im) > 1e-9) return null; return l.re - rr.re; };
      let px: number | null = null, pf: number | null = null;
      for (let i = -2000; i <= 2000; i++) {
        const x = i / 100, y = f(x);
        if (y === null) { px = null; pf = null; continue; }
        if (y === 0 || (pf !== null && px !== null && Math.sign(y) !== Math.sign(pf))) {
          let lo = px ?? x, hi = x, flo = pf ?? y;
          for (let k = 0; k < 60 && y !== 0; k++) { const mid = (lo + hi) / 2, fm = f(mid); if (fm === null) break; if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid; }
          const root = y === 0 ? x : (lo + hi) / 2, fr = f(root);
          if (fr !== null && Math.abs(fr) < 1e-7) {
            const e = { ...env, [target]: c(root) };
            if (filters.every((fl) => passes(fl, e))) out.push(e);
            break;
          }
        }
        px = x; pf = y;
      }
    }
    if (out.length >= 12) break;
  }
  return out;
}

type Verdict = { defined: number; fail: Env | null };
function holds(L: Node, R: Node, pts: Env[]): Verdict {
  let defined = 0;
  for (const env of pts) {
    const l = ev(L, env), r = ev(R, env);
    if (!l || !r) continue;
    defined++;
    if (!close(l, r)) return { defined, fail: env };
  }
  return { defined, fail: null };
}

/* ── one unknown: solution sets ───────────────────────────────────────────── */

export type RootSet = { kind: "all" } | { kind: "none" } | { kind: "finite"; roots: number[] } | { kind: "many" };
const GRID: number[] = (() => {
  const g = new Set<number>();
  for (let i = -5000; i <= 5000; i++) g.add(+(i / 1000).toFixed(3));
  for (let i = -10000; i <= 10000; i++) g.add(+(i / 100).toFixed(2));
  return [...g].sort((a, b) => a - b);
})();
export const RANGE = 100;

/** f = L − R where both sides are real, else undefined: a solution has to make the line make sense. */
function realDiff(eq: { L: Node; R: Node }, v: string, x: number): number | null {
  const env = { [v]: c(x) };
  const l = ev(eq.L, env), r = ev(eq.R, env);
  if (!l || !r) return null;
  const scale = 1 + Math.abs(l.re) + Math.abs(r.re);
  if (Math.abs(l.im) > 1e-9 * scale || Math.abs(r.im) > 1e-9 * scale) return null;
  return l.re - r.re;
}
function scaleAt(eq: { L: Node; R: Node }, v: string, x: number) {
  const env = { [v]: c(x) };
  const l = ev(eq.L, env), r = ev(eq.R, env);
  return 1 + (l ? cabs(l) : 0) + (r ? cabs(r) : 0);
}
export function satisfies(eq: { L: Node; R: Node }, v: string, x: number): boolean {
  const d = realDiff(eq, v, x);
  return d !== null && Math.abs(d) <= 1e-7 * scaleAt(eq, v, x);
}

export function rootsOf(eq: { L: Node; R: Node }, v: string): RootSet {
  // An identity first: every x works.
  const pts = samplePoints([v], [], 11, 24);
  const h = holds(eq.L, eq.R, pts);
  if (h.defined >= 12 && !h.fail) return { kind: "all" };

  const f = (x: number) => realDiff(eq, v, x);
  const roots: number[] = [];
  const add = (x: number) => {
    const snapped = Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x) : x;
    if (!roots.some((r) => Math.abs(r - snapped) < 1e-7 * Math.max(1, Math.abs(r)))) roots.push(snapped);
  };
  let px: number | null = null, pf: number | null = null;
  const vals: (number | null)[] = GRID.map(f);
  for (let i = 0; i < GRID.length; i++) {
    const x = GRID[i], y = vals[i];
    if (y === null) { px = null; pf = null; continue; }
    const sc = scaleAt(eq, v, x);
    if (Math.abs(y) <= 1e-12 * sc) { add(x); px = x; pf = y; continue; }
    if (px !== null && pf !== null && Math.sign(pf) !== Math.sign(y) && pf !== 0) {
      let lo = px, hi = x, flo = pf, okBracket = true;
      for (let k = 0; k < 64; k++) {
        const mid = (lo + hi) / 2, fm = f(mid);
        if (fm === null) { okBracket = false; break; }
        if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
      }
      const root = (lo + hi) / 2, fr = f(root);
      // A sign change through a pole (1/x at 0) is not a root.
      if (okBracket && fr !== null && Math.abs(fr) <= 1e-6 * scaleAt(eq, v, root)) add(root);
    }
    // A root where the curve only touches zero: (x − 1)² = 0.
    const yl = vals[i - 1], yr = vals[i + 1];
    if (yl != null && yr != null && Math.abs(y) <= Math.abs(yl) && Math.abs(y) <= Math.abs(yr) && Math.abs(y) < 1e-3 * sc && Math.sign(yl) === Math.sign(yr)) {
      let a = GRID[i - 1], b = GRID[i + 1];
      const g = 0.6180339887;
      for (let k = 0; k < 80; k++) {
        const m1 = b - g * (b - a), m2 = a + g * (b - a);
        const f1 = Math.abs(f(m1) ?? Infinity), f2 = Math.abs(f(m2) ?? Infinity);
        if (f1 < f2) b = m2; else a = m1;
      }
      const m = (a + b) / 2, fm = f(m);
      if (fm !== null && Math.abs(fm) <= 1e-9 * scaleAt(eq, v, m)) add(m);
    }
    px = x; pf = y;
    if (roots.length > 40) return { kind: "many" };
  }
  roots.sort((a, b) => a - b);
  return roots.length ? { kind: "finite", roots } : { kind: "none" };
}

function unionRoots(sets: RootSet[]): RootSet {
  if (sets.some((s) => s.kind === "all")) return { kind: "all" };
  if (sets.some((s) => s.kind === "many")) return { kind: "many" };
  const roots: number[] = [];
  for (const s of sets) if (s.kind === "finite") for (const r of s.roots) if (!roots.some((x) => Math.abs(x - r) < 1e-7 * Math.max(1, Math.abs(x)))) roots.push(r);
  roots.sort((a, b) => a - b);
  return roots.length ? { kind: "finite", roots } : { kind: "none" };
}

export function showSet(s: RootSet, v: string): string {
  if (s.kind === "all") return `every ${v}`;
  if (s.kind === "none") return "no real solution";
  if (s.kind === "many") return "infinitely many";
  return `${v} ∈ {${s.roots.map(niceReal).join(", ")}}`;
}

/* ── polynomial difference: "the sides differ by 2ab" ─────────────────────── */

function monomials(nv: number, deg: number): number[][] {
  const out: number[][] = [];
  const rec = (i: number, left: number, cur: number[]) => {
    if (i === nv) { out.push([...cur]); return; }
    for (let e = 0; e <= left; e++) { cur.push(e); rec(i + 1, left - e, cur); cur.pop(); }
  };
  rec(0, deg, []);
  return out.sort((a, b) => b.reduce((s, x) => s + x, 0) - a.reduce((s, x) => s + x, 0));
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const k = M[r][col] / M[col][col];
      for (let cc = col; cc <= n; cc++) M[r][cc] -= k * M[col][cc];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** Express D as a short polynomial in its variables, or null if it is not one. */
export function polyOf(D: (env: Env) => C | null, vs: string[]): string | null {
  if (vs.length > 3) return null;
  const deg = vs.length <= 1 ? 6 : vs.length === 2 ? 4 : 3;
  const mons = monomials(vs.length, deg), m = mons.length, r = rng(99);
  const rows: number[][] = [], rhs: number[] = [], check: [Env, number][] = [];
  for (let tries = 0; (rows.length < m || check.length < 12) && tries < 2000; tries++) {
    const env: Env = {}; const xs = vs.map(() => +(r() * 4 - 2).toFixed(6));
    vs.forEach((v, i) => (env[v] = c(xs[i])));
    const d = D(env);
    if (!d || Math.abs(d.im) > 1e-9 * (1 + Math.abs(d.re))) continue;
    const row = mons.map((e) => e.reduce((p, k, i) => p * Math.pow(xs[i], k), 1));
    if (rows.length < m) { rows.push(row); rhs.push(d.re); } else check.push([env, d.re]);
  }
  if (rows.length < m || check.length < 12) return null;
  const coef = solve(rows, rhs);
  if (!coef) return null;
  const rounded = coef.map((x) => { const f = frac(x, 12); return f ? f[0] / f[1] : NaN; });
  if (rounded.some((x) => Number.isNaN(x))) return null;
  for (const [env, d] of check) {
    const xs = vs.map((v) => env[v].re);
    const val = mons.reduce((s, e, j) => s + rounded[j] * e.reduce((p, k, i) => p * Math.pow(xs[i], k), 1), 0);
    if (Math.abs(val - d) > 1e-7 * (1 + Math.abs(d))) return null;
  }
  const terms = mons.map((e, j) => ({ e, k: rounded[j] })).filter((t) => t.k !== 0);
  if (!terms.length || terms.length > 5) return null;
  const sup = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  return terms.map((t, idx) => {
    const body = t.e.map((p, i) => (p === 0 ? "" : vs[i] + (p > 1 ? sup[p] : ""))).join("");
    const f = frac(Math.abs(t.k))!;
    const mag = f[1] === 1 ? (f[0] === 1 && body ? "" : String(f[0])) : `${f[0]}/${f[1]}${body ? "·" : ""}`;
    const sign = t.k < 0 ? (idx ? " − " : MINUS) : idx ? " + " : "";
    return sign + mag + body;
  }).join("");
}

/* ── diagnosis ────────────────────────────────────────────────────────────── */

type DiagCtx = { allVars: string[]; subs: Record<string, Node>; subText: Record<string, string> };

function genericPts(vs: string[]): Env[] {
  const r = rng(1234), out: Env[] = [];
  for (let i = 0; i < 12; i++) { const env: Env = {}; for (const v of vs) env[v] = c(r() * 5.4 - 2.7 + 0.137); out.push(env); }
  return out;
}
function equivGeneric(A: Node, B: Node, vs: string[]): boolean {
  let defined = 0;
  for (const env of genericPts(vs)) {
    const a = ev(A, env), b = ev(B, env);
    if (!a || !b) continue;
    defined++;
    if (!close(a, b, 1e-8)) return false;
  }
  return defined >= 3;
}
const mul = (a: Node, b: Node): Node => ({ k: "mul", a, b });
const sq = (a: Node): Node => ({ k: "pow", a, b: { k: "num", v: 2 } });
const sub = (a: Node, b: Node): Node => ({ k: "sub", a, b });

/** Was `prev` turned into `curr` by dividing both sides by one of prev's sub-expressions? */
function dividedBy(prev: Eq, curr: Eq, vs: string[]): Node | null {
  const seen = new Set<string>();
  for (const g of [...subtrees(prev.L), ...subtrees(prev.R)]) {
    if (g.k === "num" || g.k === "const") continue;
    const key = show(g);
    if (seen.has(key)) continue;
    seen.add(key);
    if (equivGeneric(prev.L, mul(g, curr.L), vs) && equivGeneric(prev.R, mul(g, curr.R), vs)) return g;
  }
  return null;
}
function multipliedBy(prev: Eq, curr: Eq, vs: string[]): Node | null {
  return dividedBy(curr, prev, vs);
}
const tookRoots = (prev: Eq, curr: Eq, vs: string[]) =>
  (equivGeneric(prev.L, sq(curr.L), vs) && equivGeneric(prev.R, sq(curr.R), vs)) ||
  (equivGeneric(prev.L, sq(curr.R), vs) && equivGeneric(prev.R, sq(curr.L), vs));
const squared = (prev: Eq, curr: Eq, vs: string[]) => tookRoots(curr, prev, vs);

/** The smallest pair of sub-expressions where two trees stop matching. */
function treeDiff(A: Node, B: Node, vs: string[]): [Node, Node] | null {
  if (show(A) === show(B)) return null;
  if (A.k === B.k && A.k !== "num" && A.k !== "var" && A.k !== "const") {
    if ((A.k === "neg" || A.k === "fn") && (B.k === "neg" || B.k === "fn")) {
      if (A.k === "fn" && B.k === "fn" && A.name !== B.name) return [A, B];
      return treeDiff(A.a, B.a, vs) ?? [A, B];
    }
    if ("b" in A && "b" in B) {
      const da = show(A.a) !== show(B.a), db = show(A.b) !== show(B.b);
      if (da && !db) return treeDiff(A.a, B.a, vs) ?? [A, B];
      if (db && !da) return treeDiff(A.b, B.b, vs) ?? [A, B];
    }
  }
  return [A, B];
}

/** Named rules people break, recognised by shape. */
function ruleFor(a: Node, b: Node, vs: string[]): string | null {
  for (const [x, y] of [[a, b], [b, a]] as [Node, Node][]) {
    if (x.k === "mul" && x.a.k === "fn" && x.a.name === "sqrt" && x.b.k === "fn" && x.b.name === "sqrt" && y.k === "fn" && y.name === "sqrt")
      return "√a·√b = √(ab) only holds when a and b are not both negative. With complex numbers the rule breaks — that is the whole trick.";
    if (x.k === "fn" && x.name === "sqrt" && x.a.k === "pow" && x.a.b.k === "num" && x.a.b.v === 2 && equivGeneric(x.a.a, y, vs))
      return "√(x²) is |x|, not x. They differ whenever x is negative.";
    if (x.k === "fn" && x.name === "sqrt" && x.a.k === "pow" && x.a.b.k === "num" && x.a.b.v === 2)
      return "√(x²) is |x|: the square root never comes out negative.";
    if (x.k === "pow" && x.a.k === "pow" && y.k === "pow")
      return "(xᵖ)^q = x^(pq) needs x > 0 when the powers aren't whole numbers.";
    if (x.k === "fn" && x.name === "ln" && (x.a.k === "mul" || x.a.k === "pow" || x.a.k === "div"))
      return "Logarithm rules — ln(ab) = ln a + ln b, ln(aⁿ) = n·ln a — only hold for positive a and b.";
    if (x.k === "pow" && x.b.k === "num" && x.b.v === 2 && (x.a.k === "add" || x.a.k === "sub") && y.k !== "pow")
      return `(a ± b)² = a² ± 2ab + b² — the middle term is easy to lose.`;
    if (x.k === "fn" && x.name === "sqrt" && (x.a.k === "add" || x.a.k === "sub") && (y.k === "add" || y.k === "sub"))
      return "√(a + b) is not √a + √b.";
    if (x.k === "div" && (x.a.k === "add" || x.a.k === "sub") && (y.k === "add" || y.k === "sub"))
      return "When dividing a sum, every term has to be divided — or none can be cancelled.";
  }
  return null;
}

function describeEnv(env: Env, d: DiagCtx): string {
  const parts: [string, string][] = Object.entries(env).map(([k, v]) => [k, niceC(v)]);
  for (const [v, e] of Object.entries(d.subs)) {
    const z = ev(e, env);
    if (z) parts.push([v, niceC(z)]);
  }
  return parts.sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k} = ${v}`).join(", ");
}
function sideValues(L: Node, R: Node, env: Env): string {
  const l = ev(L, env), r = ev(R, env);
  return `left side ${l ? niceC(l) : "undefined"}, right side ${r ? niceC(r) : "undefined"}`;
}

/** Why a rewrite of one expression into another is wrong. */
function explainRewrite(A: Node, B: Node, d: DiagCtx, vsAfter: string[], subsApplied: (n: Node) => Node): string[] {
  const out: string[] = [];
  const diff = treeDiff(A, B, d.allVars);
  if (diff) {
    const [a, b] = diff;
    const rule = ruleFor(a, b, d.allVars);
    const whole = show(a) === show(A) && show(b) === show(B);
    if (!whole) out.push(`${show(a)} was rewritten as ${show(b)}, and those aren't equal.`);
    if (rule) out.push(rule);
  }
  const p = vsAfter.length ? polyOf((env) => { const x = ev(subsApplied(A), env), y = ev(subsApplied(B), env); return x && y ? c(x.re - y.re, x.im - y.im) : null; }, vsAfter) : null;
  if (p && p !== "0" && /[a-zα-ω]/i.test(p)) out.push(`The two sides differ by ${p}.`);
  return out;
}

/* ── the report ───────────────────────────────────────────────────────────── */

export type Status = "ok" | "slip" | "warn" | "after" | "given" | "prose" | "blank" | "unchecked";
export type Mark = {
  line: number;
  status: Status;
  /** For lines of several "=": which "=" (0-based) the marks belong to. */
  links?: { i: number; status: "ok" | "slip" | "after" }[];
  head?: string;
  why?: string[];
  evidence?: string;
  set?: string;
};
export type Report = { mode: "identity" | "solving" | "empty"; marks: Mark[]; summary: string; unknown?: string; slips: number; warns: number; note?: string };

type Claim =
  | { kind: "eq"; line: number; eq: Eq; given: boolean }
  | { kind: "or"; line: number; eqs: Eq[] }
  | { kind: "link"; line: number; i: number; A: Node; B: Node };

export function check(text: string): Report {
  const raw = text.replace(/\r/g, "").split("\n");
  const lines = raw.map(readLine);
  const marks: Mark[] = lines.map((l, i) => ({ line: i, status: l.kind === "blank" ? "blank" : l.kind === "prose" ? "prose" : "ok" }));

  const subs: Record<string, Node> = {}, subText: Record<string, string> = {}, filters: Filter[] = [];
  const claims: Claim[] = [];
  let lastExpr: Node | null = null;
  lines.forEach((l, i) => {
    if (l.kind === "sub") {
      subs[l.v] = subst(l.expr, subs);
      for (const k of Object.keys(subs)) subs[k] = subst(subs[k], { [l.v]: subs[l.v] });
      subText[l.v] = show(l.expr);
      marks[i].status = "given"; marks[i].head = `${l.v} is replaced by ${show(l.expr)} everywhere below.`;
      lastExpr = null;
    } else if (l.kind === "filter") {
      filters.push({ rel: l.rel, L: l.L, R: l.R }); marks[i].status = "given"; marks[i].head = "Taken as given.";
      lastExpr = null;
    } else if (l.kind === "eq") {
      claims.push({ kind: "eq", line: i, eq: l.eq, given: l.given }); lastExpr = l.eq.R;
    } else if (l.kind === "or") {
      claims.push({ kind: "or", line: i, eqs: l.eqs }); lastExpr = null;
    } else if (l.kind === "chain") {
      const exprs = l.cont && lastExpr ? [lastExpr, ...l.exprs] : l.exprs;
      for (let k = 0; k + 1 < exprs.length; k++) claims.push({ kind: "link", line: i, i: k, A: exprs[k], B: exprs[k + 1] });
      lastExpr = exprs[exprs.length - 1];
    } else if (l.kind === "prose") lastExpr = lastExpr; // a remark between lines does not break a chain
  });

  if (!claims.length) {
    return { mode: "empty", marks, summary: "Nothing to check yet. Write one step per line — or pick an example above.", slips: 0, warns: 0 };
  }

  const S = (n: Node) => subst(n, subs);
  const allVarsSet = new Set<string>();
  for (const cl of claims) {
    const add = (n: Node) => vars(n).forEach((v) => allVarsSet.add(v));
    if (cl.kind === "eq") { add(cl.eq.L); add(cl.eq.R); } else if (cl.kind === "or") cl.eqs.forEach((e) => { add(e.L); add(e.R); }); else { add(cl.A); add(cl.B); }
  }
  Object.values(subs).forEach((e) => vars(e).forEach((v) => allVarsSet.add(v)));
  const allVars = [...allVarsSet].sort();
  const freeSet = new Set<string>();
  for (const v of allVars) if (!(v in subs)) freeSet.add(v);
  const free = [...freeSet];
  const diag: DiagCtx = { allVars, subs, subText };
  const pts = samplePoints(free, filters);
  const friendly = friendlyPoints(free, filters);

  if (filters.length && !pts.length) {
    return { mode: "identity", marks, summary: "The assumptions contradict each other: no values satisfy all of them.", slips: 0, warns: 0 };
  }

  const eqClaims = claims.filter((c): c is Extract<Claim, { kind: "eq" | "or" }> => c.kind !== "link");
  const first = eqClaims[0];
  const firstIsIdentity = first && first.kind === "eq" && (() => { const h = holds(S(first.eq.L), S(first.eq.R), pts); return h.defined >= 3 && !h.fail; })();
  const eqVars = new Set<string>();
  for (const cl of eqClaims) (cl.kind === "eq" ? [cl.eq] : cl.eqs).forEach((e) => { vars(S(e.L)).forEach((v) => eqVars.add(v)); vars(S(e.R)).forEach((v) => eqVars.add(v)); });

  /* links are checked the same way in both modes: each "=" between expressions is a claim that they are equal */
  let slips = 0, warns = 0;
  const linkMark = (cl: Extract<Claim, { kind: "link" }>) => {
    const m = marks[cl.line];
    m.links ??= [];
    const A = S(cl.A), B = S(cl.B);
    const h = holds(A, B, pts);
    if (h.defined === 0) {
      m.links.push({ i: cl.i, status: "slip" }); m.status = "slip"; slips++;
      m.head ??= "This can’t be evaluated for any allowed values — it divides by zero.";
      return;
    }
    if (!h.fail) { m.links.push({ i: cl.i, status: "ok" }); return; }
    const env = friendly.find((e) => { const a = ev(A, e), b = ev(B, e); return a && b && !close(a, b); }) ?? h.fail;
    m.links.push({ i: cl.i, status: "slip" });
    if (m.status !== "slip") {
      m.status = "slip"; slips++;
      m.head = `${show(cl.A)} ≠ ${show(cl.B)}`;
      m.why = explainRewrite(cl.A, cl.B, diag, free, S);
      const where = describeEnv(env, diag);
      m.evidence = `${where ? `At ${where}: ` : ""}${show(cl.A)} = ${niceC(ev(A, env)!)}, but ${show(cl.B)} = ${niceC(ev(B, env)!)}.`;
    }
  };

  const solving = first && !firstIsIdentity && eqVars.size === 1 && free.length <= 1;

  if (!solving) {
    /* ── identities, under the assumptions ── */
    let broken: number | null = null, prevEq: Eq | null = null;
    let at = pts;
    const eqCount = eqClaims.length;
    for (const cl of claims) {
      if (cl.kind === "link") { linkMark(cl); continue; }
      const m = marks[cl.line];
      if (broken !== null) { m.status = "after"; m.head = `Follows from line ${broken + 1}, so it inherits the mistake.`; continue; }
      const eqs = cl.kind === "eq" ? [cl.eq] : cl.eqs;
      const verdicts = eqs.map((e) => holds(S(e.L), S(e.R), at));
      const ok = cl.kind === "eq" ? !verdicts[0].fail && verdicts[0].defined > 0 : verdicts.some((v) => !v.fail && v.defined > 0);
      if (cl.kind === "eq" && verdicts[0].defined === 0) {
        m.status = "slip"; slips++; broken = cl.line;
        const zero = [...subtrees(cl.eq.L), ...subtrees(cl.eq.R)].find((n) => n.k === "div" && pts.every((env) => { const z = ev(S(n.b), env); return !z || cabs(z) < 1e-9; }));
        m.head = "This line divides by zero.";
        m.why = zero && zero.k === "div" ? [`${show(zero.b)} is 0${Object.keys(subs).length ? ` once ${Object.entries(subText).map(([v, e]) => `${v} = ${e}`).join(", ")}` : ""}, so nothing here is defined.`] : [];
        continue;
      }
      if (ok) { if (cl.kind === "eq") prevEq = cl.eq; continue; }
      const eq = cl.kind === "eq" ? cl.eq : cl.eqs[0];
      if (cl.kind === "eq" && cl.given && !Object.keys(subs).length) { m.status = "given"; m.head = "Taken as given."; prevEq = cl.eq; continue; }
      if (!prevEq && cl.kind === "eq" && eqVars.size > 1 && !Object.keys(subs).length && eqCount > 1) {
        // An equation in several unknowns, with more lines after it: it is the
        // starting point, and every later line has to hold wherever it does.
        const onIt = premisePoints(cl.eq, free, filters, S);
        if (onIt.length >= 6) {
          at = onIt; prevEq = cl.eq;
          m.status = "given"; m.head = "The starting equation. Every line below has to hold wherever this one does.";
          continue;
        }
        m.status = "given"; m.head = "An equation in several unknowns — taken as the starting point.";
        return finishUnchecked(marks, claims, cl, slips, warns);
      }
      m.status = "slip"; slips++; broken = cl.line;
      const env = (at === pts ? friendly.find((e) => { const a = ev(S(eq.L), e), b = ev(S(eq.R), e); return a && b && !close(a, b); }) : null) ?? verdicts[0].fail ?? at[0];
      m.head = prevEq ? `Line ${cl.line + 1} doesn’t follow from the line above.` : `Line ${cl.line + 1} isn’t true${Object.keys(subs).length || filters.length ? " under the assumptions" : ""}.`;
      m.why = prevEq ? explainEqStep(prevEq, eq, diag, free, S, env) : explainRewrite(eq.L, eq.R, diag, free, S);
      const where = describeEnv(env, diag);
      const sides = sideValues(S(eq.L), S(eq.R), env);
      m.evidence = where ? `At ${where}: ${sides}.` : `${sides[0].toUpperCase()}${sides.slice(1)}.`;
    }
    const summary = slips ? `Found ${slips === 1 ? "the slip" : `${slips} slips`}. Everything above ${slips === 1 ? "it" : "the first"} holds.` : "Every step holds. No slip found.";
    return { mode: "identity", marks, summary, slips, warns, note: noteFor(free, filters, subs) };
  }

  /* ── equations in one unknown: follow the solution set ── */
  const x = [...eqVars][0];
  const setOf = (cl: Extract<Claim, { kind: "eq" | "or" }>) =>
    cl.kind === "eq" ? rootsOf({ L: S(cl.eq.L), R: S(cl.eq.R) }, x) : unionRoots(cl.eqs.map((e) => rootsOf({ L: S(e.L), R: S(e.R) }, x)));
  const sat = (cl: Extract<Claim, { kind: "eq" | "or" }>, r: number) =>
    cl.kind === "eq" ? satisfies({ L: S(cl.eq.L), R: S(cl.eq.R) }, x, r) : cl.eqs.some((e) => satisfies({ L: S(e.L), R: S(e.R) }, x, r));

  type Step = { cl: Extract<Claim, { kind: "eq" | "or" }>; set: RootSet };
  let prev: Step | null = null;
  let origin: Step | null = null;
  for (const cl of claims) {
    if (cl.kind === "link") { linkMark(cl); continue; }
    const m = marks[cl.line];
    const set = setOf(cl);
    m.set = showSet(set, x);
    if (set.kind === "all" && prev) { m.status = "ok"; m.head = "An identity — true for every value, so it is a side calculation."; continue; }
    if (!prev) { prev = origin = { cl, set }; m.status = "given"; m.head = "The equation to solve."; continue; }
    if (set.kind === "many" || prev.set.kind === "many") { m.status = "unchecked"; m.head = "Infinitely many solutions — not compared."; prev = { cl, set }; continue; }
    const before = prev.set.kind === "finite" ? prev.set.roots : [];
    const after = set.kind === "finite" ? set.roots : [];
    const lost = before.filter((r) => !sat(cl, r));
    const gained = set.kind === "all" ? [] : after.filter((r) => !sat(prev!.cl, r));
    const pe = prev.cl.kind === "eq" ? prev.cl.eq : null, ce = cl.kind === "eq" ? cl.eq : null;
    if (lost.length) {
      m.status = "slip"; slips++;
      m.head = `This step lost ${lost.length === 1 ? "a solution" : "solutions"}: ${lost.map((r) => `${x} = ${niceReal(r)}`).join(", ")}.`;
      const why: string[] = [];
      if (pe && ce) {
        const g = dividedBy(pe, ce, allVars);
        if (g && lost.some((r) => { const z = ev(S(g), { [x]: c(r) }); return z && cabs(z) < 1e-7; }))
          why.push(`Both sides were divided by ${show(g)}, which is 0 when ${lost.map((r) => `${x} = ${niceReal(r)}`).join(" or ")} — so those solutions were thrown away. Factor instead of dividing.`);
        else if (tookRoots(pe, ce, allVars)) why.push(`Square roots were taken of both sides, keeping only the + sign. From A² = B² you get A = B or A = −B.`);
        else why.push(...explainEqStep(pe, ce, diag, free, S, null));
      }
      m.why = why;
      if (gained.length) m.why.push(`It also brought in ${gained.map((r) => `${x} = ${niceReal(r)}`).join(", ")}, which the line above doesn’t allow.`);
      const r0 = lost[0], env = { [x]: c(r0) };
      m.evidence = `${x} = ${niceReal(r0)} satisfies line ${prev.cl.line + 1} (${pe ? sideValues(S(pe.L), S(pe.R), env) : "one of its cases"}) but not this one${ce ? ` (${sideValues(S(ce.L), S(ce.R), env)})` : ""}.`;
    } else if (gained.length || (set.kind === "all" && prev.set.kind !== "all")) {
      m.status = "warn"; warns++;
      m.head = set.kind === "all" ? "This line is true for every value — the information in the line above was lost." : `This step added ${gained.map((r) => `${x} = ${niceReal(r)}`).join(", ")}, which doesn’t satisfy the line above.`;
      const why: string[] = [];
      if (pe && ce) {
        if (squared(pe, ce, allVars)) why.push("Squaring both sides does this: it also lets in the solutions of A = −B. Fine as a method — but every answer has to be checked in the original.");
        else { const g = multipliedBy(pe, ce, allVars); if (g) why.push(`Both sides were multiplied by ${show(g)}, which adds every value that makes it 0.`); }
      }
      m.why = why;
      if (gained.length && pe) { const env = { [x]: c(gained[0]) }; m.evidence = `At ${x} = ${niceReal(gained[0])}: line ${prev.cl.line + 1} gives ${sideValues(S(pe.L), S(pe.R), env)}.`; }
    }
    prev = { cl, set };
  }

  // The answer, checked against the question.
  let summary = slips ? `Found ${slips === 1 ? "a step" : `${slips} steps`} that changed the solutions.` : warns ? "No solutions lost — but some were added on the way." : "Every step keeps the same solutions.";
  const o = origin as Step | null, last = prev as Step | null;
  if (o && last && last !== o && last.set.kind === "finite") {
    const finalRoots = last.set.roots;
    const good = finalRoots.filter((r) => sat(o.cl, r)), bad = finalRoots.filter((r) => !sat(o.cl, r));
    const missed = o.set.kind === "finite" ? o.set.roots.filter((r) => !finalRoots.some((q) => Math.abs(q - r) < 1e-7 * Math.max(1, Math.abs(r)))) : [];
    const list = (rs: number[]) => rs.map((r) => `${x} = ${niceReal(r)}`).join(" and ");
    const parts: string[] = [];
    if (good.length) parts.push(`${list(good)} ${good.length === 1 ? "checks" : "check"} out in the original.`);
    if (bad.length) parts.push(`${list(bad)} ${bad.length === 1 ? "does" : "do"} not satisfy the original.`);
    if (missed.length) parts.push(`The original’s ${missed.length === 1 ? "solution is" : "solutions are"} ${list(missed)}.`);
    if (parts.length) summary += " " + parts.join(" ");
  }
  return { mode: "solving", marks, summary, unknown: x, slips, warns, note: `Real solutions between −${RANGE} and ${RANGE}, found numerically.` };
}

function finishUnchecked(marks: Mark[], claims: Claim[], from: Claim, slips: number, warns: number): Report {
  let seen = false;
  for (const cl of claims) {
    if (cl === from) { seen = true; continue; }
    if (seen && cl.kind !== "link") { marks[cl.line].status = "unchecked"; marks[cl.line].head = "Not checked: SLIP follows equations in one unknown, or identities. Add a “Let” line to define a variable."; }
  }
  return { mode: "identity", marks, summary: "Several unknowns and no assumptions: only the expression steps were checked.", slips, warns };
}

function noteFor(free: string[], filters: Filter[], subs: Record<string, Node>): string {
  if (!free.length) return "No variables: every line was evaluated exactly as written, in complex numbers.";
  const bits = [`Tested at ${SAMPLE_N} sampled values${free.length ? ` of ${free.join(", ")}` : ""}`];
  if (Object.keys(subs).length) bits.push("after the substitutions");
  if (filters.length) bits.push("within the stated conditions");
  return bits.join(", ") + ". A sampled test, not a proof — but a false step almost always fails at most points.";
}

/** Why one equation does not follow from the previous one. */
function explainEqStep(prev: Eq, curr: Eq, d: DiagCtx, free: string[], S: (n: Node) => Node, env: Env | null): string[] {
  const vs = d.allVars;
  const g = dividedBy(prev, curr, vs);
  if (g) {
    const val = env ? ev(S(g), env) : null;
    const because = Object.keys(d.subs).length ? ` once ${Object.entries(d.subText).map(([v, e]) => `${v} = ${e}`).join(", ")}` : "";
    return [`Both sides were divided by ${show(g)}${val && cabs(val) < 1e-9 ? `, which is 0${because}` : ""}. Dividing by zero is how “proofs” of 1 = 2 work.`];
  }
  if (tookRoots(prev, curr, vs)) return ["Square roots were taken of both sides. But A² = B² only gives A = B or A = −B — and here it is A = −B."];
  const sameL = equivGeneric(prev.L, curr.L, vs), sameR = equivGeneric(prev.R, curr.R, vs);
  if (sameL && !sameR) return ["The left side is unchanged; the right side was rewritten wrongly.", ...explainRewrite(prev.R, curr.R, d, free, S)];
  if (sameR && !sameL) return ["The right side is unchanged; the left side was rewritten wrongly.", ...explainRewrite(prev.L, curr.L, d, free, S)];
  // Both sides changed: a legal step changes them by the same amount.
  const dL = polyOf((e) => { const a = ev(S(curr.L), e), b = ev(S(prev.L), e); return a && b ? c(a.re - b.re, a.im - b.im) : null; }, free);
  const dR = polyOf((e) => { const a = ev(S(curr.R), e), b = ev(S(prev.R), e); return a && b ? c(a.re - b.re, a.im - b.im) : null; }, free);
  if (dL && dR) {
    const neg = (s: string) => (s.startsWith(MINUS) ? s.slice(1) : MINUS + s);
    const opposite = dL !== "0" && dR !== "0" && polyEq(neg(dL), dR);
    return opposite
      ? [`The left side changed by ${dL} but the right by ${dR}. A term moved across the = sign has to change its sign, so both sides change by the same amount.`]
      : [`The left side changed by ${dL} and the right side by ${dR}. A valid step changes both sides by the same amount.`];
  }
  return ["The two sides were changed in different ways, so the equation is no longer the same one."];
}
const polyEq = (a: string, b: string) => a.replace(/\s/g, "") === b.replace(/\s/g, "");
