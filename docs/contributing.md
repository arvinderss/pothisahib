# Contributing

Read [PROJECT_PRINCIPLES.md](PROJECT_PRINCIPLES.md) first. They are non-negotiable.

## Workflow

1. Open an issue or pick one; discuss anything that touches the corpus model, roles or privacy.
2. Branch from `main`; keep commits coherent and messages meaningful.
3. `pnpm verify` must pass locally (typecheck, lint, format, privacy guard, normalisation guard, all tests).
4. Add tests with every change. Instruction §29 lists what must be tested; security-relevant endpoints need the role matrix extended.
5. Update the relevant page in `docs/` in the same change. Material decisions get an ADR in `docs/adr/`.
6. Never commit secrets, `.env`, `.data/`, or any Gurbani text as fixtures.

## Definition of done

Implementation + tests passing + security considered + accessibility considered (UI) + offline
considered (reader) + docs updated + migration present when the schema changed + OpenAPI reflects
the routes.

## Reporting a vulnerability

Do not open a public issue. Contact the maintainers privately (address to be published with the
first release). Reports about privilege escalation, corpus integrity or privacy get priority.
