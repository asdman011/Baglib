#!/usr/bin/env python3
"""
review_isnad_matn.py — Deep dataset review of isnad and matn across 73,325 hadiths
in sunnah_merged_quranlab_v1.sqlite (Jira KEY-358).

Measures:
1. Distribution of isnad/matn availability per collection (merged, missing, separated).
2. Ground-truth evaluation of boundary heuristics against separated collections (Bukhari, Muslim).
3. Detailed analysis of merged collections (HadeethEnc, ReviewQueue, MusnadAhmad).
4. Concrete samples of merged rows, wrongly split rows, and edge cases.
"""

import sqlite3
import json
import re
import os
import sys

def strip_tashkeel(text: str) -> str:
    if not text:
        return ""
    # Strip tashkeel, tatweel, and invisible bidi marks
    t = re.sub(r'[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200e\u200f\u202a-\u202e]', '', text)
    # Normalize alef variants
    t = re.sub(r'[أإآٱ]', 'ا', t)
    # Normalize spaces
    t = re.sub(r'\s+', ' ', t).strip()
    return t

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "output", "sunnah_merged_quranlab_v1.sqlite")
if not os.path.exists(DB_PATH):
    DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "release", "win-unpacked", "resources", "sunnah", "sunnah_merged_quranlab_v1.sqlite"))

print(f"Opening database: {DB_PATH}")
con = sqlite3.connect(DB_PATH)
con.row_factory = sqlite3.Row
cur = con.cursor()

# Boundary heuristics to test:
# 1. Simple heuristic: mentions of the Prophet with introductory verbs
HEURISTIC_SIMPLE = re.compile(
    r'(?:'
    r'قال\s+رسول\s+الله|'
    r'ان\s+رسول\s+الله|'
    r'عن\s+رسول\s+الله|'
    r'سمعت\s+رسول\s+الله|'
    r'سمع\s+رسول\s+الله|'
    r'سالت\s+رسول\s+الله|'
    r'سال\s+رسول\s+الله|'
    r'قال\s+النبي|'
    r'ان\s+النبي|'
    r'عن\s+النبي|'
    r'سمعت\s+النبي|'
    r'سمع\s+النبي|'
    r'يرفعه|'
    r'يبلغ\s+به\s+النبي|'
    r'كان\s+رسول\s+الله|'
    r'رايت\s+رسول\s+الله|'
    r'اتي\s+رسول\s+الله|'
    r'اتى\s+رسول\s+الله|'
    r'نهى\s+رسول\s+الله|'
    r'امر\s+رسول\s+الله'
    r')',
    re.UNICODE
)

# 2. Broader pattern: last narrator before matn transition
NARRATOR_TRANSITION = re.compile(
    r'(?:'
    r'قال\s*:\s*|'
    r'قالت\s*:\s*|'
    r'يقول\s*:\s*|'
    r'يحدث\s*:\s*|'
    r'رضى\s+الله\s+عنه\s+قال|'
    r'رضي\s+الله\s+عنه\s+قال'
    r')',
    re.UNICODE
)

cur.execute("""
    SELECT id, book_key, Chapter_Number, Hadith_number,
           Arabic_Hadith, Arabic_Isnad, Arabic_Matn,
           English_Hadith, English_Isnad, English_Matn
    FROM hadiths
    ORDER BY id
""")
rows = cur.fetchall()
total_rows = len(rows)
print(f"Total rows: {total_rows}")

collections_stats = {}
total_has_isnad = 0
total_empty_isnad = 0
total_matn_equals_hadith = 0
total_empty_matn = 0
total_both_distinct = 0

