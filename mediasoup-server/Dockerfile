# Dockerfile for mediasoup-server
FROM node:20-alpine

# Install Python3, pip, and build tools (required for mediasoup postinstall)
RUN apk add --no-cache python3 py3-pip build-base linux-headers

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build && npm prune --production
CMD ["node", "dist/index.js"]
