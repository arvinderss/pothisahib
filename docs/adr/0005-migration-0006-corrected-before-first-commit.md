# ADR 0005: Migration 0006 corrected in place before the first commit

**Decision.** `corpus/migrations/0006_audit_and_grants.up.sql` was edited to cast the CASE
expression in `kosh.audit_role_change()` to `actor_type`. This is the only time an existing
migration file is edited.

**Context.** The rule "never edit an applied migration; write a new one" protects databases that
have already applied it. When the defect was found (by the new database-invariant tests: every
role grant failed with "column actor_type is of type actor_type but expression is of type
text"), no database anywhere had 0006 applied persistently, the repository had no Git history,
and the file had never been published.

**Alternatives.** (a) `CREATE OR REPLACE FUNCTION` in 0007 (leaves a migration that cannot
apply on its own between 0006 and 0007). (b) Fix in place (chosen).

**Consequences.** From the first commit onward the rule applies without exception; the runner's
checksum check enforces it against any applied database.
