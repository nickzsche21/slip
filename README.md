# SLIP

**Find the line where the math breaks.**

Every “proof” that 1 = 2 has exactly one bad line. So does a wrong answer — yours, the textbook’s,
or the AI’s. Write the working one step per line and SLIP marks it like returned homework: pencil
ticks on the lines that hold, a red circle round the one that doesn’t, the reason in the margin,
and the values that prove it.

**Live:** https://slip-pi-murex.vercel.app

---

## What it catches

| The working | Where it breaks | What the margin says |
| --- | --- | --- |
| Let a = b … (a + b)(a − b) = b(a − b) → a + b = b | line 5 | both sides divided by a − b, which is 0 once a = b |
| −1 = i·i = √−1·√−1 = √((−1)(−1)) = 1 | the 3rd “=” | √a·√b = √(ab) fails when both are negative |
| (2 − 3/2)² = (1 − 3/2)² → 2 − 3/2 = 1 − 3/2 | line 5 | A² = B² gives A = ±B; here A = −B |
| x² = 4 → x = 2 | line 2 | lost x = −2 by taking square roots |
| x² = 3x → x = 3 | line 2 | divided by x, which is 0 at the lost root x = 0 |
| √(x + 2) = x → x + 2 = x² | line 2 (a “?”) | squaring added x = −1; the final answer is checked |
| 3x − 5 = 10 → 3x = 10 − 5 | line 2 | a term moved across = kept its sign |
| (a + b)² = a² + b² | line 1 | the sides differ by **2ab** — the missing middle term |
| √((x + 3)²) = x + 3 | the “=” | √(x²) is \|x\|; at x = −4 it is 1, not −1 |

And the reason it exists: an AI-style worked solution of (x + 2)² = 2x + 13 that expands the square
wrongly on line 2 — every later line is internally fine, the final answer x = ±3 satisfies none of
the question, and SLIP says so, with the real roots −1 ± √10.

## How it checks

**Lines of expressions** — `(x + 1)² = x² + 2x + 1`, `a = b = c`, or a line starting with `=` that
continues the one above — must hold for every value. Both sides are evaluated at 60 sampled points,
in **complex numbers** (so √−1 and the branch-cut tricks behave as mathematics says), after
substituting assumptions such as `Let a = b` and keeping only points that satisfy conditions such
as `x > 0`. One disagreeing point is enough; the friendliest one is shown.

**Equations in one unknown** — `x² = 4` — are followed by their **real solution sets**, found
numerically between −100 and 100. A step that loses a solution is an error; a step that gains one is
flagged and the final answer is checked against the original. Equations in several unknowns become a
starting point: later lines must hold at points on its solution surface.

**Naming the mistake**: when a step fails, it tests the usual suspects against the line above —
division by an expression that is zero there, square roots without ±, √a·√b = √(ab), √(x²) = x,
a term moved without changing sign — and fits the difference between the sides as a short polynomial
(“the sides differ by 2ab”).

This is a sampled test, not a proof. A step that held everywhere it was sampled could in principle
fail elsewhere; for the algebra people actually write, a false step fails almost everywhere.

## Build

```bash
npm install
npm test        # 154 assertions — every example caught where it should be,
                # and 22 correct derivations that must come back clean
npm run build   # → dist/
```

No server, no account, no AI. What you type stays in the page; the share link carries it in the
URL fragment, which browsers do not send to the server.

Prompted by October 2026’s argument over AI-produced mathematics — “OpenAI withdraws three
mathematical results”, and Terence Tao on “Math 2.0” — where the shared worry was that checking,
not writing, is now the bottleneck.

MIT.
