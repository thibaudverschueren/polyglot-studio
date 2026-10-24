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



# ====================================================================== Routing
@diagram
def encapsulation():
    d = Diagram("encapsulation", 322)
    d.rect(8, 8, 504, 296, "", 14)
    d.text(22, 30, "Ethernet-frame · L2", "t", "start")
    x = 22
    for name, size, w in (("Preamble + SFD", "8 B", 120), ("Doel-MAC", "6 B", 92), ("Bron-MAC", "6 B", 92), ("EtherType", "2 B", 92)):
        d.box(x, 40, w, 42, [(name, "s"), (size, "l")], r=6)
        x += w + 6
    d.rect(24, 92, 472, 166, "info", 12)
    d.text(38, 112, "IP-pakket · L3", "t", "start")
    d.box(38, 120, 444, 50, [("IPv4-header · 20 B", "t"), ("bron-IP · bestemmings-IP · TTL · DF/MF · protocol", "s")], r=6)
    d.rect(38, 178, 444, 74, "acc", 10)
    d.text(52, 196, "TCP-segment · L4", "t", "start")
    d.box(52, 202, 160, 46, [("TCP-header · 20 B", "s"), ("poorten · seq/ack", "l")], r=6)
    d.box(220, 202, 248, 46, [("Applicatiedata", "s"), ("maximaal MSS = 1460 B", "l")], r=6)
    d.box(372, 268, 128, 28, [("FCS · 4 B", "s")], r=6)
    d.text(22, 288, "MTU 1500 B = maximale grootte van het IP-pakket", "l", "start")
    return d


@diagram
def hop_by_hop():
    d = Diagram("hop-by-hop", 352)
    nodes = [("Host A", "192.168.1.50", 6, ""), ("Router 1", "", 140, "info"), ("Router 2", "", 280, "info"), ("Server B", "10.0.0.100", 414, "")]
    for name, sub, x, kind in nodes:
        d.box(x, 10, 100, 54, [(name, "t"), (sub or " ", "l")], kind)
    for x1, x2 in ((108, 138), (248, 278), (388, 412)):
        d.arrow([(x1, 37), (x2, 37)])
    cards = [
        ("Frame 1", "Host A → Router 1", "AA:AA → R1a", 6, "64"),
        ("Frame 2", "Router 1 → Router 2", "R1b → R2a", 180, "63"),
        ("Frame 3", "Router 2 → Server B", "R2b → BB:BB", 354, "62"),
    ]
    for title, sub, macs, x, ttl in cards:
        d.rect(x, 84, 160, 206, "", 10)
        d.text(x + 80, 106, title, "t")
        d.text(x + 80, 124, sub, "s")
        d.box(x + 10, 136, 140, 50, [("MAC-adressen", "l"), (macs, "m")], "warn", r=8)
        d.box(x + 10, 196, 140, 66, [("IP-adressen", "l"), ("192.168.1.50", "m"), ("→ 10.0.0.100", "m")], "good", r=8)
        d.text(x + 80, 280, f"TTL {ttl}", "s")
    d.raw('<rect class="d-box d-warn" x="8" y="306" width="14" height="14" rx="3"/>')
    d.text(30, 318, "MAC verandert bij elke router-hop", "l", "start")
    d.raw('<rect class="d-box d-good" x="8" y="328" width="14" height="14" rx="3"/>')
    d.text(30, 340, "IP blijft gelijk van bron tot bestemming (zonder NAT)", "l", "start")
    return d


