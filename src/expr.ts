/**
 * Expressions: parse what people actually type, evaluate it in complex numbers.
 *
 * Complex on purpose. The classic "−1 = 1" trick goes through √−1·√−1 = √1, and
 * a checker that only knew real numbers would have to give up on that line
 * instead of showing exactly where the rule √a·√b = √(ab) stops holding.
 */

export type Fn = "sqrt" | "cbrt" | "sin" | "cos" | "tan" | "exp" | "ln" | "abs";
export type Node =
  | { k: "num"; v: number }
  | { k: "const"; name: "pi" | "e" | "i" }
  | { k: "var"; name: string }
  | { k: "neg"; a: Node }
  | { k: "add" | "sub" | "mul" | "div" | "pow"; a: Node; b: Node }
  | { k: "fn"; name: Fn; a: Node };

export class ParseError extends Error {}

/* ── complex numbers ──────────────────────────────────────────────────────── */

export type C = { re: number; im: number };
export const c = (re: number, im = 0): C => ({ re, im });
const cadd = (a: C, b: C): C => c(a.re + b.re, a.im + b.im);
const csub = (a: C, b: C): C => c(a.re - b.re, a.im - b.im);
const cmul = (a: C, b: C): C => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
function cdiv(a: C, b: C): C {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) return c(NaN, NaN);
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}
export const cabs = (a: C) => Math.hypot(a.re, a.im);
const cexp = (a: C): C => { const m = Math.exp(a.re); return c(m * Math.cos(a.im), m * Math.sin(a.im)); };
/** Principal logarithm: imaginary part in (−π, π]. */
function clog(a: C): C {
  if (a.re === 0 && a.im === 0) return c(-Infinity, 0);
  return c(Math.log(cabs(a)), Math.atan2(a.im, a.re));
}
/** Principal square root: the one with non-negative real part. √−1 = i. */
function csqrt(a: C): C {
  if (a.im === 0) return a.re >= 0 ? c(Math.sqrt(a.re)) : c(0, Math.sqrt(-a.re));
  const r = cabs(a);
  const re = Math.sqrt((r + a.re) / 2);
  const im = Math.sign(a.im) * Math.sqrt((r - a.re) / 2);
  return c(re, im);
}
function cpow(a: C, b: C): C {
  // Whole-number powers by repeated multiplication: (−2)² is exactly 4, with no branch cut involved.
  if (b.im === 0 && Number.isInteger(b.re) && Math.abs(b.re) <= 64) {
    let n = Math.abs(b.re), base = a, out = c(1);
    while (n > 0) { if (n & 1) out = cmul(out, base); base = cmul(base, base); n >>= 1; }
    return b.re < 0 ? cdiv(c(1), out) : out;
  }
  if (a.re === 0 && a.im === 0) return b.re > 0 ? c(0) : c(NaN, NaN);
  // A positive real base keeps a real answer exactly, e.g. 4^(1/2) = 2.
  if (a.im === 0 && a.re > 0 && b.im === 0) return c(Math.pow(a.re, b.re));
  return cexp(cmul(b, clog(a)));
}
const csin = (a: C): C => c(Math.sin(a.re) * Math.cosh(a.im), Math.cos(a.re) * Math.sinh(a.im));
const ccos = (a: C): C => c(Math.cos(a.re) * Math.cosh(a.im), -Math.sin(a.re) * Math.sinh(a.im));

export type Env = Record<string, C>;

export function evaluate(n: Node, env: Env): C {
  switch (n.k) {
    case "num": return c(n.v);
    case "const": return n.name === "pi" ? c(Math.PI) : n.name === "e" ? c(Math.E) : c(0, 1);
    case "var": { const v = env[n.name]; if (!v) throw new Error(`no value for ${n.name}`); return v; }
    case "neg": { const a = evaluate(n.a, env); return c(-a.re, -a.im); }
    case "add": return cadd(evaluate(n.a, env), evaluate(n.b, env));
    case "sub": return csub(evaluate(n.a, env), evaluate(n.b, env));
    case "mul": return cmul(evaluate(n.a, env), evaluate(n.b, env));
    case "div": return cdiv(evaluate(n.a, env), evaluate(n.b, env));
    case "pow": return cpow(evaluate(n.a, env), evaluate(n.b, env));
    case "fn": {
      const a = evaluate(n.a, env);
      switch (n.name) {
        case "sqrt": return csqrt(a);
        // The real cube root for real input: ∛−8 = −2, as people expect.
        case "cbrt": return a.im === 0 ? c(Math.cbrt(a.re)) : cpow(a, c(1 / 3));
        case "sin": return csin(a);
        case "cos": return ccos(a);
        case "tan": return cdiv(csin(a), ccos(a));
        case "exp": return cexp(a);
        case "ln": return clog(a);
        case "abs": return c(cabs(a));
      }
    }
  }
}

