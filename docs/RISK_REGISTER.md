# Risk Register — Loopholes and Potential Issues Across the Full Plan

**Scope:** requirements (questionnaires 1–3, SRS v1.0), project principles, and the architecture assessment, reviewed end-to-end for gaps that would surface between Phase 1 and a fully running platform.
**Status:** v1.0, 2026-09-15. Each item states the loophole, the consequence if ignored, the mitigation, and the phase by which it must be closed. Items marked ⚑ change the schema or plan and have been folded into Milestone 1.

A note on the premise you added: the upstream sources (BaniDB, Shabad OS and similar) are themselves rigorously reviewed and corrected over time. That is true and it changes the emphasis of the plan. It **reduces** the expected correction workload and **increases** the importance of two things: a clean way to _adopt_ an upstream text as our provisional accepted version with honest tagging, and a disciplined _re-synchronisation_ loop that notices when upstream changes something we have already adopted or decided. Items R-01 to R-04 are the direct consequence.

---

## 1. Corpus, sources and verification

**R-01 ⚑ Upstream drift after adoption.** _Loophole:_ the plan snapshots a source, we adopt or review text, then upstream corrects the same line months later. Nothing in the plan detects that a line we accepted has since changed at its source. _Consequence:_ our "verified" text silently diverges from a source that has moved on, and reviewers never hear about it. _Mitigation:_ every re-sync computes a per-line diff between the previous and new snapshot (cheap — line blobs are content-addressed, so this is integer comparison) and emits `diff_findings` of kind `UPSTREAM_CHANGED` against any line whose accepted text was based on the old reading. These enter the review queue as _system-originated_ findings, never as automatic changes. _Phase:_ schema in 1, job in 5.

**R-02 ⚑ Provisional adoption is missing as a first-class concept.** _Loophole:_ the assessment's verification states (SOURCE_ONLY → IN_VERIFICATION → VERIFIED → LOCKED) assume every accepted line was human-compared. Given rigorous upstream sources, the realistic path is: adopt source X's text wholesale as accepted v1 with a tag, then review only differences. Without a named state for this, the reader either shows nothing for months or shows adopted text mislabelled as verified. _Mitigation:_ `accepted_versions.basis ∈ {SOURCE_ADOPTION, REVIEWED_CORRECTION, ROLLBACK}` and `banis.verification_state ∈ {SOURCE_ONLY, PROVISIONAL, REVIEWED, LOCKED}`. Adoption is still a two-approver, audited decision — but one decision covers a whole Bani, which is what makes the effort small. The reader shows the tag ("Text adopted from _Source_, synced _date_; cross-source review pending") whenever state is PROVISIONAL. _Phase:_ 1.

**R-03 ⚑ Adopting a non-redistributable source poisons the public API.** _Loophole:_ if the source we adopt prohibits redistribution, our accepted text _is_ that source's text and cannot legally be served by the public API or exports — yet nothing stops adoption. _Consequence:_ the project's central deliverable becomes unpublishable. _Mitigation:_ a database trigger refuses `SOURCE_ADOPTION` from any source whose `redistribution` is not `ALLOWED` or `ATTRIBUTION_REQUIRED`; such sources remain comparison-only. Licence review of each source is a Phase-2 gate, not an afterthought. _Phase:_ 1 (trigger), 2 (review).

**R-04 Retention rule vs. content addressing.** _Tension:_ Q2 §5 says keep only the latest source version plus hash/sync date; content-addressed blobs retain every line ever seen. _Resolution:_ the retention rule applies to raw artefacts in object storage (which can be pruned to latest-per-source), not to line blobs, which are small and are needed for provenance of past decisions. Documented, not a loophole once stated. _Phase:_ 1.

