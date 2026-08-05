FROM node:22-alpine AS build

RUN apk add --no-cache git openssh-client
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN npm ci

COPY apps/frontend apps/frontend
COPY apps/backend apps/backend
COPY packages/contracts packages/contracts
RUN npm run build

FROM node:22-alpine AS production-dependencies

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN npm ci --omit=dev --workspace @abschluss/multiple-choice-backend

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /workspace

COPY --from=production-dependencies /workspace/node_modules node_modules
COPY --from=build /workspace/apps/backend/dist apps/backend/dist
COPY --from=build /workspace/apps/frontend/dist apps/frontend/dist
COPY --from=build /workspace/packages/contracts packages/contracts

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "apps/backend/dist/server.js"]
