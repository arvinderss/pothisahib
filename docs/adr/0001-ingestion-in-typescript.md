# ADR 0001: Ingestion and corpus tooling in TypeScript, sharing the integrity core

**Decision.** Source ingestion, parsing, normalisation and (later) alignment are implemented in
TypeScript in `packages/kosh-core`, using `packages/gurmukhi` directly. No Python port of the
integrity core is created for Milestone 1.

**Context.** SRS §70 said Python "should be available" for ingestion and the assessment planned a
Python port validated against shared fixtures. Instruction §23 forbids duplicating business
rules. The Unicode rules (codepoint classes, grapheme clusters, token offsets, diff kinds, the
one normaliser) are the single most integrity-critical logic in the project.

**Alternatives.** (a) Python ingestion with a second implementation of the integrity core kept in
lock-step by golden fixtures. (b) TypeScript everywhere, one implementation.

**Reason.** One implementation removes an entire class of divergence bugs where two tokenisers
disagree on an offset. The project's ingestion volume (tens of MB) needs no Python-specific
libraries; `packages/gurmukhi` already exists and is exhaustively tested. Python remains welcome
for research notebooks that consume the API or exports, where a divergence cannot corrupt the
corpus.

**Consequences.** Adapters for external sources (BaniDB, Shabad OS) will be TypeScript modules
emitting `kosh-source/1`. If Python tooling is ever needed on the write path, it must be validated
against `packages/gurmukhi/fixtures` and this ADR revisited.
