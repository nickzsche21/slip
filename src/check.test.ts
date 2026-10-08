import { check, readLine, niceReal, rootsOf, polyOf, type Report } from "./check";
import { parse, evaluate, c } from "./expr";
import { GALLERY } from "./gallery";

let pass = 0;
const fails: string[] = [];
const ok = (n: string, cond: boolean) => { if (cond) pass++; else fails.push(n); };
const eq = (n: string, a: unknown, b: unknown) => ok(`${n} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));
const ex = (id: string) => GALLERY.find((g) => g.id === id)!.text;
const slipLines = (r: Report) => r.marks.filter((m) => m.status === "slip").map((m) => m.line + 1);
const warnLines = (r: Report) => r.marks.filter((m) => m.status === "warn").map((m) => m.line + 1);
const text = (r: Report, line: number) => { const m = r.marks[line - 1]; return [m.head, ...(m.why ?? []), m.evidence].join(" "); };

/* ── the classic fake proofs: caught at the right line, for the right reason ── */
{
  const r = check(ex("one-two"));
  eq("1 = 2: the slip is line 5, where a − b is divided out", slipLines(r), [5]);
  ok(`  …and it says so (${text(r, 5)})`, /divided by a − b/.test(text(r, 5)) && /which is 0/.test(text(r, 5)));
  ok("  …with a counterexample a person can check", /a = \d+, |b = \d+/.test(r.marks[4].evidence ?? ""));
  ok("  lines 2–4 hold", [2, 3, 4].every((l) => r.marks[l - 1].status === "ok"));
  ok("  lines 6–7 inherit the mistake", r.marks[5].status === "after" && r.marks[6].status === "after");
  eq("  line 1 is an assumption", r.marks[0].status, "given");
}
{
  const r = check(ex("i-squared"));
  const m = r.marks[0];
  eq("−1 = 1: one line, one bad “=”", slipLines(r), [1]);
  eq("  the third “=” is the one that breaks", m.links?.map((l) => l.status), ["ok", "ok", "slip", "ok", "ok"]);
  ok(`  …blamed on the √ product rule (${text(r, 1)})`, /√a·√b = √\(ab\)/.test(text(r, 1)));
  ok("  …with the values: −1 and 1", /= −1/.test(m.evidence ?? "") && /= 1\b/.test(m.evidence ?? ""));
  ok(`  …and no empty “At :” (${m.evidence})`, !/^At :/.test(m.evidence ?? ""));
  ok(`  …negative factors print in brackets (${m.head})`, /\(−1\)\(−1\)|\(−1\)·\(−1\)/.test(m.head ?? ""));
}
{
  const r = check(`1 = √1 = √((−1)²) = −1`);
  eq("√(x²) = x: the last “=” breaks", r.marks[0].links?.map((l) => l.status), ["ok", "ok", "slip"]);
  ok(`  …because √(x²) is |x| (${text(r, 1)})`, /\|x\|/.test(text(r, 1)));
}
{
  const r = check(ex("two-three"));
  eq("2 = 1 by squares: the slip is taking roots, line 5", slipLines(r), [5]);
  ok(`  …A² = B² gives A = ±B (${text(r, 5)})`, /A = −B/.test(text(r, 5)));
}

/* ── solving: lost and gained roots ─────────────────────────────────────── */
{
  const r = check(ex("lost-root"));
  eq("x² = 4 → x = 2 is solving mode", r.mode, "solving");
  eq("  the step loses a root", slipLines(r), [2]);
  ok(`  …x = −2 (${text(r, 2)})`, /x = −2/.test(text(r, 2)));
  ok("  …by taking square roots", /Square roots/.test(text(r, 2)));
  eq("  solution sets in the margin", [r.marks[0].set, r.marks[1].set], ["x ∈ {−2, 2}", "x ∈ {2}"]);
}
{
  const r = check(ex("cancel"));
  eq("x² = 3x → x = 3 loses a root", slipLines(r), [2]);
  ok(`  …because it divided by x, which is 0 at x = 0 (${text(r, 2)})`, /divided by x\b/.test(text(r, 2)) && /x = 0/.test(text(r, 2)));
}
{
  const r = check(ex("extraneous"));
  eq("√(x+2) = x: squaring adds a root — a warning, not an error", [slipLines(r), warnLines(r)], [[], [2]]);
  ok(`  …named as squaring (${text(r, 2)})`, /Squaring/.test(text(r, 2)) && /x = −1/.test(text(r, 2)));
  ok(`  the final answer is checked against the question (${r.summary})`, /x = 2 checks out/.test(r.summary) && /x = −1 does not satisfy/.test(r.summary));
  eq("  the original has one root", r.marks[0].set, "x ∈ {2}");
}
{
  const r = check(ex("sign"));
  eq("a sign slip when moving a term", slipLines(r), [2]);
  ok(`  …explained as a term that didn't change sign (${text(r, 2)})`, /change its sign/.test(text(r, 2)));
}
{
  const r = check(ex("freshman"));
  eq("(a + b)² = a² + b² is false", slipLines(r), [1]);
  ok(`  …the sides differ by 2ab (${text(r, 1)})`, /differ by 2ab/.test(text(r, 1)));
  ok("  …and it names the missing middle term", /middle term/.test(text(r, 1)));
}
{
  const r = check(ex("ai"));
  eq("the AI's working: the expansion on line 2 is wrong", slipLines(r), [2]);
  ok(`  …the left side was rewritten wrongly, off by 2x (${text(r, 2)})`, /left side was rewritten/.test(text(r, 2)) && /2x/.test(text(r, 2)));
  eq("  the question's real roots are found", r.marks[0].set, "x ∈ {−1 − √10, −1 + √10}");
  ok(`  …and neither answer satisfies it (${r.summary})`, /x = −3 and x = 3 do not satisfy/.test(r.summary) && /solutions are x = −1 − √10 and x = −1 \+ √10/.test(r.summary));
  ok("  later lines are each fine on their own terms", [3, 4, 5].every((l) => r.marks[l - 1].status === "ok"));
}