@diagram
def arp_exchange():
    d = Diagram("arp-exchange", 330)
    d.box(10, 8, 120, 50, [("Host A", "t"), ("192.168.1.50", "l")])
    d.box(200, 8, 120, 50, [("Andere hosts", "t"), ("op het LAN", "l")])
    d.box(390, 8, 120, 50, [("Router", "t"), ("192.168.1.1", "l")], "info")
    for x in (70, 260, 450):
        d.line(x, 60, x, 262, dashed=True, cls="d-grid")
    d.arrow([(72, 104), (446, 104)])
    d.text(260, 92, "ARP Request (broadcast): wie heeft 192.168.1.1?", "l", "middle")
    d.text(260, 124, "doel-MAC FF:FF:FF:FF:FF:FF", "m", "middle")
    d.text(260, 142, "andere hosts ontvangen het en negeren het", "l", "middle")
    d.arrow([(448, 190), (74, 190)])
    d.text(260, 178, "ARP Reply (unicast): 192.168.1.1 is op MAC R1:R1", "l", "middle")
    d.text(260, 210, "doel-MAC AA:AA", "m", "middle")
    d.box(10, 232, 250, 50, [("ARP-cache van Host A", "s"), ("192.168.1.1 → R1:R1", "m")], "info", r=8)
    d.text(260, 310, "ARP blijft binnen het subnet: een router geeft broadcasts nooit door.", "l", "middle")
    return d


@diagram
def pmtud_black_hole():
    d = Diagram("pmtud-black-hole", 362)
    d.box(10, 8, 120, 50, [("Client", "t"), ("MTU 1500", "l")])
    d.box(195, 8, 130, 50, [("Router", "t"), ("tunnel MTU 1420", "l")], "info")
    d.box(390, 8, 120, 50, [("Server", "t"), ("MTU 1500", "l")])
    for x in (70, 260, 450):
        d.line(x, 60, x, 300, dashed=True, cls="d-grid")
    d.arrow([(72, 98), (446, 98)])
    d.text(260, 86, "TCP-handshake (klein): slaagt", "l", "middle", extra="d-good-t")
    d.arrow([(72, 150), (256, 150)])
    d.text(165, 138, "data 1500 B, DF = 1", "l", "middle")
    d.cross(264, 150)
    d.text(278, 142, "te groot: gedropt", "l", "start", extra="d-bad-t")
    d.arrow([(256, 222), (188, 222)], dashed=True)
    d.text(194, 206, "ICMP type 3 code 4 (next MTU 1420)", "l", "start")
    d.box(96, 206, 88, 32, [("DROP ICMP", "l")], "bad", r=6)
    d.cross(190, 222, 5)
    d.text(70, 260, "firewall op de terugweg", "l", "start", extra="d-bad-t")
    d.box(10, 272, 370, 46, [("Client weet van niets", "s"), ("hertransmissies, daarna timeout: PMTUD black hole", "l")], "warn", r=8)
    d.text(260, 346, "Oplossing: TCP MSS clamping op de router (MSS in de SYN verlagen)", "l", "middle")
    return d


@diagram
def rib_fib():
    d = Diagram("rib-fib", 312)
    d.rect(8, 8, 504, 150, "info", 14)
    d.text(22, 30, "Control plane: het brein (CPU, software)", "t", "start")
    for x, name in ((22, "BGP"), (186, "OSPF"), (350, "Statisch")):
        d.box(x, 42, 148, 32, [(name, "t")], r=6)
        d.arrow([(x + 74, 74), (x + 74, 96)])
    d.box(22, 98, 476, 44, [("RIB: alle geleerde routes", "t"), ("kiest per prefix de laagste AD, daarna de laagste metriek", "s")], r=8)
    d.arrow([(260, 142), (260, 188)])
    d.text(272, 172, "beste route per prefix", "l", "start")
    d.rect(8, 168, 504, 136, "good", 14) if False else None
    d.rect(8, 192, 504, 112, "good", 14)
    d.text(22, 214, "Data plane: de spieren (ASIC / TCAM)", "t", "start")
    d.box(150, 226, 220, 62, [("FIB: alleen de beste routes", "s"), ("opgezocht in hardware", "l")], r=8)
    d.arrow([(20, 257), (148, 257)], label="pakket in", label_at=(84, 247), anchor="middle")
    d.arrow([(372, 257), (500, 257)], label="pakket uit", label_at=(436, 247), anchor="middle")
    return d


