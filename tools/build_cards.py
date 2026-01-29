#!/usr/bin/env python3
"""
Commute Review - Word(.docx) -> cards.json (Direction-based cards)

Design:
- Topic: ONLY "Heading 1" paragraphs.
- Direction: a paragraph that is (almost) entirely bold, short (e.g., Definition / Evolution / Future research).
- One card per Direction under a Topic.
- Blocks: paragraphs under a Direction until next Direction or next Topic.
- Skip any text that is strikethrough in Word (do not review).
- Highlights: phrases from runs that are bold or colored (and NOT strikethrough), used for masking in hints.

Usage:
  python tools/build_cards.py "source/Key Review.docx" "web/data/cards.json"
"""
import re, json, datetime, sys
from pathlib import Path
from docx import Document

def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())

def run_is_struck(run) -> bool:
    """True if the run has strike or double-strike."""
    try:
        if getattr(run, "font", None) is not None:
            if run.font.strike is True or run.font.double_strike is True:
                return True
        if getattr(run, "strike", None) is True:
            return True
    except Exception:
        pass
    return False

def is_topic(paragraph) -> bool:
    style = (paragraph.style.name if paragraph.style else "") or ""
    return style.strip() == "Heading 1"

def is_direction(paragraph) -> bool:
    txt = norm(paragraph.text)
    if not txt:
        return False
    if len(txt) > 60 or len(txt.split()) > 8:
        return False

    runs = [r for r in paragraph.runs if (r.text or "").strip() and not run_is_struck(r)]
    if not runs:
        return False
    bold_runs = [r for r in runs if r.bold]
    return (len(bold_runs) / len(runs)) >= 0.9

def paragraph_clean_text(paragraph) -> str:
    kept = []
    for r in paragraph.runs:
        if run_is_struck(r):
            continue
        kept.append(r.text or "")
    return norm("".join(kept))

def extract_highlights(paragraph):
    highlights = []
    for r in paragraph.runs:
        if run_is_struck(r):
            continue
        t = norm(r.text)
        if not t:
            continue

        is_bold = bool(r.bold)

        is_colored = False
        try:
            rgb = r.font.color.rgb
            if rgb is not None:
                is_colored = True
        except Exception:
            pass

        if is_bold or is_colored:
            if len(t) <= 40:
                highlights.append(t)

    uniq = []
    seen = set()
    for h in highlights:
        h2 = h.strip(" ,.;:()[]")
        if len(h2) < 2:
            continue
        k = h2.lower()
        if k in seen:
            continue
        seen.add(k)
        uniq.append(h2)
    return uniq[:12]

def build_cards(docx_path: Path):
    doc = Document(str(docx_path))

    cards = []
    cid = 1

    current_topic = None
    current_direction = None
    current_blocks = []

    def flush_card():
        nonlocal cid, current_direction, current_blocks
        if current_topic and current_direction and current_blocks:
            cards.append({
                "id": f"d{cid:05d}",
                "type": "direction",
                "topic": current_topic,
                "direction": current_direction,
                "blocks": current_blocks
            })
            cid += 1
        current_direction = None
        current_blocks = []

    for p in doc.paragraphs:
        raw_txt = norm(p.text)
        if not raw_txt:
            continue

        if is_topic(p):
            flush_card()
            current_topic = raw_txt
            continue

        if not current_topic:
            continue

        if is_direction(p):
            flush_card()
            current_direction = raw_txt
            continue

        if current_direction:
            clean_text = paragraph_clean_text(p)
            if not clean_text:
                continue
            current_blocks.append({
                "text": clean_text,
                "highlights": extract_highlights(p)
            })

    flush_card()

      meta = {
        "generated_at": ...,
        "source_file": ...,
        "card_count": len(cards),
        "topics": ...,
        "types": ["direction"],
        "schema": "direction-v1"
      }

    return {"meta": meta, "cards": cards}

def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    in_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    out_path.parent.mkdir(parents=True, exist_ok=True)

    data = build_cards(in_path)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {data['meta']['card_count']} cards -> {out_path}")

if __name__ == "__main__":
    main()
