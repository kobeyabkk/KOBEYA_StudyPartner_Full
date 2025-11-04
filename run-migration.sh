#!/bin/bash

# Script to run database migration via API endpoint
# Usage: ./run-migration.sh [dev|prod]

ENV=${1:-dev}

if [ "$ENV" = "prod" ]; then
    URL="https://kobeyabkk-studypartner.pages.dev/api/admin/migrate-db"
else
    URL="https://dev.kobeyabkk-studypartner.pages.dev/api/admin/migrate-db"
fi

echo "🔧 Running database migration on $ENV environment..."
echo "📡 Endpoint: $URL"
echo ""

response=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -w "\nHTTP_STATUS:%{http_code}\n")

http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS/d')

echo "📥 Response (HTTP $http_status):"
echo "$body" | jq '.' 2>/dev/null || echo "$body"

if [ "$http_status" = "200" ]; then
    echo ""
    echo "✅ Migration completed successfully!"
else
    echo ""
    echo "❌ Migration failed with HTTP status: $http_status"
    exit 1
fi