/* ── tokens ───────────────────────────────────────────────────────────────── */

type Tok =
  | { t: "num"; v: number } | { t: "var"; name: string } | { t: "const"; name: "pi" | "e" | "i" }
  | { t: "fn"; name: Fn } | { t: "op"; v: string } | { t: "sup"; v: number };

const FUNCS: Record<string, Fn> = { sqrt: "sqrt", cbrt: "cbrt", sin: "sin", cos: "cos", tan: "tan", exp: "exp", ln: "ln", log: "ln", abs: "abs" };
const FUNC_NAMES = Object.keys(FUNCS).sort((a, b) => b.length - a.length);
const SUP: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
const LETTER = /[A-Za-zα-ωΑ-Ω]/;

export function normalise(s: string): string {
  return s
    .replace(/[−–—]/g, "-").replace(/[·×⋅∙•]/g, "*").replace(/÷/g, "/").replace(/π/g, "pi")
    .replace(/\*\*/g, "^").replace(/\s+/g, " ").trim();
}

export function tokenize(src: string): Tok[] {
  const s = normalise(src);
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " ") { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const v = Number(s.slice(i, j));
      if (!Number.isFinite(v)) throw new ParseError(`“${s.slice(i, j)}” is not a number`);
      out.push({ t: "num", v }); i = j; continue;
    }
    if (ch in SUP) {
      let j = i, txt = ""; while (j < s.length && s[j] in SUP) txt += SUP[s[j++]];
      const v = Number(txt);
      if (!Number.isFinite(v)) throw new ParseError("unreadable superscript");
      out.push({ t: "sup", v }); i = j; continue;
    }
    if (ch === "√") { out.push({ t: "fn", name: "sqrt" }); i++; continue; }
    if (ch === "∛") { out.push({ t: "fn", name: "cbrt" }); i++; continue; }
    if (LETTER.test(ch)) {
      let j = i; while (j < s.length && LETTER.test(s[j])) j++;
      const run = s.slice(i, j);
      // Split a run of letters: function names and π first, single-letter variables otherwise.
      let k = 0;
      while (k < run.length) {
        const rest = run.slice(k).toLowerCase();
        const f = FUNC_NAMES.find((n) => rest.startsWith(n));
        if (f) { out.push({ t: "fn", name: FUNCS[f] }); k += f.length; continue; }
        if (rest.startsWith("pi")) { out.push({ t: "const", name: "pi" }); k += 2; continue; }
        const l = run[k];
        if (l === "e" || l === "i") out.push({ t: "const", name: l });
        else out.push({ t: "var", name: l });
        k++;
      }
      i = j; continue;
    }
    if ("+-*/^()|[]{}".includes(ch)) {
      out.push({ t: "op", v: ch === "[" || ch === "{" ? "(" : ch === "]" || ch === "}" ? ")" : ch }); i++; continue;
    }
    if (ch === "!") throw new ParseError("factorials are not supported");
    throw new ParseError(`unexpected “${ch}”`);
  }
  return out;
}

/* ── parser ───────────────────────────────────────────────────────────────── */

export function parse(src: string): Node {
  const toks = tokenize(src);
  if (!toks.length) throw new ParseError("empty");
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = toks[p]; return t !== undefined && t.t === "op" && t.v === v; };
  const startsAtom = () => {
    const t = toks[p];
    return !!t && (t.t === "num" || t.t === "var" || t.t === "const" || t.t === "fn" || (t.t === "op" && t.v === "("));
  };

  function sum(): Node {
    let n = product();
    for (;;) {
      if (isOp("+")) { p++; n = { k: "add", a: n, b: product() }; }
      else if (isOp("-")) { p++; n = { k: "sub", a: n, b: product() }; }
      else return n;
    }
  }
  function product(): Node {
    let n = unary();
    for (;;) {
      if (isOp("*")) { p++; n = { k: "mul", a: n, b: unary() }; }
      else if (isOp("/")) { p++; n = { k: "div", a: n, b: unary() }; }
      else if (startsAtom()) n = { k: "mul", a: n, b: power() }; // implicit: 2x, ab, (a+b)(a−b)
      else return n;
    }
  }
  function unary(): Node {
    if (isOp("-")) { p++; return { k: "neg", a: unary() }; }
    if (isOp("+")) { p++; return unary(); }
    return power();
  }
  function power(): Node {
    let base = postfix();
    if (isOp("^")) { p++; base = { k: "pow", a: base, b: unary() }; }
    return base;
  }
  function postfix(): Node {
    let n = atom();
    while (peek()?.t === "sup") { const t = peek() as { t: "sup"; v: number }; p++; n = { k: "pow", a: n, b: { k: "num", v: t.v } }; }
    return n;
  }
  function atom(): Node {
    const t = peek();
    if (!t) throw new ParseError("the line ends too early");
    if (t.t === "num") { p++; return { k: "num", v: t.v }; }
    if (t.t === "var") { p++; return { k: "var", name: t.name }; }
    if (t.t === "const") { p++; return { k: "const", name: t.name }; }
    if (t.t === "fn") {
      p++;
      if (isOp("(")) { p++; const a = sum(); expect(")"); return { k: "fn", name: t.name, a }; }
      // √x, √−1, sin x: the function takes the next power-level term.
      if (isOp("-")) { p++; return { k: "fn", name: t.name, a: { k: "neg", a: power() } }; }
      return { k: "fn", name: t.name, a: power() };
    }
    if (t.t === "op" && t.v === "(") { p++; const a = sum(); expect(")"); return a; }
    if (t.t === "op" && t.v === "|") { p++; const a = sum(); expect("|"); return { k: "fn", name: "abs", a }; }
    throw new ParseError(`unexpected “${t.t === "op" ? t.v : t.t}”`);
  }
  function expect(v: string) {
    if (!isOp(v)) throw new ParseError(`expected “${v}”`);
    p++;
  }

  const n = sum();
  if (p < toks.length) {
    const t = toks[p];
    throw new ParseError(`unexpected “${t.t === "op" ? t.v : t.t === "num" ? t.v : t.t}”`);
  }
  return n;
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

