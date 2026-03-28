# Build stage
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Set API URL at build time so React app knows where to reach backend directly
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build for production
RUN npm run build

# Install serve globally
RUN npm install -g serve

EXPOSE 80

# Serve static files on port 80
CMD ["serve", "-s", "dist", "-l", "80"]