@diagram
def ospf_states():
    d = Diagram("ospf-states", 394)
    states = [
        ("Down", "nog geen Hello van de buur ontvangen", ""),
        ("Init", "Hello ontvangen, maar mijn Router ID staat er niet in", ""),
        ("2-Way", "wederzijds gezien; DR/BDR-verkiezing; DROthers stoppen hier", "info"),
        ("ExStart", "master/slave en startvolgnummer afspreken (lege DBD's)", ""),
        ("Exchange", "DBD-pakketten: samenvatting van alle LSA's", ""),
        ("Loading", "ontbrekende LSA's opvragen (LSR) en ontvangen (LSU)", ""),
        ("Full", "databases synchroon: adjacency compleet", "good"),
    ]
    for i, (name, desc, kind) in enumerate(states):
        y = 8 + i * 52
        d.box(12, y, 112, 34, [(name, "t")], kind, r=8)
        d.text(138, y + 22, desc, "s", "start")
        if i < len(states) - 1:
            d.arrow([(68, y + 34), (68, y + 52)])
    d.text(260, 386, "Bij een MTU-mismatch blijft de adjacency hangen in ExStart of Exchange.", "l", "middle", extra="d-bad-t")
    return d


@diagram
def bgp_as_path():
    d = Diagram("bgp-as-path", 372)
    rows = [("AS 15169", "Google (oorsprong 8.8.8.0/24)", "bron: het pad is nog leeg"), ("AS 3356", "Lumen Transit", "ontvangt: 15169"),
            ("AS 2611", "Belnet Onderwijs", "ontvangt: 3356 15169"), ("AS 64500", "jouw campusrouter", "ontvangt: 2611 3356 15169")]
    for i, (name, sub, path) in enumerate(rows):
        y = 8 + i * 74
        d.box(12, y, 230, 46, [(name, "t"), (sub, "l")], "info" if i in (0, 3) else "", r=8)
        d.text(264, y + 20, "AS_PATH", "l", "start")
        d.text(264, y + 38, path, "m", "start")
        if i < len(rows) - 1:
            d.arrow([(127, y + 46), (127, y + 74)])
            d.text(140, y + 64, "voegt zijn eigen AS-nummer vooraan toe", "l", "start")
    d.text(260, 322, "Ziet een AS zijn eigen nummer al in het pad, dan negeert hij de route:", "l", "middle")
    d.text(260, 340, "zo ontstaan er geen lussen (path vector).", "l", "middle")
    return d


@diagram
def nat_pat():
    d = Diagram("nat-pat", 380)
    d.box(20, 8, 230, 46, [("PC 1", "t"), ("192.168.1.25 : 54321", "m")])
    d.box(270, 8, 230, 46, [("PC 2", "t"), ("192.168.1.30 : 54321", "m")])
    d.arrow([(135, 54), (135, 104)])
    d.arrow([(385, 54), (385, 104)])
    d.rect(20, 104, 480, 132, "acc", 12)
    d.text(260, 128, "Router · PAT · publiek IP 203.0.113.7", "t", "middle")
    d.text(40, 156, "intern", "l", "start")
    d.text(270, 156, "extern", "l", "start")
    d.text(40, 180, "192.168.1.25:54321", "m", "start")
    d.text(200, 180, "→", "t", "middle")
    d.text(270, 180, "203.0.113.7:40001", "m", "start")
    d.text(40, 206, "192.168.1.30:54321", "m", "start")
    d.text(200, 206, "→", "t", "middle")
    d.text(270, 206, "203.0.113.7:40002", "m", "start")
    d.arrow([(260, 236), (260, 282)])
    d.text(274, 266, "bron: 203.0.113.7:40001 of :40002", "l", "start")
    d.box(140, 284, 240, 46, [("Internetserver", "t"), ("142.250.179.206 : 443", "m")])
    d.text(260, 352, "Antwoorden komen terug op poort 40001 of 40002; de router vertaalt ze", "l", "middle")
    d.text(260, 370, "via de conntrack-tabel terug naar de juiste PC.", "l", "middle")
    return d



