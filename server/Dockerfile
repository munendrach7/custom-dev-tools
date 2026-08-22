FROM node:20-alpine

WORKDIR /app

# Only production deps (express, cors) are needed for the JSONL backend.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server

EXPOSE 5178
CMD ["node", "server/index.js"]