**R-05 ⚑ Whose segmentation defines the structural spine?** _Loophole:_ `lines` are "ours", but the first ingest inevitably bootstraps them from one source's line breaks and Bani boundaries, importing that source's structural opinions unlabelled. Dasam Granth compositions and Nitnem Bani boundaries genuinely differ between sources and Maryadas. _Mitigation:_ every structural node records `structure_basis_snapshot_id`; structural changes (line split/merge, reordering) go through the same two-approver decision path and create a `structure_revision`, with `lines.superseded_by` so bookmarks, translations and issues keep resolving. _Phase:_ 1 (columns), 2 (workflow).

**R-06 ⚑ Bani length varies by Maryada — collections need variants, not just membership.** _Loophole:_ Q1 §B asks for collections to "show the length of bani as per the maryada of different gurudwara sahibs" (e.g. the well-known differences in Chaupai Sahib or Rehras between traditions). A `collection_items(collection_id, bani_id)` join cannot express "this tradition's Rehras includes these extra lines". _Mitigation:_ `collection_items` carries an optional `bani_variant_id`; `bani_variants` define an ordered set of line ranges over the spine with provenance and a Maryada label. The canonical text is unchanged; only inclusion differs. _Phase:_ 1 (tables), 3 (UI).

**R-07 Unspaced (Larivaar-form) sources cannot be tokenised independently.** _Loophole:_ some sources provide text without word spaces. Automatic tokenisation of such text is not reliable, and inventing boundaries would be fabricating structure. _Mitigation:_ `token_layouts.basis ∈ {SOURCE_SPACING, ALIGNED_FROM_LAYOUT, HUMAN}`; unspaced lines receive a layout only by alignment against a spaced source, flagged with confidence, or by human action. Never by guess. _Phase:_ 1 (column), 5 (alignment).

**R-08 Scanned kharde and photographs are evidence, not text sources, in v1.** _Loophole:_ Q1 treats older printed kharde as valid references, and the source-type enum includes IMAGE/MANUSCRIPT/PDF. Gurmukhi OCR quality is not adequate for a corpus that forbids fabricated text. _Mitigation:_ image-type sources are registered and cited as evidence with page locators; their text enters the corpus only when a human transcribes it as a proposal with the image attached. OCR may _assist_ transcription in a later phase, never populate `source_lines` directly. _Phase:_ policy now, tooling ≥5.

**R-09 Some scope may simply not exist in redistributable digital form** (parts of Sarbloh Granth, some Rehatnamas). _Mitigation:_ Principle 1 — mark Bani records `SOURCE_ONLY` with zero lines and an explicit "no permitted digital source registered" note; never fill gaps. _Phase:_ ongoing.

## 2. Correction workflow

**R-10 ⚑ Aggregation key is brittle.** _Loophole:_ `UNIQUE(bani, line, token_start, token_end, cp_start, cp_end)` means two users reporting the same word — one selecting a trailing space — produce two investigations, defeating Q3 §41. Worse, after a new accepted version changes the line, stored offsets point at the wrong characters. _Mitigation:_ (a) selections are **snapped to token boundaries** server-side before the key is computed, and arbitrary sub-word ranges are stored in addition, not instead; (b) issues record `anchor_accepted_version_id` and `original_blob_id`, and on publication of a new version a job re-anchors open issues by token alignment, flagging any it cannot re-anchor for human attention; (c) overlapping-span issues on one line are surfaced together in the queue. _Phase:_ 1 (columns), 4 (logic).

**R-11 ⚑ Offline reports may target a stale version.** _Loophole:_ a report queued offline against version N syncs after version N+1 is published. _Mitigation:_ the queued report carries `anchor_accepted_version_id` and the original blob hash; the server re-anchors as in R-10 or returns `STALE_ANCHOR` so the client can show the user the current text before resubmitting. Status vocabulary for the offline queue gains `NEEDS_ATTENTION`. _Phase:_ 4.

