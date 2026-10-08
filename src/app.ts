import { check, type Mark, type Report } from "./check";
import { GALLERY } from "./gallery";

type Kid = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | number | boolean | ((e: Event) => void) | undefined> = {}, ...kids: Kid[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v);
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) el.append(k);
  return el;
}
const $ = <T extends Element>(s: string) => document.querySelector(s) as T;

/** Display text the way it would be written by hand. */
function pretty(s: string): string {
  return s
    .replace(/\*\*/g, "^").replace(/\^\(?2\)?(?![0-9])/g, "²").replace(/\^\(?3\)?(?![0-9])/g, "³")
    .replace(/sqrt\s*\(/gi, "√(").replace(/\bpi\b/gi, "π").replace(/\*/g, "·")
    .replace(/(^|[^<>!=])-(?!>)/g, "$1−").replace(/>=/g, "≥").replace(/<=/g, "≤").replace(/!=/g, "≠");
}

/** Split on the "=" signs a person reads, not those inside ≤ ≥ ≠ ⇒. */
function equalsSegments(s: string): string[] {
  return s.split(/(?<![<>!=])=(?![>=])/);
}

/* ── the red pen ──────────────────────────────────────────────────────────── */
function wobble(seed: number) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}
/** A loop drawn by hand: an ellipse that overshoots its start, never quite closed. */
function penLoop(w: number, hgt: number, seed: number): SVGSVGElement {
  const r = wobble(seed);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const pad = 10;
  svg.setAttribute("viewBox", `0 0 ${w + pad * 2} ${hgt + pad * 2}`);
  svg.setAttribute("class", "loop");
  svg.setAttribute("aria-hidden", "true");
  const cx = (w + pad * 2) / 2, cy = (hgt + pad * 2) / 2, rx = w / 2 + pad * 0.7, ry = hgt / 2 + pad * 0.55;
  let d = "";
  const turns = 1.12, steps = 64, start = -2.6 + r() * 0.4;
  for (let i = 0; i <= steps; i++) {
    const t = start + (i / steps) * Math.PI * 2 * turns;
    const k = 1 + (r() - 0.5) * 0.035 + i / steps * 0.05;
    const x = cx + Math.cos(t) * rx * k, y = cy + Math.sin(t) * ry * k + (i / steps) * 2.5;
    d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

/* ── rendering the marked sheet ───────────────────────────────────────────── */
function lineBody(raw: string, m: Mark): HTMLElement {
  const body = h("span", { class: "math" });
  if (m.links?.length) {
    const segs = equalsSegments(raw);
    segs.forEach((seg, i) => {
      if (i > 0) {
        const link = m.links!.find((l) => l.i === i - 1) ?? (segs[0].trim() === "" ? m.links!.find((l) => l.i === i - 1) : undefined);
        const bad = link?.status === "slip";
        body.append(h("span", { class: bad ? "eqsign bad" : "eqsign" }, bad ? h("span", { class: "strike" }, "=") : "="));
      }
      if (seg) body.append(pretty(seg));
    });
  } else body.append(pretty(raw.trim()));
  return body;
}

function render(text: string, r: Report) {
  const sheet = $("#sheet") as HTMLElement;
  const raw = text.replace(/\r/g, "").split("\n");
  const rows: Node[] = [];
  let loopSeed = 1;
  r.marks.forEach((m, i) => {
    const line = raw[i] ?? "";
    if (m.status === "blank") { rows.push(h("div", { class: "row blank" })); return; }
    const margin = h("span", { class: "margin" },
      m.status === "ok" ? h("span", { class: "tick", title: "holds" }, "✓")
        : m.status === "slip" ? h("span", { class: "cross", title: "the slip" }, "✗")
        : m.status === "warn" ? h("span", { class: "query", title: "check this" }, "?")
        : m.status === "given" ? h("span", { class: "given" }, "given")
        : m.status === "after" ? h("span", { class: "after" }, "↳")
        : m.status === "unchecked" ? h("span", { class: "after" }, "—") : null);
    const num = h("span", { class: "num" }, m.status === "prose" ? "" : String(i + 1));
    const body = m.status === "prose" ? h("span", { class: "prose" }, line.trim()) : lineBody(line, m);
    const holder = h("span", { class: `holder ${m.status}` }, body);
    const row = h("div", { class: `row ${m.status}` }, num, margin, holder, m.set ? h("span", { class: "set" }, m.set) : null);
    rows.push(row);
    if (m.status === "slip" && !m.links?.length) {
      requestAnimationFrame(() => {
        const box = body.getBoundingClientRect();
        if (box.width) holder.append(penLoop(box.width, box.height, loopSeed++));
      });
    }
    if ((m.status === "slip" || m.status === "warn" || (m.status === "after" && i === r.marks.findIndex((x) => x.status === "after"))) && m.head) {
      rows.push(h("div", { class: `note ${m.status}` },
        h("p", { class: "head" }, m.head),
        ...(m.why ?? []).map((w) => h("p", {}, w)),
        m.evidence ? h("p", { class: "evidence" }, m.evidence) : null));
    }
  });
  sheet.replaceChildren(...rows);

  const verdict = $("#verdict") as HTMLElement;
  verdict.dataset.level = r.slips ? "slip" : r.warns ? "warn" : r.mode === "empty" ? "empty" : "clean";
  verdict.textContent = r.summary;
  ($("#method") as HTMLElement).textContent = r.note ?? "";
}

/* ── the page ─────────────────────────────────────────────────────────────── */
const editor = () => $("#work") as HTMLTextAreaElement;

function encode(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decode(s: string) {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
  } catch { return null; }
}

let timer: ReturnType<typeof setTimeout> | undefined;
function run() {
  const t = editor().value;
  try { render(t, check(t)); }
  catch (e) { ($("#verdict") as HTMLElement).textContent = `Something went wrong reading that: ${(e as Error).message}`; }
  try { history.replaceState(null, "", t.trim() ? `#t=${encode(t)}` : location.pathname); } catch { /* fine */ }
  document.querySelectorAll<HTMLElement>(".chip").forEach((c) => c.classList.toggle("on", GALLERY.find((g) => g.id === c.dataset.id)?.text === t));
}

function insert(sym: string) {
  const ta = editor();
  const a = ta.selectionStart, b = ta.selectionEnd;
  ta.value = ta.value.slice(0, a) + sym + ta.value.slice(b);
  ta.selectionStart = ta.selectionEnd = a + sym.length;
  ta.focus();
  run();
}

function boot() {
  ($("#gallery") as HTMLElement).replaceChildren(...GALLERY.map((g) =>
    h("button", { class: "chip", "data-id": g.id, onclick: () => { editor().value = g.text; run(); } }, g.label)));
  ($("#keys") as HTMLElement).replaceChildren(...["√", "²", "³", "π", "±", "≠", "≤", "·", "(", ")"].map((k) =>
    h("button", { class: "key", onclick: () => insert(k), "aria-label": `insert ${k}` }, k)));
  editor().addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 220); });
  $("#share").addEventListener("click", async () => {
    const btn = $("#share") as HTMLElement;
    try { await navigator.clipboard.writeText(location.href); btn.textContent = "link copied"; }
    catch { btn.textContent = "copy the address bar"; }
    setTimeout(() => (btn.textContent = "share this"), 1800);
  });
  const fromHash = location.hash.startsWith("#t=") ? decode(location.hash.slice(3)) : null;
  editor().value = fromHash ?? GALLERY[0].text;
  run();
  window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(run, 200); });
}
boot();
