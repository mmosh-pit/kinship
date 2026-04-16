FROM node:22-bullseye-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm globally
RUN npm install -g pnpm

# Install dependencies (including ts-node & typescript as local devDeps)
RUN pnpm install

# Copy all other files
COPY . .

# Build the project (if needed — optional)
# RUN pnpm run build

# Expose the app port
EXPOSE 8080

# Run using local ts-node
CMD ["npm", "start"]
