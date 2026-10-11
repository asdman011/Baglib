---
trigger: always_on
---

# Rule: Reverse-Engineered Feature Documentation

## Purpose

Whenever I investigate or implement a feature inspired by reverse-engineering another application, tool, website, or software project, document the findings and keep them organized for future reference.

## 1. Record Findings by Tool

Store documentation in:

`docs\features\`

For every tool, application, website, or software project whose implementation is investigated for potential use in Baglib:

- Create a Markdown (`.md`) file named after the tool, application, website, or project.
- Record the relevant features investigated, how they work, the implementation patterns discovered, and the lessons applicable to Baglib.
- Include evidence where possible, such as source file paths, modules, functions, API documentation, code references, and observed behavior.
- Distinguish verified findings from hypotheses, assumptions, and unanswered questions.
- Explain which patterns are applicable to Baglib and how they relate to its existing architecture.
- Record relevant limitations and implementation trade-offs.

**If a documentation file for that tool already exists, update and append to the existing file rather than creating a duplicate.** Preserve useful previous findings and organize new material under appropriate headings. Update existing sections when new evidence corrects, clarifies, or supersedes earlier conclusions.

## 2. Create Cross-Application Feature Documents

When a particular feature has been investigated extensively, discussed repeatedly, or implemented based on findings from two or more tools , applications, websites, or projects, create a dedicated feature document.

Name it using this convention:

`feature: <Feature Name>.md`

For example:

- `feature: Metadata Discovery.md`
- `feature: Cover Retrieval.md`
- `feature: Full-Text Search.md`

Use filenames compatible with the project's filesystem and tooling while preserving the `feature:` prefix where supported.

The feature document must compare how different investigated applications implement the same or related functionality. Include:

- The applications and tools examined.
- Each application's approach and architecture.
- Similarities and differences.
- Strengths, weaknesses, and trade-offs.
- Relevant implementation details and supporting evidence.
- Which approaches are most suitable for Baglib and why.
- Decisions already made for Baglib, alternatives considered, and unresolved questions.

Do not merely copy the individual tool reports. Synthesize the findings into a comparative analysis that helps guide Baglib's implementation.

## 3. Keep Documentation Continuously Updated

Whenever new findings emerge about a previously documented tool or feature:

1. Check whether the relevant tool document already exists.
2. Update that document with the new findings.
3. Check whether a dedicated feature document exists or is warranted.
4. Update the feature document with the new evidence, comparisons, and implications for Baglib.
5. Reconcile conflicting information and mark outdated conclusions appropriately instead of silently leaving contradictory guidance.
6. Keep references between tool documents and feature documents where useful.

Do not wait for me to explicitly request documentation updates. Treat them as part of the reverse-engineering and feature-implementation workflow.

## 4. Document the Actual Investigation

Record what was actually inspected, tested, or verified. Do not claim that source code was examined, runtime behavior was tested, or an implementation was confirmed unless that work was performed.

When useful, include:

- Date investigated.
- Application and version.
- Source repository or installed application path.
- Relevant files, modules, functions, and call paths.
- Tests or experiments performed and their results.
- Confidence level and outstanding questions.

Avoid duplicating large amounts of source code. Prefer concise explanations, targeted excerpts when appropriate, and references to the original source.

## 5. Preserve Baglib's Architecture and Existing Decisions

These documents are research and implementation references, not authorization to change Baglib's architecture.

Before applying a reverse-engineered pattern:

- Check Baglib's existing documentation, domain schema, data dictionary, and relevant ADRs.
- Preserve the approved Work → Edition → Source model and existing architectural boundaries.
- Do not introduce unapproved database entities, fields, relationships, or dependencies.
- Clearly document any proposed architectural changes and seek approval when required.

## 6. Completion Checklist

Before considering a reverse-engineering-inspired implementation complete, verify that:

- [ ] Findings are recorded in the appropriate tool document.
- [ ] Existing tool documentation was updated rather than duplicated.
- [ ] A cross-application feature document was created or updated when warranted.
- [ ] Relevant evidence and source references are included.
- [ ] Comparisons and implications for Baglib are documented.
- [ ] Outdated or conflicting findings have been reconciled.
- [ ] Documentation accurately reflects the investigation and implementation actually performed.

**Default behavior:** Research, implementation, verification, and documentation are one continuous workflow. Keep the knowledge base current as the project evolves.
