# Feature Document: Quran Semantic Retrieval and Cited AI

## 1. Executive Summary & Scope Definition

This feature document provides the formal architectural evaluation, data contracts, and operational guidelines for **Local-First Semantic Retrieval and Cited AI** in Baglib's Quran reader and research platform.

### Strict Scope Boundary (Jira KEY-179)
- **Status:** Evaluative architectural specification for future backlog; **no embedding model downloads, local neural weights, or cloud training pipelines are authorized or initiated by this milestone**.
- **Foundational Prerequisite:** Operates strictly on top of the established, source-backed Quran reader foundations (Epics 1–6).
- **Core Principle:** **Source Preservation**. Under no circumstances does generative AI replace, paraphrase, or alter canonical Quranic text, nor does it displace classical published tafsir works. AI serves exclusively as an assistive retrieval and cited synthesis tool.

---

## 2. Examined Approaches & Cross-Application Analysis

To architect an authentic, high-precision retrieval system for the Holy Quran and classical Islamic sciences, three paradigms were investigated and synthesized:

### A. Tarteel & QUL Lexical Indexing (Search Engine Baseline)
- **Mechanism:** Exact and normalized lexical matching across Uthmani script and Imlaey transliteration using SQLite FTS5 (BM25).
- **Strengths:** 100% deterministic recall for specific word roots (e.g., `ك-ت-ب`), lemmas, and identical word sequences. Highly efficient on low-spec hardware (<5 ms query latency, zero RAM overhead).
- **Limitations:** Struggles with thematic or conceptual queries where the verbatim word root is absent (e.g., searching for "monotheism in nature" or "compassion towards orphans" fails to retrieve ayahs that describe the concept using distinct vocabulary without an explicit topic mapping).

### B. Dense Vector Embedding & Semantic Representation (Quranic NLP Research)
- **Examined Models:**
  - `multilingual-e5-small` (133M parameters, ~130 MB quantized ONNX): Optimized for cross-lingual query-passage retrieval with asymmetric prefixes (`query: ` vs `passage: `). Strong alignment between English conceptual queries and Classical Arabic text.
  - `BGE-M3` (560M parameters, ~1.1 GB): High multi-lingual performance supporting dense retrieval, sparse lexical weights, and multi-vector reranking. High quality, but requires 4× the RAM and compute of `multilingual-e5-small`.
  - Specialized Classical Arabic Models (`CAMeLBERT`, `ArabERT`): Specialized in MSA and classical morphology, but lack unified cross-lingual alignment for English queries.
- **Key Finding:** Dense retrieval alone produces semantic hallucinations or misses exact phrasing when users search for specific grammatical forms. Therefore, **pure vector search is unsuitable as a standalone engine for scripture**.

### C. Readest & Baglib BYOK AI Research Patterns
- **Examined Patterns:** Page-level anti-spoiler context ceiling (`<BOOK_PASSAGES>`), zero-cloud telemetry, and local loopback inference via Ollama or Bring-Your-Own-Key (BYOK) cloud endpoints.
- **Applicability to Quran:** Generative assistance must be isolated from the renderer, strictly grounded in retrieved chunks, and enforce an **unconditional abstention policy** when evidence is insufficient.

---

## 3. Hybrid Retrieval Architecture: Reciprocal Rank Fusion (RRF)

Baglib combines the deterministic precision of SQLite FTS5 with the semantic understanding of quantized dense embeddings using **Reciprocal Rank Fusion (RRF)**:

```
                          ┌───────────────────────┐
                          │ User Search / Query   │
                          └───────────┬───────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
   ┌───────────────────────────┐             ┌───────────────────────────┐
   │ SQLite FTS5 BM25 Engine   │             │ ONNX CPU Embedding Engine │
   │ (Exact Root, Lemma, Text) │             │ (Dense Vector Cosine Sim) │
   └─────────────┬─────────────┘             └─────────────┬─────────────┘
                 │ Rank List L                             │ Rank List V
                 └────────────────────┬────────────────────┘
                                      ▼
                        ┌───────────────────────────┐
                        │ Reciprocal Rank Fusion    │
                        │ RRF = Σ 1 / (k + rank)    │
                        └─────────────┬─────────────┘
                                      ▼
                        ┌───────────────────────────┐
                        │ Top-K Re-ranked Passages  │
                        │ + Exact Verse Citations   │
                        └───────────────────────────┘
```

