#!/usr/bin/env python3
"""Validate authored data and emit data.json for the game.

words_*.tsv  -> WORDS  [hanzi, pinyin, meaning, level, syllables[[syl,tone]...], unlockNote]
sentences    -> SENTS  {w:[wordId|-1], z:[hanzi], p:[pinyin], en}
notes.json   -> NOTES  (+ AI-term words linked by id)
"""
import json, re, sys, unicodedata
from pathlib import Path

D = Path(__file__).parent / "data"
errors = []

# ---------- pinyin syllable segmentation ----------
INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h",
            "j", "q", "x", "r", "z", "c", "s", "y", "w", ""]
FINALS = ["iang", "iong", "uang", "ueng", "ang", "eng", "ing", "ong", "iao", "ian", "uai", "uan",
          "ai", "ei", "ao", "ou", "an", "en", "er", "ia", "ie", "iu", "in", "ua", "uo", "ui", "un",
          "ue", "ve", "a", "o", "e", "i", "u", "v"]
VALID = set()
for i in INITIALS:
    for f in FINALS:
        VALID.add(i + f)
        VALID.add(i + f + "r")  # erhua
VALID.discard("r")

TONE_CHARS = {}
for base, marks in {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "v": "ǖǘǚǜ"}.items():
    for t, ch in enumerate(marks, 1):
        TONE_CHARS[ch] = (base, t)


def strip(s):
    """tone-marked -> (plain with v for ü, tone)"""
    out, tone = [], 5
    for ch in s:
        if ch in TONE_CHARS:
            b, t = TONE_CHARS[ch]
            out.append(b)
            tone = t
        elif ch == "ü":
            out.append("v")
        else:
            out.append(ch)
    return "".join(out), tone


def seg_piece(piece):
    """segment one space-free pinyin chunk into syllables (keeps original marks)."""
    plain, _ = strip(piece.lower())
    n = len(plain)
    # memoized DFS, longest first
    memo = {}

    def go(i, after_apos):
        if i == n:
            return []
        key = (i, after_apos)
        if key in memo:
            return memo[key]
        res = None
        for j in range(min(n, i + 7), i, -1):
            s = plain[i:j]
            if s not in VALID:
                continue
            if i > 0 and not after_apos and s[0] in "aoe":
                continue
            rest = go(j, False)
            if rest is not None:
                res = [(i, j)] + rest
                break
        memo[key] = res
        return res

    # handle apostrophes by splitting first
    parts = piece.split("'")
    out = []
    for k, part in enumerate(parts):
        pl, _ = strip(part.lower())
        n = len(pl)
        plain = pl
        memo.clear()
        spans = go(0, True)
        if spans is None:
            return None
        for a, b in spans:
            syl = part[a:b]
            out.append([syl, strip(syl)[1]])
    return out


def syllables(pinyin):
    out = []
    for chunk in re.split(r"[ \-]+", pinyin.strip()):
        if not chunk:
            continue
        s = seg_piece(chunk)
        if s is None:
            return None
        out.extend(s)
    return out


def is_han(c):
    return "一" <= c <= "鿿"


# ---------- words ----------
# IDs are locked in data/ids.lock.json (key "hanzi|pinyin"): saved progress is keyed by word ID,
# so existing words never change ID and new words are appended. Learning order is a separate field "o".
LOCK_PATH = D / "ids.lock.json"
lock = json.loads(LOCK_PATH.read_text(encoding="utf-8")) if LOCK_PATH.exists() else {}
entries = []          # dicts with h, p, m, l, s, u, o
seen_keys = set()


def add_entry(hz, py, mean, lv, where, order=None, note=None):
    key = (hz, py.replace(" ", "").lower())
    if key in seen_keys:
        errors.append(f"{where} duplicate {hz} {py}")
        return None
    syl = syllables(py)
    if syl is None:
        errors.append(f"{where} cannot segment pinyin {py!r} for {hz}")
        return None
    nhan = sum(1 for c in hz if is_han(c))
    erhua = hz.endswith("儿") and syl[-1][0].lower().endswith("r") and nhan == len(syl) + 1
    if nhan != len(syl) and not erhua:
        errors.append(f"{where} {hz} has {nhan} chars but {len(syl)} syllables {syl}")
    seen_keys.add(key)
    e = {"h": hz, "p": py, "m": mean, "l": lv, "s": syl, "u": note, "o": order}
    entries.append(e)
    return e


