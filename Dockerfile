FROM mcr.microsoft.com/playwright:v1.58.2-noble AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc

FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
ENV DEBUG=pw:api
EXPOSE 3000
CMD ["node", "dist/index.js"]