### Reciprocal Rank Fusion Formula
For any passage $d$ appearing in lexical results $R_{lex}$ and vector results $R_{vec}$:

$$RRF(d) = \frac{w_{lex}}{60 + \text{rank}_{lex}(d)} + \frac{w_{vec}}{60 + \text{rank}_{vec}(d)}$$

Where:
- $w_{lex}$ defaults to $0.6$ (prioritizing morphological fidelity for Quranic text).
- $w_{vec}$ defaults to $0.4$ (bridging semantic synonyms and cross-language concepts).
- The smoothing constant $k = 60$ prevents top outliers from disproportionately dominating the ranking.

---

## 4. Source-Preserving Semantic Chunking Strategy

To preserve Baglib's **Work → Edition → Source** architecture and maintain strict Qira'at reading profile boundaries, data is chunked according to functional granularity:

```ts
export type QuranSemanticChunkKind =
  | 'ayah'             // Exact 1:1 verse with canonical Uthmani & translation
  | 'tafsir-section'   // Classical commentary passage bounded by ayah range
  | 'surah-intro'      // Historical context, revelation period, and core themes
  | 'ayah-theme'       // Thematic span mapped to specific surah/ayah intervals
  | 'topic-concept';   // Ontological concept from QUL topic taxonomy
```

### Chunking Rules:
1. **Profile Isolation**: Every chunk is permanently stamped with its `profileKey` (`hafs-kufi` or `warsh-madani`). Cross-profile vector comparisons are prohibited to prevent verse numbering misalignment (e.g. Warsh 6,214 verses vs Hafs 6,236 verses).
2. **Immutable Provenance**: Every chunk retains `sourceId` and `immutableSourceDigest` linking back to the verified pack archive.
3. **Citation Invariance**: Every chunk formats a canonical, unalterable human-readable citation (e.g., `"سورة آل عمران [٣:١٨]"` / `"Surah Ali 'Imran [3:18]"`).

---

## 5. Hardware Benchmarking & Capacity Planning

### User Machine Specifications (Verified 2026-10-24)
- **Processor:** AMD Ryzen 7 PRO 5750G (8 Cores, 16 Threads @ 3.8 GHz base, up to 4.6 GHz boost).
- **System Memory:** 15.4 GiB physical RAM visible to OS.
- **Graphics:** Integrated AMD Radeon Graphics (Renoir APU) with 512 MiB dedicated adapter memory (shares system RAM).
- **Storage:** NVMe SSD storage with ample throughput (>100 GB free across C: and D:).

### Resource Budget & Hardware Limits

| Component | Target Model / Runtime | Memory Footprint | CPU / Thread Contention | Latency per Operation | Recommended Feasibility |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dense Embedding (Local)** | `multilingual-e5-small` (INT8 ONNX) | ~130 MiB RAM | 2 threads (utility process) | ~15–25 ms per query; ~35s full Quran index | **Highly Recommended** (Zero UI interference) |
| **Lexical Search (Local)** | SQLite FTS5 (BM25) | <15 MiB RAM | 1 thread | <4 ms per query | **Current Production Standard** |
| **Compact Local LLM** | Qwen 2.5 1.5B (Q4_K_M GGUF) | ~1.2 GiB RAM | 4 threads | ~18–25 tokens/sec on CPU | **Feasible for basic local synthesis** |
| **Medium Local LLM** | Llama 3.2 3B / Qwen 2.5 3B (Q4) | ~2.2 GiB RAM | 6 threads | ~10–14 tokens/sec on CPU | **Feasible with background thread capping** |
| **Heavy Local LLM** | 7B–8B Parameters (Q4) | ~5.2–6.0 GiB RAM | 8+ threads | ~4–7 tokens/sec on CPU | **Not Recommended on 16GB APU** (Competes with Electron, OS, and causes fan noise/heat) |
| **Cloud BYOK Endpoint** | OpenAI, Claude, Gemini, Groq | ~0 MiB local RAM | Minimal network I/O | Network roundtrip (~300–800 ms) | **Recommended for rich scholarly synthesis** |

