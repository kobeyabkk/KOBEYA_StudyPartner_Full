#!/bin/bash
# Run database migration for vocabulary annotation system

echo "🚀 Starting Phase 1 Migration: Vocabulary Annotation System"
echo "============================================================"
echo ""

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: wrangler CLI not found"
    echo "Please install: npm install -g wrangler"
    exit 1
fi

# Get D1 database name from wrangler.toml
DB_NAME=$(grep -A 2 "\[\[d1_databases\]\]" wrangler.toml | grep "database_name" | cut -d'"' -f2)

if [ -z "$DB_NAME" ]; then
    echo "❌ Error: Could not find D1 database name in wrangler.toml"
    exit 1
fi

echo "📦 Database: $DB_NAME"
echo ""

# Execute migration
echo "🔧 Executing migration: add_vocabulary_definitions.sql"
wrangler d1 execute "$DB_NAME" --local --file=migrations/add_vocabulary_definitions.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "📊 Verifying schema..."
    wrangler d1 execute "$DB_NAME" --local --command="PRAGMA table_info(eiken_vocabulary_lexicon);"
    echo ""
    echo "📈 Checking sample data..."
    wrangler d1 execute "$DB_NAME" --local --command="SELECT word_lemma, cefr_level, cefr_level_numeric, final_difficulty_score, definition_source FROM eiken_vocabulary_lexicon WHERE cefr_level_numeric >= 40 LIMIT 5;"
else
    echo ""
    echo "❌ Migration failed!"
    exit 1
fi

echo ""
echo "🎉 Phase 1 setup complete!"
echo "Next steps:"
echo "  1. Test annotation system with: npm run dev"
echo "  2. Check browser console for vocabulary_notes"
echo "  3. Verify 📚 markers appear in passages"
