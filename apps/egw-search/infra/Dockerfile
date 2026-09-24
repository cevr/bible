# EGW Search image. Railway builds it with the monorepo root as the context
# (see ../alchemy.run.ts). Dockerfile.dockerignore next to this file decides
# what is uploaded.
#
# This is the Railpack build the service ran before the stack, written out:
# prune the monorepo to @bible/egw-search, install the pruned workspace, build
# the client bundle, and start from `out/`. The corpus databases, the vector
# index and the model cache are not in the image. They live on the Railway
# volume at /data.
FROM oven/bun:1.4.2

WORKDIR /app
COPY . .

# Railpack installed the whole root workspace only to get `turbo`. Pinning the
# lockfile's turbo version gives the same prune without that install.
RUN bunx turbo@2.11.2 prune @bible/egw-search \
 && cp tsconfig.json out/tsconfig.json

RUN cd out \
 && bun install \
 && bun run --filter @bible/egw-search build

ENV NODE_ENV=production

# Railway's start command overrides this. The two are the same command.
CMD ["/bin/sh", "-c", "cd out && exec bun apps/egw-search/server/main.ts"]