**R-12 Personal edits are anchored to text that can change underneath them.** _Loophole:_ a client-only personal edit stores "my reading of line L". When the accepted text of L changes, the 3-way view (Accepted / Mine / Diff) becomes a 4-way problem. _Mitigation:_ personal edits store the blob hash they were made against; when a bundle update arrives the reader shows "the accepted text has changed since your edit" with the three readings and lets the user keep, drop or re-base. _Phase:_ 3.

**R-13 Proposer-as-approver ambiguity.** _Loophole:_ an Editor may both propose and approve. Is the proposer allowed to be one of the two approvers? Requiring three privileged people is unworkable for the team size; allowing it means one Editor plus one rubber-stamp is enough. _Decision taken:_ the proposer **may** be one of the two approvers, but the second approver must not be the proposer, and the queue displays "proposed by" prominently to the second approver. This keeps the two-distinct-accounts invariant while remaining operable. Recorded here so it is a decision, not an accident. _Phase:_ 4.

**R-14 Sock-puppet approvals.** _Loophole:_ a Super Admin can create a second Editor account and satisfy both approvals alone. No constraint can prevent this in principle. _Mitigation:_ role grants are audited and the audit is public in aggregate (count of privileged accounts, grant dates); MFA enrolment is mandatory _before_ an EDITOR/SUPER_ADMIN grant takes effect; privileged approvals from an account less than N days old are flagged in the queue; and governance documentation names this as a trust boundary. Transparency is the control, because a technical one does not exist. _Phase:_ 1 (MFA gate), 4.

**R-15 Issue-level vs. Bani-level locking.** _Loophole:_ SRS locks a whole Bani; Q1 §F wants "anything rejected should not be reported again" — that is per-location. Locking whole Banis to stop one repeat report would freeze legitimate reports elsewhere. _Mitigation:_ `correction_issues.internal_state = LOCKED` at the issue/location level, plus Bani-level lock for the fully-verified case. Reader hides "Submit Shudh Roop" only for a locked _location_, shows history, and still allows local edit. _Phase:_ 4.

**R-16 Leaderboard incentivises volume.** _Loophole:_ "most corrections reported" rewards spamming. _Mitigation:_ counts are of **accepted** proposals per category only; opt-in; usernames only. _Phase:_ 7.

## 3. Identity, security and privacy

