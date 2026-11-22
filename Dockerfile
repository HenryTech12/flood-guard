FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
EXPOSE 3000
# RUN_SETUP=true applies migrations and seeds on first start (idempotent migrations; seed only if empty).
CMD ["sh", "-c", "if [ \"$RUN_SETUP\" = \"true\" ]; then npx tsx scripts/migrate.ts && (npx tsx scripts/seed-if-empty.ts || true); fi; npx next start -p 3000"]