for r in rows:
    bk = r["book_key"]
    if bk not in collections_stats:
        collections_stats[bk] = {
            "total": 0,
            "has_isnad": 0,
            "empty_isnad": 0,
            "has_matn": 0,
            "empty_matn": 0,
            "matn_equals_hadith": 0,
            "has_both_distinct": 0,
            "isnad_starts_in_matn": 0,
            "heuristic_match_in_merged": 0,
            "samples_merged": [],
            "samples_missing_matn": [],
            "samples_number_prefix": []
        }
    st = collections_stats[bk]
    st["total"] += 1
    
    hadith = (r["Arabic_Hadith"] or "").strip()
    isnad = (r["Arabic_Isnad"] or "").strip()
    matn = (r["Arabic_Matn"] or "").strip()
    
    h_norm = strip_tashkeel(hadith)
    i_norm = strip_tashkeel(isnad)
    m_norm = strip_tashkeel(matn)
    
    if isnad:
        st["has_isnad"] += 1
        total_has_isnad += 1
    else:
        st["empty_isnad"] += 1
        total_empty_isnad += 1
        
    if matn:
        st["has_matn"] += 1
    else:
        st["empty_matn"] += 1
        total_empty_matn += 1
        if len(st["samples_missing_matn"]) < 3:
            st["samples_missing_matn"].append({
                "id": r["id"],
                "number": r["Hadith_number"],
                "hadith_preview": hadith[:100]
            })
            
    if matn and hadith and (m_norm == h_norm or matn == hadith or not isnad):
        st["matn_equals_hadith"] += 1
        total_matn_equals_hadith += 1
        if HEURISTIC_SIMPLE.search(m_norm):
            st["heuristic_match_in_merged"] += 1
        if len(st["samples_merged"]) < 3:
            st["samples_merged"].append({
                "id": r["id"],
                "number": r["Hadith_number"],
                "text_preview": hadith[:140]
            })
            
    if matn and (m_norm.startswith("حدثنا") or m_norm.startswith("اخبرنا") or m_norm.startswith("حدثني") or m_norm.startswith("اخبرني") or m_norm.startswith("عن ")):
        st["isnad_starts_in_matn"] += 1

    if matn and re.match(r'^\d+\s*[-–]\s*(?:حدثنا|اخبرنا|عن)', m_norm):
        if len(st["samples_number_prefix"]) < 3:
            st["samples_number_prefix"].append({
                "id": r["id"],
                "number": r["Hadith_number"],
                "text_preview": matn[:140]
            })
            
    if isnad and matn and m_norm != h_norm:
        st["has_both_distinct"] += 1
        total_both_distinct += 1

# Evaluate boundary heuristics on Bukhari & Muslim
eval_stats = {
    "tested": 0,
    "heuristic_exact": 0,
    "heuristic_within_15_chars": 0,
    "heuristic_within_40_chars": 0,
    "heuristic_not_found": 0,
    "heuristic_false_early": 0,   # matches too early (inside isnad)
    "heuristic_false_late": 0,    # matches too late (deep inside matn story)
}

for r in rows:
    if r["book_key"] not in ("Bukhari", "Muslim"):
        continue
    h_norm = strip_tashkeel(r["Arabic_Hadith"])
    i_norm = strip_tashkeel(r["Arabic_Isnad"])
    m_norm = strip_tashkeel(r["Arabic_Matn"])
    if not (h_norm and i_norm and m_norm):
        continue
    
    # Ground truth: matn start position in hadith
    gt_pos = h_norm.find(m_norm[:25]) if len(m_norm) >= 25 else -1
    if gt_pos == -1:
        # try shorter prefix
        gt_pos = h_norm.find(m_norm[:15]) if len(m_norm) >= 15 else -1
    if gt_pos == -1:
        continue
        
    eval_stats["tested"] += 1
    m = HEURISTIC_SIMPLE.search(h_norm)
    if not m:
        eval_stats["heuristic_not_found"] += 1
    else:
        pred_pos = m.start()
        diff = pred_pos - gt_pos
        if diff == 0:
            eval_stats["heuristic_exact"] += 1
        elif 0 < diff <= 15 or -15 <= diff < 0:
            eval_stats["heuristic_within_15_chars"] += 1
        elif 0 < diff <= 40 or -40 <= diff < 0:
            eval_stats["heuristic_within_40_chars"] += 1
        elif diff < -40:
            eval_stats["heuristic_false_early"] += 1
        else:
            eval_stats["heuristic_false_late"] += 1

