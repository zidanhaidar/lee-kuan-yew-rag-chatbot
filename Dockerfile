FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Build the vector index (offline local embedder) then the Next.js app.
RUN npm run ingest && npm run build

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["npm", "start"]
