# ADR 0004: TOTP implemented on node:crypto, not a third-party library

**Decision.** RFC 6238 TOTP (HMAC-SHA1, 30 s, 6 digits, ±1 step) and RFC 4648 base32 are
implemented in `packages/kosh-core/src/totp.ts` and verified against the RFC 6238 Appendix B and
RFC 4226 test vectors.

**Context.** The candidate library changed its public API between majors during Milestone 1 and
would have handled authenticator secrets for privileged accounts.

**Reason.** The algorithm is ~60 lines over primitives Node already ships; test vectors make
correctness checkable; one fewer dependency on the security path (Instruction §24, "fewer
dependencies").

**Consequences.** Any change to `totp.ts` must keep the vector tests green. SHA-256/512 variants
are supported but not used by the enrolment URI.