**R-17 ⚑ Security-question recovery undermines MFA for privileged accounts.** _Loophole:_ Q3 §52 requires generic, low-entropy recovery questions (favourite colour/food/place). For a USER that is an accepted trade-off. For an EDITOR or SUPER_ADMIN it is a bypass: guess three low-entropy answers and the MFA requirement is moot. _Mitigation:_ security-question recovery is **disabled** for privileged roles; recovering a privileged account requires a Super Admin action (recorded in audit) and resets MFA enrolment; the _last_ Super Admin must hold offline one-time recovery codes generated at enrolment (this is software, not hardware, so Q2 §20's constraint is respected). Users are told at signup that a lost privileged account is recovered by another administrator, not by questions. _Phase:_ 1.

**R-18 Low-entropy answers are brute-forceable even for users.** _Mitigation:_ all three answers required, Argon2id-hashed with per-answer salt, aggressive rate limiting and lockout on the recovery endpoint, and the answer comparison normalised for case/whitespace only (a deliberate, documented exception to the normalisation ban — it applies to recovery answers, never to Gurbani). Consider offering an optional printable recovery code as an _additional_ path. _Phase:_ 1.

**R-19 Username enumeration.** _Mitigation:_ identical responses and timing for unknown-user and wrong-password; recovery flow never confirms whether a username exists. _Phase:_ 1.

**R-20 Anonymous claim token is a single point of loss.** Accepted: losing it means the anonymous reporter cannot check status. The report itself and its `Anon-######` label survive; nothing about the person is retained to recover it by. Document in the UI at submission time. _Phase:_ 4.

**R-21 Anonymous forum posting invites spam.** _Loophole:_ forum identity "username or Anon-######" implies anonymous posting. _Mitigation:_ anonymous identities may **report** corrections but forum posting requires an account; PoW challenge on first posts; moderation queue. If anonymous posting is later wanted, it comes with PoW and per-thread limits. _Phase:_ 7. _(Flagged as a scope decision.)_

**R-22 Right-click hijack and hover/gesture-only access.** _Loophole:_ intercepting the desktop context menu and relying on long-press are gesture-only paths, contrary to Instruction §43. _Mitigation:_ every word is a focusable element; `Shift+F10` / context-menu key / Enter open the same Shudh Roop menu; a "selection mode" toggle exists for switch and screen-reader users. _Phase:_ 3/4.

**R-23 Bundle integrity for offline downloads.** _Loophole:_ a tampered or truncated Bani bundle in a cache would be rendered as Gurbani. _Mitigation:_ bundle manifests carry per-line blob SHA-256 and a bundle hash; the PWA verifies before storing and before rendering; mismatch shows an integrity error, never partial text. _Phase:_ 2/3.

## 4. Fonts and rendering

**R-24 ⚑ Most requested "Gurmukhi fonts" are legacy ASCII-encoded, not Unicode.** _Loophole:_ AnmolLipi and many "Hastlikhat"-style fonts are legacy fonts that map Latin keystrokes to Gurmukhi glyphs. Rendering Unicode text in them requires converting the text to a font-specific encoding — a lossy transform that contradicts Principle 3 and would not round-trip. _Consequence:_ the requested font list may be largely unusable as stated, and the redistributable, handwritten-style _Unicode_ Gurmukhi font pool is small. _Mitigation:_ **Unicode fonts only**, each with licence evidence in `docs/fonts.md`. Candidates to audit in Phase 3 include Noto Sans/Serif Gurmukhi, Mukta Mahee, Lohit Gurmukhi, Saab and similar open-licence fonts. Legacy fonts are excluded on integrity grounds even where licensing would permit them. This is a requirement conflict resolved in favour of Principle 3; the original request stands recorded. _Phase:_ 3.

**R-25 True Larivaar must not break shaping.** Rendering tokens as separate inline elements with zero gap is safe for Gurmukhi (shaping is intra-syllable) but must be verified across Chromium, WebKit and Gecko, and a fallback (single text run with token index maps for hit-testing) must exist. _Phase:_ 3.

## 5. Operations

**R-26 Free-tier databases sleep and throttle.** Read paths must survive a cold database: the public API serves immutable bundles from object storage/CDN with long cache headers; only writes and admin need a warm database. _Phase:_ 2.

**R-27 Restore rehearsal is the only proof of recoverability.** Add a scheduled CI job that restores the latest dump into a clean Compose stack and runs the Unicode round-trip suite against it. _Phase:_ 1 (script), 2 (schedule).

**R-28 Analytics creep.** A future contributor adds "just error monitoring". _Mitigation:_ dependency allowlist CI check and a CSP with no third-party origins; `docs/privacy.md` names the rule so reviewers can point at it. _Phase:_ 1.

**R-29 Translation and transliteration licences.** Q2 §8 names several translations by author. Each has its own licence position; some are not freely redistributable. Treat each as a `source` with its own `redistribution` value and gate exposure identically to Gurmukhi text. _Phase:_ 2.

---

## What changed in Milestone 1 because of this review

- `banis.verification_state` gains `PROVISIONAL`; `accepted_versions.basis` added (R-02).
- Trigger refusing `SOURCE_ADOPTION` from non-redistributable sources (R-03).
- `structure_basis_snapshot_id` and `lines.superseded_by` (R-05).
- `bani_variants` and `collection_items.bani_variant_id` (R-06).
- `token_layouts.basis` (R-07).
- `diff_findings.kind` gains `UPSTREAM_CHANGED` (R-01).
- Correction issue anchoring columns reserved (R-10/R-11).
- Privileged-role recovery policy and MFA-before-grant rule in `docs/security.md` (R-14, R-17).
