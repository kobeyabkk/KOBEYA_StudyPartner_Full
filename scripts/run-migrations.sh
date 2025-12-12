#!/bin/bash

# ============================================================
# Database Migration Runner
# ============================================================
# Purpose: Run D1 database migrations in order
# Usage: ./scripts/run-migrations.sh [migration_number]
#        If no migration_number specified, runs all migrations
# ============================================================

set -e  # Exit on error

MIGRATIONS_DIR="migrations"
DB_NAME="kobeya-logs-db"  # Updated to match wrangler.toml

echo "🗄️  D1 Database Migration Runner"
echo "================================"
echo ""

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: wrangler CLI not found"
    echo "Please install: npm install -g wrangler"
    exit 1
fi

# Get migration number from argument or run all
SPECIFIC_MIGRATION=$1

if [ -z "$SPECIFIC_MIGRATION" ]; then
    echo "📋 Running all migrations..."
    MIGRATIONS=$(ls $MIGRATIONS_DIR/*.sql | sort)
else
    echo "📋 Running migration: $SPECIFIC_MIGRATION"
    MIGRATIONS=$(ls $MIGRATIONS_DIR/$SPECIFIC_MIGRATION*.sql)
fi

# Run each migration
for migration in $MIGRATIONS; do
    filename=$(basename "$migration")
    echo ""
    echo "⚙️  Executing: $filename"
    echo "-----------------------------------"
    
    # Execute migration using wrangler d1 execute
    if wrangler d1 execute $DB_NAME --file="$migration" --remote; then
        echo "✅ Success: $filename"
    else
        echo "❌ Failed: $filename"
        exit 1
    fi
done

echo ""
echo "================================"
echo "✨ All migrations completed successfully!"
echo ""
echo "📊 Verify with:"
echo "   wrangler d1 execute $DB_NAME --command='SELECT * FROM users;' --remote"
