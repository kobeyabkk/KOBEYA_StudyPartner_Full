#!/bin/bash

# Remote D1 Import Script
# 分割されたSQLファイルを順番にリモートD1にインポートします

set -e  # エラーが発生したら停止

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SQL_DIR="$PROJECT_DIR/data/vocabulary"

echo "🚀 Starting remote D1 import..."
echo "Project: $PROJECT_DIR"
echo "SQL files: $SQL_DIR"
echo ""

# SQLファイルのリストを取得
cd "$SQL_DIR"
sql_files=(cefrj_part_*.sql)
total_files=${#sql_files[@]}

if [ $total_files -eq 0 ]; then
    echo "❌ No SQL files found!"
    exit 1
fi

echo "📁 Found $total_files SQL files to import"
echo ""

# 各ファイルを順番にインポート
success=0
failed=0

for ((i=0; i<total_files; i++)); do
    file="${sql_files[$i]}"
    current=$((i + 1))
    
    echo "[$current/$total_files] Importing: $file"
    
    if npx wrangler d1 execute kobeya-logs-db --remote --file="$SQL_DIR/$file" 2>&1 | grep -q "success"; then
        echo "  ✅ Success"
        ((success++))
    else
        echo "  ❌ Failed"
        ((failed++))
    fi
    
    # Rate limit対策: 少し待つ
    if [ $current -lt $total_files ]; then
        echo "  ⏳ Waiting 2 seconds..."
        sleep 2
    fi
    echo ""
done

echo "═══════════════════════════════════════"
echo "📊 Import Summary"
echo "═══════════════════════════════════════"
echo "Total files: $total_files"
echo "Success: $success ✅"
echo "Failed: $failed ❌"
echo ""

if [ $failed -eq 0 ]; then
    echo "🎉 All files imported successfully!"
    
    # 最終確認
    echo ""
    echo "🔍 Verifying data..."
    npx wrangler d1 execute kobeya-logs-db --remote \
        --command="SELECT COUNT(*) as total FROM eiken_vocabulary_lexicon;"
else
    echo "⚠️  Some files failed to import."
    echo "Please check the errors above."
fi
