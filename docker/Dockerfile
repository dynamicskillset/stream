# Multi-stage build for Stream web application

# Build stage — pinned to amd64 since JS compilation is platform-agnostic
# and QEMU emulation of arm64 is unreliable for Node.js
FROM --platform=linux/amd64 node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY packages/web/package*.json ./packages/web/
COPY packages/extension/package*.json ./packages/extension/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build:web

# Production stage
FROM nginxinc/nginx-unprivileged:alpine

# Copy built application from builder stage
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html

# Copy custom nginx configuration for SPA support
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Expose port 8080 (nginx-unprivileged uses 8080 by default)
EXPOSE 8080

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
