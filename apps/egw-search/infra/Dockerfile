# EGW Search image. Railway builds it with the monorepo root as the context
# (see ../alchemy.run.ts). Dockerfile.dockerignore next to this file decides
# what is uploaded.
#
# The build must finish inside Alchemy's deploy wait (about 50 seconds:
# `alchemy/src/Railway/ServiceProvider.ts`, `waitForDeploymentById`). The
# Railpack build it replaces took about 10 minutes, and most of that was
# copying two full `node_modules` trees (1.8 GB, devDependencies included)
# between layers. This image installs production dependencies only, once,
# in a layer keyed by the manifests and the lockfile, so a change to the
# code alone reuses it.
#
# The corpus databases, the vector index and the model cache are not in the
# image. They live on the Railway volume at /data.

# Stage 1: split the pruned workspace into the manifests (`json/`) and the
# sources (`full/`), so the install layer depends on the manifests alone.
FROM oven/bun:1.4.2 AS prune
WORKDIR /app
COPY . .
RUN bunx turbo@2.11.2 prune @bible/egw-search --docker

# Stage 2: the runtime image, in Railpack's `/app/out` layout, so the start
# command is unchanged.
FROM oven/bun:1.4.2
WORKDIR /app/out

COPY --from=prune /app/out/json/ ./
# The root `prepare` script patches the TypeScript toolchain for local
# development. That tool is a devDependency, so a production install drops it.
RUN bun pm pkg delete scripts.prepare \
 && bun install --production --frozen-lockfile

COPY --from=prune /app/out/full/ ./
COPY --from=prune /app/tsconfig.json ./tsconfig.json
RUN bun run --filter @bible/egw-search build

ENV NODE_ENV=production

# Railway's start command, `cd out && bun apps/egw-search/server/main.ts`,
# runs from here and overrides this CMD. The two are the same command.
WORKDIR /app
CMD ["/bin/sh", "-c", "cd out && exec bun apps/egw-search/server/main.ts"]
