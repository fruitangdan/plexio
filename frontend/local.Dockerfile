FROM node:18.2.0-slim

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package.json
COPY package-lock.json package-lock.json

RUN npm install && \
    npm install @rollup/rollup-linux-arm64-gnu @swc/core-linux-arm64-gnu || true

COPY . .
