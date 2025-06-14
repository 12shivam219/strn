# Dockerfile for mediasoup-server
FROM node:20-alpine

# Install Python3, pip, and build tools (required for mediasoup postinstall)
RUN apk add --no-cache python3 py3-pip build-base

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
CMD ["node", "index.js"]
