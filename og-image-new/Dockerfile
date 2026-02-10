FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy app files
COPY . .

# Build the app
RUN npm run build

# Create temp directory
RUN mkdir -p public/temp

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
