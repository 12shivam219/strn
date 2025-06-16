# Dockerfile for auth-streaming-server
FROM node:18-alpine
WORKDIR /app

# Install dependencies
COPY package*.json tsconfig.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create production build
FROM node:18-alpine
WORKDIR /app

# Copy production dependencies
COPY package*.json ./
RUN npm install --production

# Copy built files from build stage
COPY --from=0 /app/dist ./dist
COPY --from=0 /app/node_modules ./node_modules

# Set environment variables
ENV NODE_ENV=production

# Start the server
CMD ["node", "--loader", "ts-node/esm", "dist/index.js"]
