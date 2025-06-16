# Dockerfile for auth-streaming-server
FROM node:18.16.0-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json tsconfig.json ./
RUN npm cache clean --force && \
    npm install --no-cache --prefer-offline

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create production build
FROM node:18.16.0-alpine
WORKDIR /app

# Copy production dependencies
COPY package*.json ./
RUN npm cache clean --force && \
    npm install --only=production --no-cache --prefer-offline

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Set environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Start the server
CMD ["node", "--loader", "ts-node/esm", "dist/index.js"]