/* ── correct work must come back clean: false alarms are the worst bug here ── */
const CLEAN: [string, string][] = [
  ["gallery: the correct one", ex("clean")],
  ["difference of squares", "a² − b² = (a + b)(a − b)"],
  ["perfect square", "(x + 3)² = x² + 6x + 9"],
  ["cube", "(a + b)³ = a³ + 3a²b + 3ab² + b³"],
  ["trig identity", "sin(x)² + cos(x)² = 1"],
  ["double angle", "sin(2x) = 2 sin(x) cos(x)"],
  ["fraction", "1/x + 1/y = (x + y)/(xy)"],
  ["cancelling where defined", "(x² − 9)/(x − 3) = x + 3"],
  ["linear solve", "Solve 2x + 3 = 11\n2x = 8\nx = 4"],
  ["quadratic by factoring", "x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0\nx = 2 or x = 3"],
  ["quadratic formula", "x² + 2x − 9 = 0\nx = −1 ± √10"],
  ["completing the square", "x² + 6x + 5 = 0\n(x + 3)² − 4 = 0\n(x + 3)² = 4\nx + 3 = ±2\nx = −1 or x = −5"],
  ["with a condition", "x > 0\n√(x²) = x"],
  ["log rule with x > 0", "x > 0\nln(x²) = 2 ln(x)"],
  ["a remark between lines", "x² = 9\nTake square roots of both sides, keeping both signs:\nx = ±3"],
  ["numbered steps", "1. 5x = 20\n2. x = 4"],
  ["a definition and a chain", "Let y = 2x\ny² = 4x²"],
  ["exponentials", "e^(a + b) = e^a · e^b"],
  ["Euler", "e^(iπ) + 1 = 0"],
  ["abs", "|x|² = x²"],
  ["rational equation", "x/(x − 1) = 2\nx = 2(x − 1)\nx = 2"],
  ["multi-line chain", "(2x + 1)(x − 4)\n= 2x² − 8x + x − 4\n= 2x² − 7x − 4"],
];
for (const [name, t] of CLEAN) {
  const r = check(t);
  ok(`clean: ${name} has no slips (got ${slipLines(r)} ${r.marks.filter((m) => m.status === "slip").map((m) => m.head).join(" | ")})`, r.slips === 0);
  ok(`clean: ${name} has no warnings (${warnLines(r)})`, r.warns === 0);
}