print("\n=== DATASET SUMMARY ===")
print(f"Total Hadiths: {total_rows}")
print(f"Has Separate Isnad: {total_has_isnad} ({total_has_isnad/total_rows*100:.1f}%)")
print(f"No Separate Isnad: {total_empty_isnad} ({total_empty_isnad/total_rows*100:.1f}%)")
print(f"Matn Equals Full Hadith (Merged): {total_matn_equals_hadith} ({total_matn_equals_hadith/total_rows*100:.1f}%)")
print(f"Empty Matn: {total_empty_matn} ({total_empty_matn/total_rows*100:.2f}%)")
print(f"Both Distinct: {total_both_distinct} ({total_both_distinct/total_rows*100:.1f}%)")

print("\n=== SUMMARY PER COLLECTION ===")
print(f"{'Collection':<15} | {'Total':<6} | {'Has Isnad':<9} | {'No Isnad':<8} | {'Matn=Hadith':<11} | {'Both Distinct':<13} | {'Isnad in Matn':<13}")
print("-" * 90)
for bk, st in sorted(collections_stats.items(), key=lambda x: -x[1]["total"]):
    print(f"{bk:<15} | {st['total']:<6} | {st['has_isnad']:<9} | {st['empty_isnad']:<8} | {st['matn_equals_hadith']:<11} | {st['has_both_distinct']:<13} | {st['isnad_starts_in_matn']:<13}")

print("\n=== BOUNDARY DETECTION EVALUATION (Bukhari & Muslim: 14,659 hadiths) ===")
print(f"Evaluated with Ground Truth: {eval_stats['tested']}")
print(f"Exact boundary match: {eval_stats['heuristic_exact']} ({eval_stats['heuristic_exact']/eval_stats['tested']*100:.1f}%)")
print(f"Within 15 characters: {eval_stats['heuristic_within_15_chars']} ({eval_stats['heuristic_within_15_chars']/eval_stats['tested']*100:.1f}%)")
print(f"Within 40 characters: {eval_stats['heuristic_within_40_chars']} ({eval_stats['heuristic_within_40_chars']/eval_stats['tested']*100:.1f}%)")
good = eval_stats['heuristic_exact'] + eval_stats['heuristic_within_15_chars'] + eval_stats['heuristic_within_40_chars']
print(f"Total acceptable boundary: {good} ({good/eval_stats['tested']*100:.1f}%)")
print(f"Marker not found at all: {eval_stats['heuristic_not_found']} ({eval_stats['heuristic_not_found']/eval_stats['tested']*100:.1f}%)")
print(f"False early split (cut inside isnad): {eval_stats['heuristic_false_early']} ({eval_stats['heuristic_false_early']/eval_stats['tested']*100:.1f}%)")
print(f"False late split (chopped companion/story preface): {eval_stats['heuristic_false_late']} ({eval_stats['heuristic_false_late']/eval_stats['tested']*100:.1f}%)")
error_rate = (eval_stats['heuristic_not_found'] + eval_stats['heuristic_false_early'] + eval_stats['heuristic_false_late']) / eval_stats['tested'] * 100
print(f"Total Failure / Error Rate: {error_rate:.1f}%")

# Save results
out_path = os.path.join(os.path.dirname(__file__), "review_isnad_matn_stats.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump({
        "total_rows": total_rows,
        "total_has_isnad": total_has_isnad,
        "total_empty_isnad": total_empty_isnad,
        "total_matn_equals_hadith": total_matn_equals_hadith,
        "total_empty_matn": total_empty_matn,
        "total_both_distinct": total_both_distinct,
        "collections": collections_stats,
        "boundary_evaluation": eval_stats,
        "error_rate_pct": error_rate
    }, f, ensure_ascii=False, indent=2)

print(f"\nStats written to {out_path}")
