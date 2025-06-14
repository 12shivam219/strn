# Dockerfile for auth-streaming-server
FROM node:18-alpine
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY . .
RUN npm run build && npm prune --production
CMD ["node", "dist/index.js"]
