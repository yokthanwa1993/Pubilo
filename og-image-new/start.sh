#!/bin/sh

# Create temp directory
mkdir -p /app/public/temp

# Start Next.js app in background
node /app/server.js &

# Start nginx
nginx -g 'daemon off;'
