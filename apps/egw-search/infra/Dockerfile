# EGW Search image. The build context is `apps/egw-search/.deploy`, which
# `./context.ts` writes with `turbo prune @bible/egw-search --docker` before
# every plan and deploy. `Dockerfile.dockerignore` next to this file is copied
# with it and decides what is uploaded.
#
# The deploy must finish inside Alchemy's wait for a Railway deployment: 10
# polls 5 seconds apart after the upload (`alchemy/src/Railway/
# ServiceProvider.ts`, `waitForDeploymentById`). The image installs
# production dependencies only, once, in a layer keyed by the manifests and
# the pruned lockfile, so a change to the code alone reuses that layer and
# pushes only the sources.
#
# The corpus databases, the vector index and the model cache are not in the
# image. They live on the Railway volume at /data.

# The `/app/out` layout is Railpack's, which the start command still uses.
FROM oven/bun:1.4.2
WORKDIR /app/out

COPY json/ ./
# The root `prepare` script patches the TypeScript toolchain for local
# development. That tool is a devDependency, so a production install drops it.
RUN bun pm pkg delete scripts.prepare \
 && bun install --production --frozen-lockfile

COPY full/ ./
COPY tsconfig.json ./tsconfig.json
RUN bun run --filter @bible/egw-search build

ENV NODE_ENV=production

# Railway's start command, `cd out && bun apps/egw-search/server/main.ts`,
# runs from here and overrides this CMD. The two are the same command.
WORKDIR /app
CMD ["/bin/sh", "-c", "cd out && exec bun apps/egw-search/server/main.ts"]