seq = 0
for fn in ["words_1.tsv", "words_2.tsv", "words_3.tsv", "words_4.tsv"]:
    for ln, line in enumerate((D / fn).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 4:
            errors.append(f"{fn}:{ln} bad columns: {line!r}")
            continue
        hz, py, mean, lv = [p.strip() for p in parts]
        add_entry(hz, py, mean, int(lv), f"{fn}:{ln}", order=float(seq))
        seq += 1

# extra words placed into the learning order with an anchor: 5th column "after:<hanzi>"
if (D / "words_extra.tsv").exists():
    bump = {}
    for ln, line in enumerate((D / "words_extra.tsv").read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("\t")]
        if len(parts) != 5 or not parts[4].startswith("after:"):
            errors.append(f"words_extra.tsv:{ln} needs 5 columns ending in after:<hanzi>")
            continue
        hz, py, mean, lv, anc = parts
        anchor = next((e for e in entries if e["h"] == anc[6:] and e["o"] is not None), None)
        if not anchor:
            errors.append(f"words_extra.tsv:{ln} unknown anchor {anc}")
            continue
        k = bump.get(anchor["h"], 0) + 1
        bump[anchor["h"]] = k
        add_entry(hz, py, mean, int(lv), f"words_extra.tsv:{ln}", order=anchor["o"] + 0.01 * k)

# ---------- spoken Chinese: chat words (reactions, particles, fillers, slang, function words) ----------
# spoken.tsv: hanzi, pinyin, meaning, kind, level, usage note. pinyin '-' = existing word (keeps its data).
# New spoken words get level SPOKEN_LV and sit at the end of the core order: they arrive through the
# "chat words" stream in the game (a few per epoch), in the order of this file.
SPOKEN_LV = 7
SPOKEN_KINDS = {"react", "particle", "func", "filler", "spoken", "slang", "vulgar"}
spoken_rows = []      # (entry, kind, note, is_new)
if (D / "spoken.tsv").exists():
    seen_sp = set()
    for ln, line in enumerate((D / "spoken.tsv").read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("\t")]
        if len(parts) != 6:
            errors.append(f"spoken.tsv:{ln} needs 6 tab-separated columns: {line!r}")
            continue
        hz, py, mean, kind, lv, note = parts
        if kind not in SPOKEN_KINDS:
            errors.append(f"spoken.tsv:{ln} unknown kind {kind!r}")
            continue
        if hz in seen_sp:
            errors.append(f"spoken.tsv:{ln} duplicate {hz}")
            continue
        seen_sp.add(hz)
        if py == "-":
            ex = [e for e in entries if e["h"] == hz and e["o"] is not None]
            if not ex:
                errors.append(f"spoken.tsv:{ln} {hz} is marked as existing ('-') but is not in words_*.tsv")
                continue
            spoken_rows.append((min(ex, key=lambda e: e["o"]), kind, note, False))
        else:
            if any(e["h"] == hz and e["l"] > 0 for e in entries):
                errors.append(f"spoken.tsv:{ln} {hz} already exists: use '-' in the pinyin column")
                continue
            e = add_entry(hz, py, mean, SPOKEN_LV, f"spoken.tsv:{ln}", order=5000.0 + len(spoken_rows))
            if e:
                spoken_rows.append((e, kind, note, True))

by_hanzi_e = {}
for e in entries:
    by_hanzi_e.setdefault(e["h"], []).append(e)

# ---------- notes + AI terms ----------
notes = json.loads((D / "notes.json").read_text(encoding="utf-8"))
for n in notes:
    for hz, py, mean in n["terms"]:
        if hz in by_hanzi_e:
            continue
        e = add_entry(hz, py, mean + " (AI term)", 0, f"note {n['id']}", note=n["id"])
        if e:
            by_hanzi_e.setdefault(hz, []).append(e)

# ---------- assign locked IDs ----------
next_id = max(lock.values(), default=-1) + 1
for e in entries:
    k = e["h"] + "|" + e["p"]
    if k not in lock:
        lock[k] = next_id
        next_id += 1
    e["id"] = lock[k]
words = [None] * next_id
for e in entries:
    words[e["id"]] = e
missing = [k for k, i in lock.items() if words[i] is None]
if missing:
    print(f"note: {len(missing)} locked words no longer in the data (kept as gaps): {missing[:5]}")
LOCK_PATH.write_text(json.dumps(lock, ensure_ascii=False, indent=0), encoding="utf-8")

by_hanzi = {}
for e in sorted(entries, key=lambda e: (e["o"] if e["o"] is not None else 1e9, e["id"])):
    by_hanzi.setdefault(e["h"], []).append(e["id"])
for n in notes:
    n["termIds"] = [by_hanzi[hz][0] for hz, _, _ in n["terms"] if hz in by_hanzi]

# ---------- sentences ----------
PUNCT = set("，。？！、：；…")


def sandhi(tokens_syl):
    """apply 不 / 一 tone sandhi on standalone tokens. tokens_syl: list of (hanzi, [[syl,tone]])"""
    out = [list(map(list, s)) if s else s for _, s in tokens_syl]
    for i, (hz, s) in enumerate(tokens_syl):
        if hz not in ("不", "一") or not s:
            continue
        nxt = None
        for j in range(i + 1, len(tokens_syl)):
            if tokens_syl[j][1]:
                nxt = tokens_syl[j][1][0][1]
            break
        if nxt is None:
            continue
        if hz == "不" and nxt == 4:
            out[i] = [["bú", 2]]
        if hz == "一":
            prev = tokens_syl[i - 1][0] if i > 0 else ""
            if prev in ("第",) or (prev and all(c in "一二三四五六七八九十百千万" for c in prev)):
                continue
            if nxt == 4 or nxt == 5:
                out[i] = [["yí", 2]]
            elif nxt in (1, 2, 3):
                out[i] = [["yì", 4]]
    return out


sents = []
sent_lines = []
for fn in sorted(D.glob("sentences*.txt"), key=lambda p: (p.stem != "sentences", p.stem)):
    for ln, line in enumerate(fn.read_text(encoding="utf-8").splitlines(), 1):
        sent_lines.append((f"{fn.name}:{ln}", line))
seen_sent = set()
for ln, line in sent_lines:
    if not line.strip() or line.startswith("#"):
        continue
    if "|" not in line:
        errors.append(f"{ln} no |")
        continue
    zh, en = line.split("|", 1)
    toks = zh.split()
    ids, hz, tsyl = [], [], []
    ok = True
    for t in toks:
        if t in PUNCT:
            ids.append(-1); hz.append(t); tsyl.append((t, None))
            continue
        want = None
        if ":" in t:
            t, want = t.split(":", 1)
        cands = by_hanzi.get(t, [])
        if want:
            cands = [c for c in cands if words[c]["p"].replace(" ", "").lower() == want.lower()]
        if not cands:
            errors.append(f"{ln} unknown token {t}{':' + want if want else ''} in: {zh.strip()}")
            ok = False
            continue
        wid = cands[0]
        ids.append(wid); hz.append(t); tsyl.append((t, words[wid]["s"]))
    if not ok:
        continue
    key = "".join(hz)
    if key in seen_sent:
        errors.append(f"{ln} duplicate sentence {key}")
        continue
    seen_sent.add(key)
    syl = sandhi(tsyl)
    sents.append({"w": ids, "z": hz, "s": syl, "en": en.strip()})

# ---------- token parser shared by dialogues and particle items ----------
def parse_tokens(zh, where):
    ids, hz, tsyl = [], [], []
    ok = True
    for t in zh.split():
        if t in PUNCT:
            ids.append(-1); hz.append(t); tsyl.append((t, None))
            continue
        want = None
        if ":" in t:
            t, want = t.split(":", 1)
        cands = by_hanzi.get(t, [])
        if want:
            cands = [c for c in cands if words[c]["p"].replace(" ", "").lower() == want.lower()]
        if not cands:
            errors.append(f"{where} unknown token {t}{':' + want if want else ''} in: {zh.strip()}")
            ok = False
            continue
        ids.append(cands[0]); hz.append(t); tsyl.append((t, words[cands[0]]["s"]))
    if not ok:
        return None
    return ids, hz, sandhi(tsyl)


# ---------- dialogues (chat cards) ----------
DLG_CATS = {"greet", "bye", "thanks", "sorry", "request", "invite", "agree", "yesno", "info", "news",
            "complain", "comfort", "praise", "opinion", "food", "plan", "react"}
dlgs = []
if (D / "dialogues.txt").exists():
    seen_dlg = set()
    cur = None

    def flush_dlg():
        if not cur or cur.get("bad"):
            return
        t = cur["t"]
        where = f"dialogues.txt:{cur['ln']}"
        if not 2 <= len(t) <= 3:
            errors.append(f"{where} needs 2-3 turns, has {len(t)}")
            return
        if [x[4] for x in t] != ["A", "B", "A"][:len(t)]:
            errors.append(f"{where} turns must alternate A, B(, A)")
            return
        key = "｜".join("".join(x[1]) for x in t)
        if key in seen_dlg:
            errors.append(f"{where} duplicate dialogue {key}")
            return
        seen_dlg.add(key)
        dlgs.append([cur["cat"], t])

    for ln, line in enumerate((D / "dialogues.txt").read_text(encoding="utf-8").splitlines(), 1):
        st = line.strip()
        if not st or st.startswith("#"):
            continue
        if st.startswith("=="):
            flush_dlg()
            cat = st[2:].strip()
            if cat not in DLG_CATS:
                errors.append(f"dialogues.txt:{ln} unknown category {cat!r}")
            cur = {"cat": cat, "t": [], "ln": ln}
        elif st[:2] in ("A:", "B:") and cur is not None:
            if "|" not in st:
                errors.append(f"dialogues.txt:{ln} no | in turn")
                cur["bad"] = True
                continue
            zh, en = st[2:].split("|", 1)
            r = parse_tokens(zh, f"dialogues.txt:{ln}")
            if r is None:
                cur["bad"] = True
                continue
            cur["t"].append([r[0], r[1], r[2], en.strip(), st[0]])
        else:
            errors.append(f"dialogues.txt:{ln} expected '== category', 'A:' or 'B:': {st!r}")
    flush_dlg()

# ---------- particle game items ----------
PARTICLES = ["吗", "吧", "呢", "啊", "嘛", "啦", "呀", "了"]
parts_out = []
if (D / "particles.tsv").exists():
    for ln, line in enumerate((D / "particles.tsv").read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        cols = [c.strip() for c in line.split("\t")]
        if len(cols) != 5:
            errors.append(f"particles.tsv:{ln} needs 5 columns")
            continue
        sent, ans, wrong, sit, expl = cols
        wrongs = [w.strip() for w in wrong.split(",") if w.strip()]
        if ans not in PARTICLES or not wrongs or any(w not in PARTICLES or w == ans for w in wrongs):
            errors.append(f"particles.tsv:{ln} answer/wrong options must be different particles from {PARTICLES}")
            continue
        toks = sent.split()
        blanks = [i for i, t in enumerate(toks) if t == "_"]
        if not blanks:
            errors.append(f"particles.tsv:{ln} no _ blank")
            continue
        r = parse_tokens(" ".join(ans if t == "_" else t for t in toks), f"particles.tsv:{ln}")
        if r is None:
            continue
        for w in [ans] + wrongs:
            if w not in by_hanzi:
                errors.append(f"particles.tsv:{ln} particle {w} is not in the dictionary")
        parts_out.append([r[0], r[1], r[2], blanks, wrongs, sit, expl])

# ---------- contrast sets (Particles game) + echo answers (Echo game) ----------
contrast = []
if (D / "contrast.tsv").exists():
    for ln, line in enumerate((D / "contrast.tsv").read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        cols = [c.strip() for c in line.split("\t")]
        if len(cols) != 10:
            errors.append(f"contrast.tsv:{ln} needs 10 columns (label, 4 x sentence+meaning, explanation)")
            continue
        items, ok = [], True
        for k in range(4):
            r = parse_tokens(cols[1 + 2 * k], f"contrast.tsv:{ln}")
            if r is None:
                ok = False
                continue
            items.append([r[0], r[1], r[2], cols[2 + 2 * k]])
        if ok:
            if len({"".join(x[1]) for x in items}) != 4 or len({x[3] for x in items}) != 4:
                errors.append(f"contrast.tsv:{ln} sentences and meanings must be distinct")
                continue
            contrast.append([cols[0], items, cols[9]])

echo = []
if (D / "answers.tsv").exists():
    for ln, line in enumerate((D / "answers.tsv").read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        cols = [c.strip() for c in line.split("\t")]
        if len(cols) != 5:
            errors.append(f"answers.tsv:{ln} needs 5 columns")
            continue
        q, a, wrong, intent, ex = cols
        parsed = [parse_tokens(x, f"answers.tsv:{ln}") for x in [q, a] + [w.strip() for w in wrong.split(" / ") if w.strip()]]
        if any(x is None for x in parsed):
            continue
        if len(parsed) < 4:
            errors.append(f"answers.tsv:{ln} needs at least 2 wrong answers")
            continue
        echo.append([list(x) for x in parsed[:1]] + [[list(x) for x in parsed[1:]], intent, ex])

# ---------- idioms (chengyu) ----------
idioms = []
if (D / "idioms.tsv").exists():
    seen_id = set()
    for ln, line in enumerate((D / "idioms.tsv").read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("\t")]
        while len(parts) < 7:
            parts.append("")
        hz, py, lit, mean, story, tag, ai = parts[:7]
        syl = syllables(py)
        lits = [x.strip() for x in lit.split(" / ")]
        nhan = sum(1 for c in hz if is_han(c))
        if syl is None or len(syl) != nhan:
            errors.append(f"idioms.tsv:{ln} pinyin {py!r} does not match {hz}")
            continue
        if len(lits) != nhan:
            errors.append(f"idioms.tsv:{ln} literal gloss needs {nhan} parts: {lit!r}")
            continue
        if hz in seen_id:
            errors.append(f"idioms.tsv:{ln} duplicate {hz}")
            continue
        seen_id.add(hz)
        idioms.append([hz, syl, lits, mean, story, tag, ai])

# ---------- report ----------
if errors:
    print("\n".join(errors))
    print(f"\n{len(errors)} errors")
lv = {}
for w in words:
    if w:
        lv[w["l"]] = lv.get(w["l"], 0) + 1
print("words:", len(words), "by level:", dict(sorted(lv.items())), "sentences:", len(sents), "notes:", len(notes), "idioms:", len(idioms))

# coverage: words used in sentences
used = set(i for s in sents for i in s["w"] if i >= 0)
print("words appearing in sentences:", len(used))
print("spoken words:", len(spoken_rows), f"({sum(1 for r in spoken_rows if r[3])} new)", "dialogues:", len(dlgs), "particle items:", len(parts_out), "contrast sets:", len(contrast), "echo items:", len(echo))
in_dlg = set(i for d in dlgs for t in d[1] for i in t[0] if i >= 0)
no_dlg = [r[0]["h"] for r in spoken_rows if r[0]["id"] not in in_dlg]
if no_dlg:
    print("note: spoken words without a dialogue:", " ".join(no_dlg))

out = {
    "words": [[w["h"], w["p"], w["m"], w["l"], w["s"], w["u"], w["o"]] if w else None for w in words],
    "sents": [[s["w"], s["z"], s["s"], s["en"]] for s in sents],
    "notes": notes,
    "idioms": idioms,
    "spoken": [[e["id"], kind, note, 1 if new else 0] for e, kind, note, new in spoken_rows],
    "dlgs": dlgs,
    "parts": parts_out,
    "contrast": contrast,
    "echo": echo,
}
(Path(__file__).parent / "data.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
sys.exit(1 if errors else 0)