export function vars(n: Node, out = new Set<string>()): Set<string> {
  if (n.k === "var") out.add(n.name);
  else if (n.k === "neg" || n.k === "fn") vars(n.a, out);
  else if ("b" in n) { vars(n.a, out); vars(n.b, out); }
  return out;
}

export function subst(n: Node, sub: Record<string, Node>): Node {
  switch (n.k) {
    case "var": return sub[n.name] ?? n;
    case "num": case "const": return n;
    case "neg": return { k: "neg", a: subst(n.a, sub) };
    case "fn": return { k: "fn", name: n.name, a: subst(n.a, sub) };
    default: return { k: n.k, a: subst(n.a, sub), b: subst(n.b, sub) };
  }
}

export function subtrees(n: Node, out: Node[] = []): Node[] {
  out.push(n);
  if (n.k === "neg" || n.k === "fn") subtrees(n.a, out);
  else if ("b" in n) { subtrees(n.a, out); subtrees(n.b, out); }
  return out;
}

const PREC: Record<Node["k"], number> = { add: 1, sub: 1, mul: 2, div: 2, neg: 3, pow: 4, fn: 5, num: 6, var: 6, const: 6 };
const SUPS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** Print in the notation people write: ·, superscripts, √, and no needless brackets. */
export function show(n: Node, parent = 0, right = false): string {
  const wrap = (s: string, prec: number) => (prec < parent || (right && prec === parent && prec <= 2) ? `(${s})` : s);
  switch (n.k) {
    case "num": return Number.isInteger(n.v) ? String(n.v) : String(+n.v.toPrecision(10));
    case "const": return n.name === "pi" ? "π" : n.name;
    case "var": return n.name;
    case "neg": return wrap(`−${show(n.a, 3)}`, 3);
    case "add": return wrap(`${show(n.a, 1)} + ${show(n.b, 1, true)}`, 1);
    case "sub": return wrap(`${show(n.a, 1)} − ${show(n.b, 1, true)}`, 1);
    case "mul": {
      // A negative factor gets brackets: (−1)(−1), not −1·−1.
      const a = n.a.k === "neg" ? `(${show(n.a)})` : show(n.a, 2);
      const b = n.b.k === "neg" ? `(${show(n.b)})` : show(n.b, 2, true);
      // 2x, 3(x + 1), ab — but 2·3 keeps its dot.
      const tight = (b.startsWith("(") && n.b.k !== "num")
        || (n.a.k === "num" && (n.b.k === "var" || n.b.k === "const" || n.b.k === "fn" || (n.b.k === "pow" && n.b.a.k !== "num")))
        || ((n.a.k === "var" || n.a.k === "const") && (n.b.k === "var" || (n.b.k === "pow" && n.b.a.k === "var")));
      return wrap(tight ? `${a}${b}` : `${a}·${b}`, 2);
    }
    case "div": return wrap(`${show(n.a, 2)}/${show(n.b, 3, true)}`, 2);
    case "pow": {
      const base = show(n.a, 5);
      if (n.b.k === "num" && Number.isInteger(n.b.v) && n.b.v >= 0 && n.b.v < 10) return wrap(base + SUPS[n.b.v], 4);
      return wrap(`${base}^${show(n.b, 5)}`, 4);
    }
    case "fn": {
      if (n.name === "sqrt") return `√${n.a.k === "var" || n.a.k === "num" || n.a.k === "const" ? show(n.a, 6) : `(${show(n.a)})`}`;
      if (n.name === "abs") return `|${show(n.a)}|`;
      return `${n.name}(${show(n.a)})`;
    }
  }
}
