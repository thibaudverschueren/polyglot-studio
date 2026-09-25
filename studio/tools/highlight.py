"""highlight.py — tiny regex tokenizer for code blocks (Solidity, Python, JS, JSON, shell)."""
import html
import re

SOL_KW = set("""pragma solidity import contract interface library abstract is function modifier event error struct enum mapping
returns return if else for while do break continue emit revert require assert new delete try catch using constructor receive
fallback public private internal external view pure payable memory storage calldata constant immutable override virtual unchecked
assembly indexed anonymous let switch case default this super type""".split())
SOL_TY = re.compile(r"^(u?int\d*|address|bool|string|bytes\d*|fixed|ufixed|var)$")
SOL_BI = set("msg block tx abi keccak256 sha256 ecrecover gasleft selfdestruct addmod mulmod blockhash wei gwei ether seconds minutes hours days weeks true false".split())
PY_KW = set("""def return if elif else for while in not and or import from as class with try except finally raise lambda yield
pass break continue global nonlocal assert del is None True False async await""".split())
PY_BI = set("print len range int float str list dict set tuple sum max min abs round enumerate zip map filter sorted np torch math".split())
JS_KW = set("""const let var function return if else for while do break continue new class extends import export from default async await
try catch finally throw typeof instanceof in of switch case this null undefined true false""".split())

TOKEN = re.compile(
    r"(?P<com>//[^\n]*|/\*[\s\S]*?\*/|#[^\n]*)"
    r"|(?P<str>\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*')"
    r"|(?P<num>\b0x[0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b)"
    r"|(?P<id>[A-Za-z_$][\w$]*)"
    r"|(?P<ws>\s+)"
    r"|(?P<op>.)"
)


def highlight(code, lang="text"):
    lang = (lang or "text").lower()
    if lang in ("text", "plain", "txt", "", "output"):
        return html.escape(code, quote=False)
    kw = SOL_KW if lang in ("solidity", "sol", "yul") else PY_KW if lang in ("python", "py") else JS_KW
    bi = SOL_BI if lang in ("solidity", "sol", "yul") else PY_BI if lang in ("python", "py") else set()
    hash_comments = lang in ("python", "py", "bash", "sh", "shell")
    out = []
    toks = list(TOKEN.finditer(code))
    for k, m in enumerate(toks):
        kind, val = m.lastgroup, m.group(0)
        esc = html.escape(val, quote=False)
        if kind == "com":
            if val.startswith("#") and not hash_comments:
                out.append(esc)
            else:
                out.append(f'<span class="tok-com">{esc}</span>')
        elif kind == "str":
            out.append(f'<span class="tok-str">{esc}</span>')
        elif kind == "num":
            out.append(f'<span class="tok-num">{esc}</span>')
        elif kind == "id":
            nxt = ""
            for j in range(k + 1, len(toks)):
                if toks[j].lastgroup != "ws":
                    nxt = toks[j].group(0)
                    break
            if val in kw:
                out.append(f'<span class="tok-kw">{esc}</span>')
            elif lang in ("solidity", "sol") and SOL_TY.match(val):
                out.append(f'<span class="tok-ty">{esc}</span>')
            elif val in bi:
                out.append(f'<span class="tok-bi">{esc}</span>')
            elif nxt == "(":
                out.append(f'<span class="tok-fn">{esc}</span>')
            elif val[:1].isupper():
                out.append(f'<span class="tok-ty">{esc}</span>')
            else:
                out.append(esc)
        else:
            out.append(esc)
    return "".join(out)
