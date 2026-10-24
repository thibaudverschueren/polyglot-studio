"""
diagram_lib.py — a tiny drawing kit for the lesson diagrams (assets/diagrams/*.svg).

The SVGs carry only class names (d-box, d-acc, d-t …); the colours come from the app's CSS variables
(styles.css, `.figure.diagram`), so a diagram follows light/dark mode and the track colour. md.py inlines
the file into the page at build time. Canvas width is 520 so text stays readable on an iPhone.

  d = Diagram("name", height)
  d.box(x, y, w, h, [("Titel", "t"), ("regel", "s"), ("code()", "m")], kind="acc")
  d.arrow([(x1, y1), (x2, y2)], label="…")
  d.save()
"""
import html
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(os.path.dirname(HERE)), "assets", "diagrams")
W = 520
LH = {"t": 19, "s": 16, "m": 16, "l": 15}      # line height per text style
SIZE = {"t": 14.5, "s": 12.5, "m": 12.5, "l": 12}
FACTOR = {"t": 0.58, "s": 0.55, "m": 0.62, "l": 0.55}  # average glyph width / font size (generous)


def plain(s):
    return re.sub(r"[_^]\{([^}]*)\}", r"\1", s)


def rich(s):
    """Escape and turn x_{max} / x^{2} into sub/superscript tspans."""
    out, pos = [], 0
    for m in re.finditer(r"([_^])\{([^}]*)\}", s):
        out.append(html.escape(s[pos:m.start()], quote=False))
        dy = "0.32em" if m.group(1) == "_" else "-0.45em"
        out.append(f'<tspan dy="{dy}" font-size="0.78em">{html.escape(m.group(2), quote=False)}</tspan><tspan dy="{"-0.32em" if m.group(1) == "_" else "0.45em"}">&#8203;</tspan>')
        pos = m.end()
    out.append(html.escape(s[pos:], quote=False))
    return "".join(out)


def width(s, style):
    return len(plain(s)) * SIZE[style] * FACTOR[style]


class Diagram:
    def __init__(self, name, h, w=W):
        self.name, self.w, self.h = name, w, h
        self.parts = []
        self.warnings = []

    # ---- primitives
    def raw(self, s):
        self.parts.append(s)

    def rect(self, x, y, w, h, kind="", r=10):
        self.parts.append(f'<rect class="d-box {("d-" + kind) if kind else ""}" x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}"/>'.replace('class="d-box "', 'class="d-box"'))

    def text(self, x, y, s, style="s", anchor="middle", extra=""):
        cls = {"t": "d-t", "s": "d-s", "m": "d-m", "l": "d-l"}[style]
        self.parts.append(f'<text class="{cls}{(" " + extra) if extra else ""}" x="{x}" y="{y}" text-anchor="{anchor}">{rich(s)}</text>')

    def box(self, x, y, w, h, lines, kind="", r=10, anchor="middle", pad=10):
        """lines: str or list of (text, style); style t=title, s=sub, m=mono, l=small label."""
        if isinstance(lines, str):
            lines = [(lines, "t")]
        lines = [(l, "t") if isinstance(l, str) else l for l in lines]
        self.rect(x, y, w, h, kind, r)
        total = sum(LH[st] for _, st in lines)
        ty = y + (h - total) / 2
        for txt, st in lines:
            ty += LH[st]
            tx = x + w / 2 if anchor == "middle" else x + pad
            if width(txt, st) > w - 2 * pad + 2:
                self.warnings.append(f"{self.name}: text too wide for box ({int(width(txt, st))} > {w - 2 * pad}): {txt!r}")
            self.text(tx, ty - 4.5, txt, st, anchor)

    def line(self, x1, y1, x2, y2, dashed=False, cls="d-line"):
        self.parts.append(f'<line class="{cls}{" d-dash" if dashed else ""}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>')

    def arrow(self, pts, label=None, label_at=None, dashed=False, both=False, anchor="start", style="l"):
        d = "M" + " L".join(f"{x} {y}" for x, y in pts)
        mk = f' marker-end="url(#m-{self.name})"' + (f' marker-start="url(#ms-{self.name})"' if both else "")
        self.parts.append(f'<path class="d-line{" d-dash" if dashed else ""}" d="{d}"{mk}/>')
        if label:
            lx, ly = label_at if label_at else pts[-1]
            self.text(lx, ly, label, style, anchor)

    def path(self, d, cls="d-curve"):
        self.parts.append(f'<path class="{cls}" d="{d}"/>')

    def circle(self, cx, cy, r, kind="", label=None):
        self.parts.append(f'<circle class="d-box{(" d-" + kind) if kind else ""}" cx="{cx}" cy="{cy}" r="{r}"/>')
        if label:
            self.text(cx, cy + 4.5, label, "t")

    def cross(self, x, y, s=7):
        """A red X (blocked / dropped)."""
        self.parts.append(f'<path class="d-x" d="M{x - s} {y - s} L{x + s} {y + s} M{x + s} {y - s} L{x - s} {y + s}"/>')

    def brace(self, x1, x2, y, label, up=False):
        """Horizontal bracket under (or over) a span with a centred label."""
        s = -1 if up else 1
        self.parts.append(f'<path class="d-line" d="M{x1} {y} v{6 * s} H{x2} v{-6 * s}"/>')
        self.text((x1 + x2) / 2, y + (20 if not up else -10), label, "l")

    # ---- output
    def svg(self):
        n = self.name
        defs = (f'<defs><marker id="m-{n}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
                f'<path class="d-ah" d="M0 1.5 L9 5 L0 8.5z"/></marker>'
                f'<marker id="ms-{n}" viewBox="0 0 10 10" refX="1.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                f'<path class="d-ah" d="M0 1.5 L9 5 L0 8.5z"/></marker></defs>')
        body = "\n".join(self.parts)
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" preserveAspectRatio="xMidYMid meet">{defs}\n{body}\n</svg>\n'

    def save(self):
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, f"{self.name}.svg")
        with open(path, "w", encoding="utf-8") as f:
            f.write(self.svg())
        for w in self.warnings:
            print("  ⚠", w)
        return path