@diagram
def mss_clamping():
    d = Diagram("mss-clamping", 282)
    d.box(10, 8, 120, 50, [("Client", "t"), ("MTU 1500", "l")])
    d.box(185, 8, 150, 50, [("Router", "t"), ("tunnel MTU 1420", "l")], "info")
    d.box(390, 8, 120, 50, [("Server", "t"), ("MTU 1500", "l")])
    for x in (70, 260, 450):
        d.line(x, 60, x, 232, dashed=True, cls="d-grid")
    d.arrow([(72, 96), (256, 96)])
    d.text(164, 84, "SYN · MSS = 1460", "l", "middle")
    d.arrow([(264, 96), (446, 96)])
    d.text(356, 84, "SYN · MSS = 1380", "l", "middle", extra="d-good-t")
    d.text(260, 118, "de router herschrijft de MSS (1420 − 40)", "l", "middle", extra="d-good-t")
    d.arrow([(446, 168), (74, 168)])
    d.text(260, 156, "data: 1380 B payload + 40 B headers = 1420 B", "l", "middle")
    d.text(260, 190, "past door de tunnel: geen fragmentatie, geen ICMP nodig", "l", "middle", extra="d-good-t")
    d.box(10, 216, 500, 54, [("Zo hoeft PMTUD niet meer te werken", "s"), ("de server houdt zich aan de MSS uit de SYN van de client", "l")], "good", r=8)
    return d


@diagram
def bgp_fsm():
    d = Diagram("bgp-fsm", 418)
    main = [("Idle", ""), ("Connect", ""), ("OpenSent", ""), ("OpenConfirm", ""), ("Established", "good")]
    ys = [12, 90, 168, 246, 324]
    for (name, kind), y in zip(main, ys):
        d.box(14, y, 150, 38, [(name, "t")], kind, r=8)
    labels = ["Start / ConnectRetry", "TCP Ok", "OPEN Ok", "KEEPALIVE Ok"]
    for i, lab in enumerate(labels):
        d.arrow([(89, ys[i] + 38), (89, ys[i + 1])])
        d.text(102, ys[i] + 62, lab, "l", "start")
    d.box(330, 90, 160, 38, [("Active", "t")], "warn", r=8)
    d.arrow([(166, 109), (328, 109)])
    d.text(247, 100, "TCP faalt", "l", "middle")
    d.arrow([(410, 128), (410, 187), (166, 187)])
    d.text(300, 178, "TCP lukt alsnog", "l", "middle")
    d.arrow([(410, 90), (410, 31), (166, 31)])
    d.text(300, 22, "fout / timeout", "l", "middle")
    d.text(260, 392, "Een sessie die in Active blijft hangen (of heen en weer springt tussen", "l", "middle")
    d.text(260, 408, "Connect en Active) bouwt zijn TCP-verbinding op poort 179 niet op.", "l", "middle")
    return d


@diagram
def double_nat():
    d = Diagram("double-nat", 366)
    rows = [("Spelconsole", "192.168.0.50", ""), ("Eigen router", "WAN-kant: 192.168.1.100", "info"),
            ("ISP-modem-router", "WAN-kant: 203.0.113.88", "info"), ("Internet", "publiek IP-adres", "")]
    for i, (name, sub, kind) in enumerate(rows):
        y = 8 + i * 74
        d.box(14, y, 250, 46, [(name, "t"), (sub, "m")], kind, r=8)
        if i < 3:
            d.arrow([(139, y + 46), (139, y + 74)])
            d.text(152, y + 64, f"NAT {i + 1}: bron-IP wordt herschreven" if i < 2 else "naar het internet", "l", "start")
    d.text(290, 28, "intern netwerk", "l", "start")
    d.text(290, 102, "eerste vertaling", "l", "start")
    d.text(290, 176, "tweede vertaling", "l", "start")
    d.box(14, 308, 492, 46, [("Poortforwarding op de eigen router helpt niet van buitenaf", "s"), ("de ISP-modem kent de console niet en gooit het verkeer weg", "l")], "bad", r=8)
    return d



