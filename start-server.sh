#!/bin/bash
# Load environment variables from .env.local
set -a
source .env.local
set +a

# Start bun server
bun --watch src/server.ts
