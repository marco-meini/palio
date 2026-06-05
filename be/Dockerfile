FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY config/config.example.mjs config/config.example.mjs
COPY config/load-config.mjs config/load-config.mjs
COPY config/load-google-oauth.mjs config/load-google-oauth.mjs
COPY lib lib/
COPY server server/
COPY data/regolamento-index.json data/regolamento-index.json

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server/index.mjs"]