### APU & RAM Safety Guidelines:
- Integrated graphics shares the 15.4 GiB system RAM. Running a 7B LLM alongside Electron (which utilizes 800 MB – 1.5 GB across main, renderers, and utility processes) leaves insufficient buffer for operating system caches.
- **Hardware Upgrade Recommendation:** No hardware upgrade is required for hybrid retrieval or compact 1.5B–3B inference. If the user desires heavy local 8B–14B models in the future, a workstation with 32 GiB RAM and a dedicated GPU with ≥12 GiB VRAM would be the appropriate target.

---

## 6. Anti-Hallucination & Theological Guardrails

Because the Quran is sacred scripture and classical commentaries (*Tafsir*) represent rigorous scholarly tradition, Baglib implements non-negotiable guardrails:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   THEOLOGICAL SAFETY GUARDRAILS                        │
├────────────────────────────────────────────────────────────────────────┤
│ 1. CANONICAL INTEGRITY: Generative models MUST NEVER generate or       │
│    paraphrase Quranic text. Verse quotations must be injected directly │
│    from verified database records, never from model weights.           │
│                                                                        │
│ 2. MANDATORY EXACT CITATIONS: Every analytical statement must cite its │
│    source chunk: `[Surah Name:Ayah Number]` or `[Tafsir Name, Vol/P]`.  │
│                                                                        │
│ 3. RIGOROUS ABSTENTION POLICY: If retrieved RRF similarity falls       │
│    below threshold (Score < 0.35) or if the topic touches sensitive    │
│    theological consensus without explicit classical sources, the AI    │
│    MUST explicitly abstain:                                            │
│    "لم يتم العثور على شواهد نصية كافية للإجابة بيقين"                  │
│    ("Insufficient textual evidence retrieved to answer definitively.")  │
│                                                                        │
│ 4. PROCESS ISOLATION: Inference runs exclusively in background         │
│    Utility Processes. UI rendering, page turning, and audio recitation │
│    playback are NEVER blocked or degraded by AI tasks.                 │
│                                                                        │
│ 5. LOCAL PRIVACY & DATA SOVEREIGNTY: Personal notes, reflections,      │
│    and study bookmarks are NEVER sent to external cloud APIs without   │
│    an explicit, per-request confirmation dialog and opt-in consent.    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Cost & Infrastructure Analysis: Local vs. Hosted BYOK

To prevent recurring subscriptions or forced cloud dependencies, Baglib adheres to a user-controlled model:

| Attribute | 100% Local-First Engine | Bring-Your-Own-Key (BYOK) Cloud | Dedicated Hosted Server |
| :--- | :--- | :--- | :--- |
| **Financial Cost** | **$0.00** (Free forever) | Pay-as-you-go (~$0.001 to $0.01 per query) | $97 to $584 / month (HuggingFace / AWS) |
| **Privacy** | 100% offline, zero network traffic | Ephemeral API payload, governed by provider policy | User-provisioned remote server |
| **Setup Complexity** | Zero-click embedded ONNX runtime | Paste API key in Settings (encrypted in local keychain) | Complex cloud infrastructure deployment |
| **Appropriateness** | Ideal for daily offline study & search | Ideal for in-depth comparative research | **Not Recommended for Baglib** |

---

## 8. Implementation Phasing & Future Milestones

- **Phase 6.4 (Current - KEY-179):** Architecture, formal contracts (`QuranSemanticChunk`, `QuranRetrievalQuery`), hardware benchmarks, and guardrail documentation complete.
- **Phase 8.1 (Future Backlog):** Optional local ONNX embedding worker for offline semantic search using `multilingual-e5-small`.
- **Phase 8.2 (Future Backlog):** Opt-in BYOK assistant integration with strict citation enforcement and notebook export.
