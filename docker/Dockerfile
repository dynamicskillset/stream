# Multi-stage build for Stream web application

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY packages/web/package*.json ./packages/web/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build:web

# Production stage
FROM nginx:alpine

# Copy built application from builder stage
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html

# Copy custom nginx configuration for SPA support
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]