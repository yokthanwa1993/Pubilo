#!/bin/bash

# OG Image Deploy to CapRover
APP_NAME="og-image"
CAPROVER_URL="https://captain.lslly.com"
DOMAIN="og.lslly.com"

echo "=== Deploying $APP_NAME to CapRover ==="

# Login to CapRover
echo "Logging in..."
TOKEN=$(curl -s -X POST "$CAPROVER_URL/api/v2/login" \
  -H "Content-Type: application/json" \
  -H "x-namespace: captain" \
  -d '{"password":"7EvaYLj689"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Login failed!"
  exit 1
fi
echo "Login successful"

# Check if app exists, create if not
echo "Checking app..."
APP_EXISTS=$(curl -s "$CAPROVER_URL/api/v2/user/apps/appDefinitions" \
  -H "x-captain-auth: $TOKEN" \
  -H "x-namespace: captain" | grep -o "\"appName\":\"$APP_NAME\"")

if [ -z "$APP_EXISTS" ]; then
  echo "Creating app $APP_NAME..."
  curl -s -X POST "$CAPROVER_URL/api/v2/user/apps/appDefinitions/register" \
    -H "x-captain-auth: $TOKEN" \
    -H "x-namespace: captain" \
    -H "Content-Type: application/json" \
    -d "{\"appName\":\"$APP_NAME\",\"hasPersistentData\":false}"
fi

# Create tarball
echo "Creating tarball..."
cd "$(dirname "$0")"
tar -czf /tmp/og-image.tar.gz --exclude=node_modules --exclude=.next --exclude=.git .

# Deploy
echo "Deploying..."
DEPLOY_RESULT=$(curl -s -X POST "$CAPROVER_URL/api/v2/user/apps/appData/$APP_NAME" \
  -H "x-captain-auth: $TOKEN" \
  -H "x-namespace: captain" \
  -F "sourceFile=@/tmp/og-image.tar.gz")

echo "Deploy result: $DEPLOY_RESULT"

# Wait for build
echo "Waiting for build..."
sleep 30

# Enable SSL and set domain
echo "Setting up domain..."
curl -s -X POST "$CAPROVER_URL/api/v2/user/apps/appDefinitions/update" \
  -H "x-captain-auth: $TOKEN" \
  -H "x-namespace: captain" \
  -H "Content-Type: application/json" \
  -d "{
    \"appName\":\"$APP_NAME\",
    \"instanceCount\":1,
    \"captainDefinitionRelativeFilePath\":\"./captain-definition\",
    \"notExposeAsWebApp\":false,
    \"forceSsl\":true,
    \"containerHttpPort\":3000
  }"

# Add custom domain if not exists
echo "Adding custom domain $DOMAIN..."
curl -s -X POST "$CAPROVER_URL/api/v2/user/apps/appDefinitions/customdomain" \
  -H "x-captain-auth: $TOKEN" \
  -H "x-namespace: captain" \
  -H "Content-Type: application/json" \
  -d "{\"appName\":\"$APP_NAME\",\"customDomain\":\"$DOMAIN\"}"

# Enable SSL for custom domain
sleep 5
curl -s -X POST "$CAPROVER_URL/api/v2/user/apps/appDefinitions/enablecustomdomainssl" \
  -H "x-captain-auth: $TOKEN" \
  -H "x-namespace: captain" \
  -H "Content-Type: application/json" \
  -d "{\"appName\":\"$APP_NAME\",\"customDomain\":\"$DOMAIN\"}"

# Cleanup
rm -f /tmp/og-image.tar.gz

echo ""
echo "=== Deploy Complete ==="
echo "App URL: https://$DOMAIN"
echo "Test: https://$DOMAIN/api/og?text=Hello&output=image"
