type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

/** Tiny element builder: `on*` attributes are listeners, `class`, `testid` and boolean attributes are handled, children may be nested. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = String(v);
    else if (k === "testid") el.dataset.testid = String(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const SUIT_RE = /([♠♥♦♣])(10|[AKQJ2-9])?/g;

/** Text with suit symbols (and the rank after them) coloured by suit. */
export function suited(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(SUIT_RE)) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const red = m[1] === "♥" || m[1] === "♦";
    frag.append(h("span", { class: red ? "red" : "black" }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}
