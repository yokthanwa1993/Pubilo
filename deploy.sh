#!/bin/bash
# Pubilo Deploy Script for CapRover
# Automatically sets port and env vars after deployment

CAPROVER_URL="https://captain.lslly.com"
APP_NAME="pubilo"

# Login and get token
echo "Logging in to CapRover..."
TOKEN=$(curl -s -X POST "$CAPROVER_URL/api/v2/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"7EvaYLj689"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

if [ -z "$TOKEN" ]; then
  echo "Failed to login to CapRover"
  exit 1
fi

echo "Token obtained. Creating deployment tarball..."

# Create tarball
tar -cf /tmp/pubilo.tar --exclude=node_modules --exclude=.git --exclude=.vercel --exclude=dist --exclude='*.lock' --exclude='*.lockb' .

echo "Deploying to CapRover..."
curl -s -X POST "$CAPROVER_URL/api/v2/user/apps/appData/$APP_NAME" \
  -H "x-captain-auth: $TOKEN" \
  -F "sourceFile=@/tmp/pubilo.tar"

echo ""
echo "Setting container port and environment variables..."

# Set container port and env vars
ENV_VARS='[
  {"key": "SUPABASE_URL", "value": "http://supabase-kong:8000"},
  {"key": "NEXT_PUBLIC_SUPABASE_URL", "value": "http://supabase-kong:8000"},
  {"key": "SUPABASE_ANON_KEY", "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY5MDE3Njk3LCJleHAiOjIwODQzNzc2OTd9.NSDlsaOw3WrLAFk_VAJRZogTFbu644a3TIFZzCaFyM0"},
  {"key": "NEXT_PUBLIC_SUPABASE_ANON_KEY", "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY5MDE3Njk3LCJleHAiOjIwODQzNzc2OTd9.NSDlsaOw3WrLAFk_VAJRZogTFbu644a3TIFZzCaFyM0"},
  {"key": "SUPABASE_SERVICE_ROLE_KEY", "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjkwMTc2OTcsImV4cCI6MjA4NDM3NzY5N30.1R_szi20_E_OECKPT-UHyhemgm30bh-i6j7qXjWU6g0"},
  {"key": "SUPABASE_POSTGRES_URL_NON_POOLING", "value": "postgres://postgres:ab5f715bc7249069876c11ff53481550@supabase-db:5432/postgres?sslmode=disable"},
  {"key": "LINE_CHANNEL_ACCESS_TOKEN", "value": "7I+qDwDq20BiD+8b1uSZclHHlgdnkvQJO/M631hqTtdW3cwXOZjAKuislu+ExwokC5yP7dc6nc8A06O8/4h04z/HVC2l32rrrcGWjdxdEC0Dfbs16PJBkXJfKd4J/B7pkWA6OPdYWRLOnE59ipl4jwdB04t89/1O/w1cDnyilFU="},
  {"key": "LINE_CHANNEL_SECRET", "value": "9c9537dc721ace01b4114296d2787be9"},
  {"key": "FREEIMAGE_API_KEY", "value": "6d207e02198a847aa98d0a2a901485a5"},
  {"key": "GEMINI_API_KEY", "value": "AIzaSyBYaUCJ_wwtc3kXgSXuoiStKPBwacjs_Yo"},
  {"key": "PORT", "value": "80"}
]'

curl -s -X POST "$CAPROVER_URL/api/v2/user/apps/appDefinitions/update" \
  -H "x-captain-auth: $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"appName\": \"$APP_NAME\",
    \"instanceCount\": 1,
    \"envVars\": $ENV_VARS
  }"

echo ""
echo "Deployment complete!"
echo "Website: https://pubilo.lslly.com"