# ====================================================================== Solidity, n8n, Jev, languages
@diagram
def data_locations():
    d = Diagram("data-locations", 366)
    rows = [
        ("storage", "permanent", "warn", "De harde schijf van de blockchain", "blijft bestaan na de transactie · lezen en schrijven", "duur: ± 22 100 gas voor een eerste schrijfactie"),
        ("memory", "tijdelijk", "info", "Werkgeheugen van één aanroep", "start leeg, gewist na de transactie · lezen en schrijven", "relatief goedkoop"),
        ("calldata", "invoer", "good", "De invoer van een externe functie", "alleen tijdens de aanroep · alleen lezen", "goedkoopst: er wordt niets gekopieerd"),
    ]
    for i, (name, tag, kind, l1, l2, l3) in enumerate(rows):
        y = 8 + i * 92
        d.box(10, y, 118, 80, [(name, "t"), (tag, "l")], kind, r=10)
        d.text(142, y + 24, l1, "s", "start")
        d.text(142, y + 46, l2, "l", "start")
        d.text(142, y + 66, l3, "l", "start")
    d.box(10, 288, 500, 66, [("stack", "t"), ("value types (uint256, bool, address): één EVM-woord van 32 bytes", "s")], "", r=10)
    return d


@diagram
def mapping_slot():
    d = Diagram("mapping-slot", 292)
    for x, code, hasj, val, lab in ((10, "balances[alice] = 100;", "keccak256(alice · 0)", "100", "slot A"), (280, "balances[bob] = 50;", "keccak256(bob · 0)", "50", "slot B")):
        d.box(x, 8, 230, 34, [(code, "m")], r=8)
        d.arrow([(x + 115, 42), (x + 115, 84)])
        d.text(x + 126, 68, hasj, "l", "start")
        d.box(x, 86, 230, 52, [(lab, "t"), (val, "m")], "warn", r=8)
    d.raw('<rect class="d-box d-plain" x="10" y="166" width="500" height="44" rx="10"/>')
    d.text(260, 194, "slot 0 (declaratie van balances) blijft leeg", "s", "middle")
    d.text(260, 238, "De EVM houdt nergens bij welke slots gevuld zijn:", "l", "middle")
    d.text(260, 256, "een mapping heeft geen lengte en je kunt er niet over itereren.", "l", "middle")
    return d


@diagram
def ttd_timeline():
    d = Diagram("ttd-timeline", 300)
    x0, k = 20, 0.1257          # 3 500 ms over 440 px
    def px(ms):
        return ms * k
    d.text(x0, 22, "Generatief model (autoregressief)", "t", "start")
    d.raw(f'<rect class="d-box d-info" x="{x0}" y="32" width="{px(500):.1f}" height="30" rx="4"/>')
    d.raw(f'<rect class="d-box d-warn" x="{x0 + px(500):.1f}" y="32" width="{px(3000):.1f}" height="30" rx="4"/>')
    d.text(x0 + px(500) / 2, 52, "TTFT", "l")
    d.text(x0 + px(500) + px(3000) / 2, 52, "150 tokens × 20 ms = 3 000 ms", "s")
    d.text(x0, 84, "TTD = TTFT + N_{out} × TPOT = 500 + 150 × 20 = 3 500 ms", "s", "start", extra="d-bad-t")
    d.text(x0, 130, "Beslissingsmodel (non-autoregressief)", "t", "start")
    d.raw(f'<rect class="d-box d-good" x="{x0}" y="140" width="5" height="30" rx="2"/>')
    d.text(x0 + 14, 156, "één forward pass, geen output-tokens", "s", "start", extra="d-good-t")
    d.text(x0 + 14, 174, "lokaal 15-25 ms · via cloud-API 50-150 ms", "l", "start", extra="d-good-t")
    d.line(x0, 220, x0 + px(3500), 220, cls="d-grid")
    for ms in (0, 1000, 2000, 3000):
        d.line(x0 + px(ms), 216, x0 + px(ms), 224, cls="d-grid")
        d.text(x0 + px(ms), 240, f"{ms:,}".replace(",", " ") + " ms", "l")
    tx = x0 + px(3000)
    d.line(tx, 26, tx, 218, dashed=True, cls="d-line")
    d.text(tx - 6, 102, "webhook-timeout", "l", "end")
    d.text(tx - 6, 116, "3 000 ms", "l", "end")
    d.text(260, 280, "Na de timeout krijgt de aanroeper een 504 Gateway Timeout.", "l", "middle")
    return d


