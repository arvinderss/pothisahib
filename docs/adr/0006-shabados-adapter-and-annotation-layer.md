# ADR 0006: Shabad OS adapter — version, scope, and separation of the pause-mark annotation layer

**Decision.**

1. The first external source is the Shabad OS database, ingested as the `dist/master.sqlite` file of
   npm `@shabados/database` **5.0.0-next.0** (published 2025-05-05; SHA-256 of the SQLite file
   `517890c7e7c2f3dcef7f21b51d074a581b8eded4ebe14c504b84ea075ff16aeb`), not the older stable 4.8.7
   (2022-10-15).
2. Parser `shabados-sqlite-v1` reads only `asset_lines.type = 'primary'` (Gurmukhi text of a cited
   physical edition per line). Translations and notes are other authors' works with their own
   licences and are not ingested by this adapter (R-29).
3. Scope `banis`: one document per Shabad OS Bani compilation, sections by their `section_order`.
   Whole-source documents (all of SGGS as one document) come later.
4. Shabad OS embeds vishraam (pause) marks in the primary text as `;` (heavy), `,` (medium) and
   `.` (light). The adapter **separates** them: the emitted line text contains the words only; the
   composite string is recorded verbatim in the line locator as `raw`, with each mark's kind and
   codepoint position in `vishraam`. The rule is fixed by the parser version and the whole SQLite
   file is kept as the immutable snapshot, so the original is always recoverable.

**Context.** 4.8.7 stores Gurmukhi in a legacy ASCII font encoding (`siq nwmu`), which would need a
lossy re-encoding step to reach Unicode; 5.0.0-next.0 stores Unicode and, for every line, names the
physical edition it was taken from (`asset_id`, page, line), which is exactly the provenance our
model wants. Its data statement (public domain, Public Domain Mark 1.0, with a request against
derogatory alteration) matches 4.x's. Its `lines.id` values are stable 4-character ids, which the
re-synchronisation loop (R-01) can key on. Every Bani line in 5.0.0-next.0 has exactly one primary
reading; the adapter refuses lines with none (never invent) and, for now, lines with more than one.

**Why separate the pause marks.** The marks are an editorial layer Shabad OS attributes to a cited
pause pothi (Sri Damdami Taksaal), not the words of the SGPC Shabadaarth edition the text is taken
from. Storing them inside the accepted text would present an annotation as Gurbani and would make
byte comparison against other sources report punctuation differences everywhere. Discarding them
would lose useful information. Recording them as a positioned layer keeps both truths.

**Alternatives.** (a) Ingest 4.8.7 and convert ASCII → Unicode (lossy, second transformation).
(b) Keep the marks in the text (mislabels annotation as text). (c) Drop the marks (loses data).
(d) Separate and record (chosen).

**Consequences.** `source_lines.locator.raw` differs from the stored text only by the marks; a test
proves reinsertion reproduces `raw` exactly. Reviewers comparing Shabad OS against a source that has
no marks see genuine textual differences only. A future "pauses" feature can render the layer.
The pre-release status of 5.0.0-next.0 is recorded as `source_version`; re-syncing to a later
release is an ordinary new snapshot. Registry values recommended in `docs/source-candidates.md`.
