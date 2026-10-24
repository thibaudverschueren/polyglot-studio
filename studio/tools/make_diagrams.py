#!/usr/bin/env python3
"""
make_diagrams.py — draws the lesson diagrams into assets/diagrams/*.svg (source of truth for those files).

  python3 make_diagrams.py            # all diagrams
  python3 make_diagrams.py lr-schedule gqa-heads

Lessons reference them as  ![alt text](assets/diagrams/NAME.svg "caption")  and md.py inlines the SVG,
so the colours follow the theme. Keep text short: the canvas is 520 wide and shrinks on a phone.
"""
import math
import sys

from diagram_lib import Diagram

DIAGRAMS = {}


def diagram(fn):
    DIAGRAMS[fn.__name__.replace("_", "-")] = fn
    return fn


def box_h(lines, pad=16):
    """Height of a box that holds these lines."""
    from diagram_lib import LH
    return sum(LH["t" if isinstance(l, str) else l[1]] for l in lines) + pad


# ====================================================================== AI
@diagram
def transformer_decoder_architecture():
    d = Diagram("transformer-decoder-architecture", 700)
    cx, bw = 260, 290
    x0 = cx - bw / 2
    y = 8

    def step(lines, kind="", h=None, gap=22):
        nonlocal y
        h = h or box_h(lines)
        d.box(x0, y, bw, h, lines, kind)
        top, bot = y, y + h
        y = bot + gap
        return top, bot

    top, bot = step([("Tekst", "t"), ("« De kat zit »", "s")])
    d.arrow([(cx, bot), (cx, y)])
    top, bot = step([("Tokenizer (BPE)", "t"), ("token-ID's [124, 8923, 412]", "m")])
    d.arrow([(cx, bot), (cx, y)])
    top, bot = step([("Embeddingmatrix W_{E}", "t"), ("opzoektabel V × d  ·  (B, T, d)", "m")], "info")
    d.arrow([(cx, bot), (cx, y + 14)])
    # repeated block
    gy = y
    y += 30
    in_y = y - 14
    a_top, a_bot = step([("RMSNorm → self-attention", "t"), ("GQA · RoPE · causaal masker", "s")], "acc", gap=24)
    plus1 = a_bot + 12
    d.arrow([(cx, a_bot), (cx, a_bot + 12 - 9)])
    d.circle(cx, plus1, 9, "", "+")
    d.arrow([(cx, in_y), (cx + 125, in_y), (cx + 125, plus1), (cx + 10, plus1)], dashed=True)
    d.text(cx + 133, (in_y + plus1) / 2, "residual", "l", "start")
    y = plus1 + 22
    d.arrow([(cx, plus1 + 9), (cx, y)])
    mid_in = plus1 + 11
    f_top, f_bot = step([("RMSNorm → feed-forward", "t"), ("SwiGLU", "s")], "good", gap=24)
    plus2 = f_bot + 12
    d.arrow([(cx, f_bot), (cx, plus2 - 9)])
    d.circle(cx, plus2, 9, "", "+")
    d.arrow([(cx, mid_in), (cx + 125, mid_in), (cx + 125, plus2), (cx + 10, plus2)], dashed=True)
    d.text(cx + 133, (mid_in + plus2) / 2, "residual", "l", "start")
    gh = plus2 + 18 - gy
    d.raw(f'<rect class="d-box d-plain" x="{x0 - 14}" y="{gy}" width="{bw + 28 + 70}" height="{gh}" rx="14"/>')
    d.text(x0 - 6, gy + 15, "× N lagen (bv. 32)", "l", "start")
    y = plus2 + 18 + 16
    d.arrow([(cx, plus2 + 9), (cx, y)])
    top, bot = step([("RMSNorm (laatste)", "t")], h=34)
    d.arrow([(cx, bot), (cx, y)])
    top, bot = step([("LM-head W_{U}", "t"), ("logits (B, T, V)", "m")], "warn")
    d.arrow([(cx, bot), (cx, y)])
    top, bot = step([("Softmax", "t"), ("kans per token → volgend token kiezen", "s")], "")
    d.h = int(bot + 10)
    return d


