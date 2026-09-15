# Correction workflow

## Status

**Two-person decisions and versioned accepted text: IMPLEMENTED (Milestone 1).**
**Shudh Roop reporting, issues, proposals, evidence, locking: NOT IMPLEMENTED (Phase 4).**

## What exists now

Every change to accepted text is a `DRAFT` version that becomes `PUBLISHED` only after:

1. an approval by an EDITOR/SUPER_ADMIN account (`version_approvals`, role captured by trigger);
2. a second approval by a **different** EDITOR/SUPER_ADMIN account, which creates the
   `decisions` row (CHECK `approver_1 <> approver_2`; trigger verifies both genuinely held the
   role at that instant);
3. an explicit publish by an EDITOR/SUPER_ADMIN (checked at the API, in kosh-core against live
   grants, and by the `accepted_versions` trigger which requires the decision).

Decision kinds in use: `SOURCE_ADOPTION`, `ROLLBACK`. Reserved: `CORRECTION`,
`STRUCTURE_REVISION`, `LOCK`, `UNLOCK` (UNLOCK requires two SUPER_ADMINs, already enforced).

The proposer may be one of the two approvers (decision R-13). Reviewers cannot approve or
publish. Rollback creates a new version pointing at the one it restores; nothing is deleted.

## Phase 4 design (from the SRS and questionnaires)

- Selection: word / multi-word / range / line / verse / pauri; long-press (mobile) and right-click
  (desktop), plus keyboard-accessible paths (R-22). Selections snap to token boundaries for the
  aggregation key (R-10).
- `correction_issues` keyed by Bani + line + token span, aggregating every report; conflicting
  proposals live inside one issue; accepting one auto-rejects the siblings (Q3 §42).
- Reporters: username or `Anon-######` (CSPRNG label, hashed claim token, no IP/device data).
- Evidence: structured items with hash, licence and visibility (PUBLIC / REVIEWER / ADMIN);
  existence is public, artefacts may be restricted.
- Internal states NEW → IN_REVIEW → RESEARCH → PROPOSED → SECOND_REVIEW → APPROVED → PUBLISHED
  (or REJECTED / DUPLICATE / SUPERSEDED / LOCKED), mapped to the five user-facing statuses.
- A `CORRECTION` decision produces a `REVIEWED_CORRECTION` version through exactly the approval
  path above; `decisions.correction_issue_id` links it to the issue.
- Rejected corrections are retained and shown contextually to a user attempting the same
  correction, never publicly browsed or attributed (C-3).
