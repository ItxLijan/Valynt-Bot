FROM node:20-alpine

# Install OpenSSL 1.1 (required by Prisma on Alpine)
RUN apk add --no-cache openssl openssl-dev libc6-compat

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install

# Copy prisma schema and generate client with correct binary target
COPY prisma ./prisma/
RUN npx prisma generate

# Copy rest of source
COPY . .

# Build TypeScript
RUN npm run build

# Verify build output has no ESM files
RUN find dist -name "*.js" | head -5

EXPOSE 3000

# Start both bot and dashboard
CMD ["sh", "-c", "node dist/index.js & node dist/dashboard/server.js & wait"]
