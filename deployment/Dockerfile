# Single image for the migrator, the public API, the admin API and the CLI.
# STATUS: not built on the Milestone-1 development machine (no Docker); verify on first use.
FROM node:24-alpine

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
COPY tools ./tools
COPY corpus ./corpus

# Dev dependencies are included so the same image can run tests; slim this later if image size matters.
RUN pnpm install --frozen-lockfile

# Run as an unprivileged user; the object store volume is mounted at /data/objects.
RUN mkdir -p /data/objects && chown -R node:node /app /data
USER node
EXPOSE 8080 8081
