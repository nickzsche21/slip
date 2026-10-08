/** The examples on the page. The tests check each one is caught where it should be. */
export type Example = { id: string; label: string; text: string };

export const GALLERY: Example[] = [
  {
    id: "one-two", label: "1 = 2",
    text: `Let a = b
a² = ab
a² − b² = ab − b²
(a + b)(a − b) = b(a − b)
a + b = b
2b = b
2 = 1`,
  },
  {
    id: "i-squared", label: "−1 = 1",
    text: `−1 = i·i = √−1 · √−1 = √((−1)(−1)) = √1 = 1`,
  },
  {
    id: "two-three", label: "2 = 1, by squares",
    text: `−2 = −2
4 − 6 = 1 − 3
4 − 6 + 9/4 = 1 − 3 + 9/4
(2 − 3/2)² = (1 − 3/2)²
2 − 3/2 = 1 − 3/2
2 = 1`,
  },
  {
    id: "lost-root", label: "x² = 4, so x = 2",
    text: `x² = 4
x = 2`,
  },
  {
    id: "cancel", label: "cancelling x",
    text: `x² = 3x
x = 3`,
  },
  {
    id: "extraneous", label: "√(x + 2) = x",
    text: `√(x + 2) = x
x + 2 = x²
x² − x − 2 = 0
(x − 2)(x + 1) = 0
x = 2 or x = −1`,
  },
  {
    id: "sign", label: "a sign slip",
    text: `3x − 5 = 10
3x = 10 − 5
x = 5/3`,
  },
  {
    id: "freshman", label: "(a + b)² = a² + b²",
    text: `(a + b)² = a² + b²`,
  },
  {
    id: "ai", label: "an AI’s working",
    text: `Solve (x + 2)² = 2x + 13
x² + 2x + 4 = 2x + 13
x² + 4 = 13
x² = 9
x = ±3`,
  },
  {
    id: "clean", label: "a correct one",
    text: `(x + 1)² − (x − 1)²
= (x² + 2x + 1) − (x² − 2x + 1)
= 4x`,
  },
];
