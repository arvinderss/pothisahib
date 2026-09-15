# ADR 0003: Two-person decisions are collected as two independent approval actions

**Decision.** A DRAFT accepted version gains `version_approvals` rows, one per approving account,
each inserted from that account's own authenticated request. When two rows from distinct accounts
exist, the service creates the `decisions` row (approver_1 = first, approver_2 = second, roles as
captured) and attaches it to the draft. Publication is a separate explicit action.

**Context.** Migration 0005 models a decision as one row carrying both approvers. An HTTP
workflow needs two people acting at different times, each authenticated separately, without
either being able to supply the other's approval.

**Alternatives.** (a) One request carrying both approver ids (spoofable). (b) A pending-decision
table with a first approver, completed by the second (equivalent but duplicates version state).
(c) Per-version approvals (chosen).

**Reason.** Approvals are append-only, role-captured by trigger from live grants, refused for
non-eligible accounts and non-DRAFT versions, and naturally unique per account. The existing
`decisions` constraints (distinct approvers, eligible roles held at the time, redistributable
adoption source) still run on creation, so both layers verify the same facts.

**Consequences.** Approval and publication are distinct audit events. The proposer may approve
(R-13). Editors see who approved and when. A future correction workflow produces `CORRECTION`
decisions through the same path.
