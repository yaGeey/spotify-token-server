FROM mcr.microsoft.com/playwright:v1.58.2-noble AS builder
WORKDIR /app
RUN npm install -g pnpm@12 \
    && apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY . .
RUN pnpm tsc
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile --store-dir=/pnpm/store

FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
ENV DEBUG=pw:api
EXPOSE 3000
CMD ["node", "dist/index.js"]