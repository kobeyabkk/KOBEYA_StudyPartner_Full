#!/bin/bash
# Execute all vocabulary master batches

DB_NAME="kobeya-logs-db"

echo "🚀 Starting vocabulary master data import..."
echo "📊 Total batches: 8"
echo ""

for i in $(seq -f "%02g" 1 8); do
  echo "📦 Executing batch $i of 8..."
  npx wrangler d1 execute $DB_NAME --file=migrations/vocabulary-batches/batch_${i}.sql
  
  if [ $? -eq 0 ]; then
    echo "   ✅ Batch $i completed"
  else
    echo "   ❌ Batch $i failed"
    exit 1
  fi
  echo ""
done

echo "✨ All batches completed successfully!"