@diagram
def n8n_items():
    d = Diagram("n8n-items", 332)
    d.text(260, 18, "3 items komen binnen", "t")
    cards_in = [("Anna", "120"), ("Bram", "80"), ("Chloé", "200")]
    for i, (n, b) in enumerate(cards_in):
        x = 10 + i * 172
        d.box(x, 28, 156, 78, [(f"item {i}", "l"), (f"naam: {n}", "m"), (f"bedrag: {b}", "m")], r=8)
        d.arrow([(x + 78, 106), (x + 78, 150)])
    d.box(60, 152, 400, 52, [("Edit Fields-node", "t"), ("draait drie keer: één keer per item", "s")], "acc", r=10)
    d.text(260, 232, "3 items verlaten de node", "t")
    for i, (n, b) in enumerate(cards_in):
        x = 10 + i * 172
        btw = f"{int(b) * 0.21:.2f}".replace(".", ",")
        d.arrow([(x + 78, 204), (x + 78, 244)])
        d.box(x, 246, 156, 78, [(f"naam: {n}", "m"), (f"bedrag: {b}", "m"), (f"btw: {btw}", "m")], "good", r=8)
    return d


@diagram
def batch_loop():
    d = Diagram("batch-loop", 342)
    d.box(30, 8, 230, 46, [("Trigger", "t"), ("50 000 items", "l")])
    d.arrow([(145, 54), (145, 86)])
    d.box(30, 88, 230, 56, [("Loop Over Items", "t"), ("batchgrootte 50", "l")], "info", r=10)
    d.arrow([(145, 144), (145, 190)])
    d.text(157, 172, "loop", "l", "start")
    d.box(30, 192, 230, 52, [("HTTP Request", "t"), ("50 items per ronde", "l")], "acc", r=10)
    d.arrow([(145, 244), (145, 272)])
    d.box(30, 274, 230, 40, [("Wait", "t")], "", r=10)
    d.arrow([(262, 294), (300, 294), (300, 124), (262, 124)])
    d.text(312, 214, "volgende", "l", "start")
    d.text(312, 230, "batch", "l", "start")
    d.arrow([(262, 104), (330, 104)])
    d.text(296, 96, "done", "l", "middle")
    d.box(332, 80, 170, 48, [("Verder met de rest", "s"), ("alle batches klaar", "l")], "good", r=10)
    return d


@diagram
def stress_rules():
    d = Diagram("stress-rules", 300)
    d.box(240, 8, 260, 44, [("Heeft het woord een tilde (´)?", "s")], "info", r=10)
    d.box(10, 6, 200, 48, [("Klemtoon op de tilde", "s"), ("can-CIÓN · ÁR-bol", "m")], "good", r=10)
    d.arrow([(238, 30), (212, 30)])
    d.text(225, 22, "ja", "l")
    d.arrow([(370, 52), (370, 100)])
    d.text(382, 82, "nee", "l", "start")
    d.box(240, 102, 260, 56, [("Eindigt het woord op een", "s"), ("klinker, -n of -s?", "s")], "info", r=10)
    d.box(10, 102, 200, 56, [("Voorlaatste lettergreep", "s"), ("HA-blan · CA-sa", "m")], "good", r=10)
    d.arrow([(238, 130), (212, 130)])
    d.text(225, 122, "ja", "l")
    d.arrow([(370, 158), (370, 206)])
    d.text(382, 188, "nee", "l", "start")
    d.box(240, 208, 260, 56, [("Laatste lettergreep", "s"), ("ha-BLAR · ciu-DAD", "m")], "warn", r=10)
    d.text(260, 288, "Een tilde gaat altijd voor: zij overrulet de twee andere regels.", "l", "middle")
    return d


