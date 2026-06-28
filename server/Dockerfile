FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ src/

ENV NODE_OPTIONS=--max-old-space-size=8192
RUN npm run build

FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist/ dist/

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "--enable-source-maps", "dist/main.js"]