/* ── several unknowns ───────────────────────────────────────────────────── */
{
  const r = check("x + y = 10\nx = 10 − y\nx − y = 10 − 2y");
  eq("a starting equation in x and y, then valid rearrangements", [r.slips, r.marks[0].status], [0, "given"]);
  const bad = check("x + y = 10\nx = 10 + y");
  eq("…and a rearrangement that flips a sign is caught", slipLines(bad), [2]);
  ok(`  …at a point on the starting equation (${bad.marks[1].evidence})`, /x = /.test(bad.marks[1].evidence ?? ""));
  const lone = check("x + y = y + x");
  eq("a lone identity in several unknowns is just an identity", lone.slips, 0);
}

/* ── reading lines the way people write them ────────────────────────────── */
eq("Let a = b is a substitution", readLine("Let a = b").kind, "sub");
eq("x ≠ 0 is a condition", readLine("x ≠ 0").kind, "filter");
eq("words are prose", readLine("Now we simplify the left side.").kind, "prose");
eq("so ... is a step", readLine("so x = 4").kind, "eq");
eq("⇒ x = 4 is a step", readLine("⇒ x = 4").kind, "eq");
eq("a remark in brackets is dropped", readLine("x = 3   (dividing by 2)").kind, "eq");
eq("x = ±3 is two answers", readLine("x = ±3").kind, "or");
eq("= continues a chain", readLine("= x² + 1").kind, "chain");
eq("a bare expression starts a chain", readLine("(x + 1)²").kind, "chain");

/* ── the arithmetic underneath ──────────────────────────────────────────── */
eq("niceReal integer", niceReal(4), "4");
eq("niceReal fraction", niceReal(-5 / 3), "−5/3");
eq("niceReal surd", niceReal(-1 + Math.sqrt(10)), "−1 + √10");
eq("niceReal simplifies the surd", niceReal(11 - Math.sqrt(40)), "11 − 2√10");
eq("niceReal π", niceReal(Math.PI / 2), "π/2");
const roots = (s: string) => { const [L, R] = s.split("="); const r = rootsOf({ L: parse(L), R: parse(R) }, "x"); return r.kind === "finite" ? r.roots.map(niceReal) : r.kind; };
eq("roots of a double root", roots("(x − 1)² = 0"), ["1"]);
eq("roots of a pole are not roots", roots("1/x = 0"), "none");
eq("roots where a side is not real are not counted", roots("√x = −1"), "none");
eq("roots at the edge of the domain", roots("√x = 0"), ["0"]);
eq("an identity has every root", roots("2(x + 1) = 2x + 2"), "all");
const D = (s: string) => (env: Record<string, { re: number; im: number }>) => evaluate(parse(s), env);
eq("polyOf 2ab", polyOf(D("(a+b)^2 - a^2 - b^2"), ["a", "b"]), "2ab");
eq("polyOf x² − 2x + 1", polyOf(D("(x-1)^2"), ["x"]), "x² − 2x + 1");
eq("polyOf a constant", polyOf(D("7"), []), "7");
eq("polyOf refuses non-polynomials", polyOf(D("sin(x)"), ["x"]), null);
ok("c helper", c(1).re === 1);

console.log(fails.length ? `✗ ${fails.length} failed of ${pass + fails.length}` : `✓ ${pass} assertions pass`);
for (const f of fails) console.log("  ✗", f);
process.exit(fails.length ? 1 : 0);
