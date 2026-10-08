import { parse, evaluate, show, vars, c, cabs, ParseError, type C } from "./expr";

let pass = 0;
const fails: string[] = [];
const ok = (n: string, cond: boolean) => { if (cond) pass++; else fails.push(n); };
const val = (s: string, env: Record<string, number> = {}): C => evaluate(parse(s), Object.fromEntries(Object.entries(env).map(([k, v]) => [k, c(v)])));
const near = (n: string, a: C, re: number, im = 0) => ok(`${n} (got ${a.re}+${a.im}i, want ${re}+${im}i)`, Math.abs(a.re - re) < 1e-9 && Math.abs(a.im - im) < 1e-9);

/* ── precedence and the shapes people type ──────────────────────────────── */
near("2 + 3·4", val("2 + 3*4"), 14);
near("implicit: 2x", val("2x", { x: 5 }), 10);
near("power binds tighter than implicit product: 2x^2", val("2x^2", { x: 3 }), 18);
near("unary minus below power: -x^2", val("-x^2", { x: 3 }), -9);
near("power is right-associative: 2^3^2", val("2^3^2"), 512);
near("negative exponent: 2^-1", val("2^-1"), 0.5);
near("(a+b)(a-b)", val("(a+b)(a-b)", { a: 5, b: 3 }), 16);
near("ab is a times b", val("ab", { a: 4, b: 2.5 }), 10);
near("superscripts: x² + y³", val("x² + y³", { x: 3, y: 2 }), 17);
near("unicode minus and dot: 3·4 − 2", val("3·4 − 2"), 10);
near("÷ and ×", val("8 ÷ 2 × 3"), 12);
near("π", val("π"), Math.PI);
near("√ binds to the next term: √x·√y", val("√x·√y", { x: 4, y: 9 }), 6);
near("√(x+2)", val("√(x+2)", { x: 7 }), 3);
near("sqrt(16)", val("sqrt(16)"), 4);
near("sin x without brackets", val("sin x", { x: Math.PI / 2 }), 1);
near("2sinx", val("2sinx", { x: Math.PI / 6 }), 1);
near("|x - 5|", val("|x - 5|", { x: 2 }), 3);
near("x^(1/2) with a positive base is real", val("4^(1/2)"), 2);
near("brackets of any shape: [x+1]{2}", val("[x+1]{2}", { x: 1 }), 4);
near("ln(e)", val("ln(e)"), 1);
near("log is natural log", val("log(e^2)"), 2);
near("∛−8 is −2", val("∛(-8)"), -2);

/* ── complex numbers, because the famous tricks need them ───────────────── */
near("√−1 is i", val("√-1"), 0, 1);
near("i·i is −1", val("i*i"), -1);
near("√−1·√−1 is −1", val("√-1·√-1"), -1);
near("√((−1)(−1)) is 1", val("√((-1)(-1))"), 1);
near("√(x²) is |x|: x = −3 gives 3", val("√(x^2)", { x: -3 }), 3);
near("(−2)² is exactly 4", val("(-2)^2"), 4);
near("e^(iπ) = −1", val("e^(i*pi)"), -1);
ok("division by zero is not a number", Number.isNaN(val("1/(x-x)", { x: 2 }).re));

/* ── printing ───────────────────────────────────────────────────────────── */
ok(`show (a+b)(a−b) (${show(parse("(a+b)(a-b)"))})`, show(parse("(a+b)(a-b)")) === "(a + b)(a − b)");
ok(`show 2x^2 (${show(parse("2x^2"))})`, show(parse("2x^2")) === "2x²");
ok(`show sqrt(x+2) (${show(parse("sqrt(x+2)"))})`, show(parse("sqrt(x+2)")) === "√(x + 2)");
ok(`show a - (b - c) keeps its brackets (${show(parse("a - (b - c)"))})`, show(parse("a - (b - c)")) === "a − (b − c)");
ok(`show 2·3 keeps its dot (${show(parse("2*3"))})`, show(parse("2*3")) === "2·3");

/* ── variables ──────────────────────────────────────────────────────────── */
ok("vars of 2ab + c", [...vars(parse("2ab + c"))].sort().join() === "a,b,c");
ok("e, i and π are constants, not variables", vars(parse("e + i + pi + x")).size === 1);

/* ── refusals ───────────────────────────────────────────────────────────── */
for (const bad of ["2 +", "(x + 1", "x)", "3!", "x # y", ""]) {
  try { parse(bad); fails.push(`“${bad}” should not parse`); } catch (e) { ok(`“${bad}” is a ParseError`, e instanceof ParseError); }
}
ok("cabs", cabs(c(3, 4)) === 5);

console.log(fails.length ? `✗ ${fails.length} failed of ${pass + fails.length}` : `✓ ${pass} assertions pass`);
for (const f of fails) console.log("  ✗", f);
process.exit(fails.length ? 1 : 0);