@diagram
def accord_pp():
    d = Diagram("accord-pp", 352)
    d.box(240, 8, 260, 52, [("Essentieel pronominaal?", "s"), ("se souvenir, s'évanouir, se moquer", "l")], "info", r=10)
    d.box(10, 8, 200, 52, [("Accord met het onderwerp", "s"), ("elle s'est évanouie", "m")], "good", r=10)
    d.arrow([(238, 34), (212, 34)])
    d.text(225, 26, "ja", "l")
    d.arrow([(370, 60), (370, 112)])
    d.text(382, 92, "nee", "l", "start")
    d.box(240, 114, 260, 64, [("Staat het COD vóór het participe?", "s"), ("vraag: wie of wat?  se is COD bij", "l"), ("se laver, maar COI bij se parler", "l")], "info", r=10)
    d.box(10, 114, 200, 64, [("Accord met dat COD", "s"), ("elles se sont lavées", "m")], "good", r=10)
    d.arrow([(238, 146), (212, 146)])
    d.text(225, 138, "ja", "l")
    d.arrow([(370, 178), (370, 230)])
    d.text(382, 210, "nee", "l", "start")
    d.box(240, 232, 260, 66, [("Invariable", "s"), ("elle s'est lavé les mains", "m"), ("elles se sont parlé", "m")], "warn", r=10)
    d.text(260, 326, "Uitzondering uit de les: se rendre compte is invariable,", "l", "middle")
    d.text(260, 344, "want compte staat als COD ná het participe.", "l", "middle")
    return d


DOCS = {
    "data-locations": "de datalocaties van de EVM: storage, memory, calldata en de stack, met levensduur en kost",
    "mapping-slot": "een mapping bewaart waarde 100 niet in het declaratieslot maar op keccak256(sleutel · slot)",
    "ttd-timeline": "Time to Decision: autoregressief model (TTFT + tokens × TPOT = 3 500 ms) tegenover één forward pass van een beslissingsmodel",
    "n8n-items": "n8n-itemmodel: 3 items gaan een node in, de node draait per item en geeft 3 items terug",
    "batch-loop": "Loop Over Items: 50 000 items in batches van 50, met Wait voor rate limits en een done-tak",
    "stress-rules": "Spaans: beslisboom voor de klemtoon (tilde, klinker/-n/-s, andere medeklinker)",
    "accord-pp": "Frans: beslisboom voor de accord van het participe passé bij pronominale werkwoorden",
    "mss-clamping": "TCP MSS clamping: de router herschrijft de MSS in de SYN zodat pakketten door een tunnel met MTU 1420 passen",
    "bgp-fsm": "BGP-sessietoestanden: Idle, Connect, Active, OpenSent, OpenConfirm en Established",
    "double-nat": "double NAT: console achter eigen router achter ISP-modem, met twee vertalingen",
    "encapsulation": "ingepakte lagen: Ethernet-frame ⊃ IPv4-pakket ⊃ TCP-segment ⊃ applicatiedata, met headergroottes en MTU/MSS",
    "hop-by-hop": "pakket van Host A via twee routers naar Server B: MAC-adressen veranderen per hop, IP-adressen blijven gelijk",
    "arp-exchange": "ARP Request (broadcast) en ARP Reply (unicast) tussen een host en zijn default gateway",
    "pmtud-black-hole": "PMTUD black hole: groot pakket met DF=1 wordt gedropt en de ICMP-melding wordt door een firewall geblokkeerd",
    "rib-fib": "control plane (RIB, protocollen) tegenover data plane (FIB in ASIC/TCAM)",
    "ospf-states": "de zeven OSPF-adjacencytoestanden van Down tot Full",
    "bgp-as-path": "AS_PATH groeit per AS (voorbeeld Google, Lumen, Belnet, campus): path vector en lusvermijding",
    "nat-pat": "PAT: twee interne PC's met dezelfde bronpoort delen één publiek IP via verschillende externe poorten",
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
