FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/ dist/

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "--enable-source-maps", "dist/main.js"]
