FROM node:20-alpine

WORKDIR /app

COPY api/package.json api/package-lock.json ./
RUN npm ci --production

COPY api/src/ src/
COPY api/scripts/ scripts/
COPY api/seed-data.json* ./
COPY site/ site/

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
