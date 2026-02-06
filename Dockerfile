FROM node:22-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json tsconfig.base.json vitest.workspace.ts .eslintrc.cjs ./
COPY packages ./packages
COPY apps ./apps
COPY modules ./modules
COPY types ./types

RUN corepack enable && pnpm install

CMD ["pnpm", "--filter", "@civis/api", "dev"]
