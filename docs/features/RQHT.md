# RQHT: Linking Quran and Hadith Topics

Reviewed: 2026-10-24.

## Evidence and scope

Supplied document: `repos/Hadith/Linking Quran and Hadith Topics in an Ontology using Word Embeddings.pdf`.

SHA-256: `b2884b0ee51be7994ffd9b626ea91cecc4c16471e55c183b3ad591c71d9fef0f`.

Title: *Linking Quran and Hadith Topics in an Ontology using Word Embeddings and Cellfie Plugin*. Authors: Ibtisam Khalaf Alshammari, Eric Atwell, Mohammad Ammar Alsalka.

Text was extracted from all seven PDF pages. The corpus description on page 2 was also rendered with Poppler and visually inspected. This is a review of the supplied paper, not inspection or execution of RQHT, Cellfie, BERT models, or their source repositories. No linked datasets or models were fetched. Statements below about experimental results are the paper's reported findings.

## Relevant findings

- Section 3.1.1 identifies LK as a bilingual Arabic–English corpus with separate isnad and matn components, collection/chapter/section names and numbers. It states 39,038 records and 238 chapter topics excluding duplicates. These figures are not the same measurement as the 335 CSV chapter files and 34,088 rows observed in the supplied ZIP. See the [archive report](LK-Hadith-Corpus.md).
- HT_Topics is a **derived dataset**, not an extra column hidden in the LK CSVs. The paper describes 33,169 Arabic-matn documents after excluding incomplete/empty material, and 220 topics produced using ArabicBERT/BERTopic.
- QH_Dataset contains 310 labeled Qur'an–hadith semantic-relatedness pairs. The resulting QHT dataset combines text, chapter details and topics, with 155 related and 155 unrelated pairs. The reported training/test split is 80/20.
- BERT-family embeddings and cosine similarity estimate topic relatedness. The paper reports a 0.5 threshold and best results for CL-AraBERT: F1 0.9136 and accuracy 0.8444. These metrics concern the paper's experiment; they are not hadith authenticity or corpus-segmentation scores.
- Cellfie maps spreadsheet columns and rows into OWL classes, properties and individuals. RQHT links Qur'an and hadith topics with their original references. HermiT checks ontology consistency. Reported ontology metrics: 2,497 axioms, nine classes, four object properties, six data properties and 463 individuals.
- The limitations section explicitly notes the small QH_Dataset sample. The ethics section says HT_Topics was built by the authors and was to be made available in the future; this review does not establish its present availability.

## Implications for Baglib

1. Preserve collection/chapter/section/hadith references and original language text before attempting semantic linking.
2. Keep isnad, matn, comments and grades distinct in the data contract, while presenting the isnad and matn as a continuous passage.
3. A later topic or Qur'an-linking layer should distinguish cited source links from model-inferred suggestions, preserve provenance, and be evaluated on an appropriate dataset.
4. An embedding similarity score must not be presented as a grade of authenticity or a scholarly assertion of equivalence.
5. The current task requires a dedicated local reader, not an ontology backend, transformer dependency, new database relationship or invented cross-reference. None of those systems was added.

The current implementation therefore uses the verified LK hierarchy and annotations only. The paper is useful architectural context for future research; its ontology design is not silently imported into Baglib's approved library schema.