@diagram
def transformer_block():
    d = Diagram("transformer-block", 436)
    cx, bw = 250, 270
    x0 = cx - bw / 2
    d.text(cx, 18, "x  (invoer van de laag)", "s")
    y = 28
    d.arrow([(cx, y - 6), (cx, y + 10)])
    # branch 1
    d.box(x0 + 40, y + 12, bw - 80, 30, [("RMSNorm", "t")])
    d.arrow([(cx, y + 42), (cx, y + 58)])
    d.box(x0, y + 58, bw, 52, [("Causale self-attention", "t"), ("GQA · RoPE · masker", "s")], "acc")
    d.arrow([(cx, y + 110), (cx, y + 132)])
    d.circle(cx, y + 142, 10, "", "+")
    d.arrow([(cx, y - 2), (cx + 150, y - 2), (cx + 150, y + 142), (cx + 11, y + 142)], dashed=True)
    d.text(cx + 158, y + 70, "residual 1", "l", "start")
    d.text(cx - 26, y + 146, "x′ = x + Attn(Norm(x))", "l", "end")
    # branch 2
    y2 = y + 152
    d.arrow([(cx, y2), (cx, y2 + 14)])
    d.box(x0 + 40, y2 + 14, bw - 80, 30, [("RMSNorm", "t")])
    d.arrow([(cx, y2 + 44), (cx, y2 + 60)])
    d.box(x0, y2 + 60, bw, 52, [("Feed-forward (SwiGLU)", "t"), ("(SiLU(x·W_{gate}) ⊙ x·W_{up})·W_{down}", "m")], "good")
    d.arrow([(cx, y2 + 112), (cx, y2 + 134)])
    d.circle(cx, y2 + 144, 10, "", "+")
    d.arrow([(cx, y2 + 2), (cx + 150, y2 + 2), (cx + 150, y2 + 144), (cx + 11, y2 + 144)], dashed=True)
    d.text(cx + 158, y2 + 72, "residual 2", "l", "start")
    d.text(cx - 26, y2 + 148, "y = x′ + FFN(Norm(x′))", "l", "end")
    d.arrow([(cx, y2 + 154), (cx, y2 + 176)])
    d.text(cx, y2 + 192, "y  (naar de volgende laag)", "s")
    d.h = int(y2 + 200)
    return d


