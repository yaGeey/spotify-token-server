FROM mcr.microsoft.com/playwright:v1.58.2-noble AS builder
WORKDIR /app
RUN npm install -g pnpm@12
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm tsc

FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
RUN npm install -g pnpm@12
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile
COPY --from=builder /app/dist ./dist
ENV DEBUG=pw:api
EXPOSE 3000
CMD ["node", "dist/index.js"]