@diagram
def gqa_heads():
    d = Diagram("gqa-heads", 330)
    rows = [
        ("MHA", "8 Q · 8 KV", [(i, i) for i in range(8)], 8, "KV-cache 100%"),
        ("GQA", "8 Q · 2 KV", [(i, i // 4) for i in range(8)], 2, "KV-cache 25%"),
        ("MQA", "8 Q · 1 KV", [(i, 0) for i in range(8)], 1, "KV-cache 12,5%"),
    ]
    qx0, step = 126, 34
    for r, (name, sub, links, nkv, cache) in enumerate(rows):
        y = 14 + r * 100
        d.text(20, y + 22, name, "t", "start")
        d.text(20, y + 40, sub, "l", "start")
        qs = [qx0 + i * step for i in range(8)]
        for q in qs:
            d.raw(f'<rect class="d-box d-acc" x="{q}" y="{y}" width="22" height="22" rx="5"/>')
        # kv squares: centred under their group of query heads
        groups = {}
        for i, g in links:
            groups.setdefault(g, []).append(qs[i] + 11)
        for g, xs in groups.items():
            kx = sum(xs) / len(xs)
            d.raw(f'<rect class="d-box d-good" x="{kx - 11}" y="{y + 56}" width="22" height="22" rx="5"/>')
            for qxm in xs:
                d.line(qxm, y + 22, kx, y + 56)
        d.text(qx0 + 8 * step + 4, y + 17, "Q-heads", "l", "start")
        d.text(qx0 + 8 * step + 4, y + 73, cache, "l", "start")
    d.raw('<rect class="d-box d-acc" x="20" y="306" width="14" height="14" rx="3"/>')
    d.text(40, 318, "Q-head (query)", "l", "start")
    d.raw('<rect class="d-box d-good" x="170" y="306" width="14" height="14" rx="3"/>')
    d.text(190, 318, "KV-head (key + value, wordt gecachet)", "l", "start")
    return d


@diagram
def pytorch_training_loop():
    d = Diagram("pytorch-training-loop", 520)
    cx, bw = 230, 330
    x0 = cx - bw / 2
    steps = [
        ([("1 · Batch laden", "t"), ("input_ids, labels: (B, T)", "m")], ""),
        ([("2 · Forward pass", "t"), ("logits = model(input_ids)", "m"), ("bouwt de autograd-graaf op", "s")], "acc"),
        ([("3 · Cross-entropy loss", "t"), ("loss = cross_entropy(logits, y)", "m")], "warn"),
        ([("4 · Backward pass", "t"), ("loss.backward()", "m"), ("kettingregel: ∂L/∂W in param.grad", "s")], "info"),
        ([("5 · Clippen en updaten", "t"), ("clip_grad_norm_(params, 1.0)", "m"), ("optimizer.step()   # AdamW", "m")], "good"),
        ([("6 · Gradiënten wissen", "t"), ("optimizer.zero_grad()", "m")], ""),
    ]
    y = 8
    tops, bots = [], []
    for lines, kind in steps:
        h = box_h(lines)
        d.box(x0, y, bw, h, lines, kind)
        tops.append(y)
        bots.append(y + h)
        y += h + 18
        if lines is not steps[-1][0]:
            d.arrow([(cx, y - 18), (cx, y)])
    # return arrow
    rx = x0 + bw + 36
    d.arrow([(x0 + bw, (tops[5] + bots[5]) / 2), (rx, (tops[5] + bots[5]) / 2), (rx, (tops[0] + bots[0]) / 2), (x0 + bw + 2, (tops[0] + bots[0]) / 2)], dashed=True)
    d.text(rx + 8, (tops[2] + bots[2]) / 2, "volgende", "l", "start")
    d.text(rx + 8, (tops[2] + bots[2]) / 2 + 14, "batch", "l", "start")
    y -= 4
    d.box(20, y, 480, 62, [("Geheugen per parameter bij AdamW + BF16", "t"), ("2 B gewicht + 2 B gradiënt + 4 B FP32-kopie + 8 B (m en v) = 16 B", "s")], "plain" if False else "")
    d.h = int(y + 72)
    return d


@diagram
def lr_schedule():
    d = Diagram("lr-schedule", 292)
    x0, x1, ytop, ybot = 74, 496, 36, 206
    tw = x0 + 0.07 * (x1 - x0)          # warmup is drawn larger than the real 1-2%
    emin = 0.1
    d.line(x0, ybot, x1, ybot, cls="d-grid")
    d.line(x0, ytop - 10, x0, ybot, cls="d-grid")
    d.line(x0, ytop, x1, ytop, dashed=True, cls="d-grid")
    ymin = ybot - emin * (ybot - ytop)
    d.line(x0, ymin, x1, ymin, dashed=True, cls="d-grid")
    d.text(x0 - 8, ytop + 4, "η_{max}", "s", "end")
    d.text(x0 - 8, ymin + 4, "η_{min}", "s", "end")
    d.text(x0 - 8, ybot + 4, "0", "s", "end")
    d.text(x0 - 38, (ytop + ybot) / 2, "leersnelheid", "l", "middle", extra="")
    pts = [(x0, ybot), (tw, ytop)]
    n = 60
    for i in range(1, n + 1):
        f = i / n
        lr = emin + 0.5 * (1 - emin) * (1 + math.cos(math.pi * f))
        pts.append((tw + f * (x1 - tw), ybot - lr * (ybot - ytop)))
    d.path("M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts))
    d.line(tw, ytop, tw, ybot, dashed=True, cls="d-grid")
    d.text(x0, ybot + 20, "0", "l", "middle")
    d.text(tw, ybot + 20, "T_{warmup}", "l", "middle")
    d.text(x1, ybot + 20, "T_{max}", "l", "middle")
    d.text((x0 + x1) / 2 + 20, ybot + 38, "trainingsstappen (of tokens)", "l", "middle")
    d.text(tw - 4, ytop - 14, "lineaire warmup", "l", "start")
    d.text(x0 + 0.5 * (x1 - x0) + 20, ytop + 52, "cosine decay", "s", "middle")
    d.text((x0 + x1) / 2, 276, "Warmup duurt in werkelijkheid slechts 1-2% van alle stappen (hier uitvergroot).", "l", "middle")
    return d


@diagram
def memory_16_bytes():
    d = Diagram("memory-16-bytes", 236)
    x0, unit = 30, 27.5
    segs = [("2 B", "BF16", 2, "info", "gewicht"), ("2 B", "BF16", 2, "warn", "gradiënt"), ("4 B", "FP32", 4, "good", "FP32-kopie"), ("4 B", "FP32", 4, "acc", "m"), ("4 B", "FP32", 4, "bad", "v")]
    y = 40
    d.text(x0, 22, "Training met AdamW in BF16: bytes per parameter", "t", "start")
    x = x0
    for lab, prec, n, kind, name in segs:
        w = n * unit
        d.raw(f'<rect class="d-box d-{kind}" x="{x:.1f}" y="{y}" width="{w:.1f}" height="44" rx="6"/>')
        d.text(x + w / 2, y + 20, lab, "t")
        d.text(x + w / 2, y + 36, prec, "l")
        d.text(x + w / 2, y + 62, name, "l")
        x += w
    d.brace(x0 + 4 * unit + 3, x0 + 16 * unit - 3, y + 72, "optimizer-toestand: 12 B (FP32-kopie + m + v)")
    d.brace(x0 + 3, x0 + 4 * unit - 3, y + 72, "4 B")
    y2 = 168
    d.text(x0, y2 - 8, "Inferentie van hetzelfde model (alleen gewichten in BF16):", "s", "start")
    d.raw(f'<rect class="d-box d-info" x="{x0}" y="{y2}" width="{2 * unit}" height="30" rx="6"/>')
    d.text(x0 + unit, y2 + 20, "2 B", "t")
    d.text(x0 + 2 * unit + 12, y2 + 20, "→ training vraagt 16 / 2 = 8× zoveel geheugen per parameter", "s", "start")
    return d


@diagram
def zero_stages():
    d = Diagram("zero-stages", 296)
    n = 8
    rows = [
        ("Klassiek DP", "elke GPU alles", 2, 2, 12),
        ("ZeRO-1", "optimizer verdeeld", 2, 2, 12 / n),
        ("ZeRO-2", "+ gradiënten", 2, 2 / n, 12 / n),
        ("ZeRO-3 / FSDP", "+ gewichten", 2 / n, 2 / n, 12 / n),
    ]
    d.text(20, 20, f"Bytes per parameter op één GPU (voorbeeld: N = {n} GPU's)", "t", "start")
    x0, unit = 146, 18
    for i, (name, sub, w_, g_, o_) in enumerate(rows):
        y = 40 + i * 54
        d.text(20, y + 16, name, "t", "start")
        d.text(20, y + 33, sub, "l", "start")
        x = x0
        for val, kind in ((w_, "info"), (g_, "warn"), (o_, "good")):
            w = val * unit
            d.raw(f'<rect class="d-box d-{kind}" x="{x:.1f}" y="{y}" width="{w:.1f}" height="34" rx="4"/>')
            x += w
        tot = w_ + g_ + o_
        d.text(x + 8, y + 22, f"{tot:g}".replace(".", ",") + " B", "t", "start")
    ly = 264
    for j, (kind, lab) in enumerate((("info", "gewichten 2 B"), ("warn", "gradiënten 2 B"), ("good", "optimizer-toestand 12 B"))):
        lx = 20 + [0, 128, 270][j]
        d.raw(f'<rect class="d-box d-{kind}" x="{lx}" y="{ly}" width="14" height="14" rx="3"/>')
        d.text(lx + 20, ly + 12, lab, "l", "start")
    return d


DOCS = {
    "transformer-decoder-architecture": "decoder-only transformer van tekst tot volgend token: tokenizer, embeddings, N lagen, LM-head, softmax",
    "transformer-block": "één transformerlaag: RMSNorm, self-attention, feed-forward en twee residual connections",
    "gqa-heads": "MHA, GQA en MQA: 8 query-heads en hoeveel KV-heads ze delen (KV-cache 100% / 25% / 12,5%)",
    "pytorch-training-loop": "de zes stappen van een PyTorch-trainingslus plus het geheugen per parameter (16 bytes)",
    "lr-schedule": "leersnelheid tijdens training: lineaire warmup en cosine decay",
    "memory-16-bytes": "16 bytes per parameter bij AdamW in BF16 (gewicht, gradiënt, FP32-kopie, m, v) tegenover 2 B bij inferentie",
    "zero-stages": "geheugen per GPU bij klassiek data parallelism en ZeRO-1/2/3 (voorbeeld met 8 GPU's)",
}


def catalog():
    """(name, one-line description) of every diagram, for the author prompt."""
    return [(n, DOCS.get(n, n)) for n in DIAGRAMS]


def main(names):
    todo = names or list(DIAGRAMS)
    for name in todo:
        d = DIAGRAMS[name]()
        path = d.save()
        print("✓", path.split("/assets/")[1], f"{d.w}×{d.h}")


if __name__ == "__main__":
    main(sys.argv[1:])
