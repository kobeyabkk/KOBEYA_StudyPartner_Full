#!/usr/bin/env python3
"""
CEFR-J Wordlist CSV to SQL Converter
CSVデータをeiken_vocabulary_lexiconテーブル用のSQL INSERT文に変換
"""

import csv
import json
import sys
from pathlib import Path

def generate_sql_inserts(csv_path: str, output_sql: str, batch_size: int = 500):
    """
    CSVからSQL INSERT文を生成
    
    Args:
        csv_path: 入力CSVファイルパス
        output_sql: 出力SQLファイルパス
        batch_size: 1つのINSERT文に含める行数
    """
    print(f"📂 Loading CSV: {csv_path}")
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        words = list(reader)
    
    print(f"📊 Loaded {len(words)} words from CSV")
    
    # SQLファイルを開く
    with open(output_sql, 'w', encoding='utf-8') as f:
        # ヘッダーコメント
        f.write("-- ================================================================================\n")
        f.write("-- CEFR-J Wordlist Import\n")
        f.write(f"-- Total words: {len(words)}\n")
        f.write("-- Source: CEFR-J Wordlist Ver1.6\n")
        f.write("-- ================================================================================\n\n")
        
        # 既存データをクリア
        f.write("-- Clear existing data\n")
        f.write("DELETE FROM eiken_vocabulary_lexicon;\n\n")
        
        # バッチごとにINSERT文を生成
        for i in range(0, len(words), batch_size):
            batch = words[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            total_batches = (len(words) + batch_size - 1) // batch_size
            
            f.write(f"-- Batch {batch_num}/{total_batches} ({len(batch)} words)\n")
            f.write("INSERT INTO eiken_vocabulary_lexicon\n")
            f.write("  (word_lemma, pos, cefr_level, sources, confidence)\n")
            f.write("VALUES\n")
            
            for j, word in enumerate(batch):
                word_lemma = word['word'].replace("'", "''")  # SQLエスケープ
                pos = word['pos'].replace("'", "''")
                cefr_level = word['cefr_level']
                
                # JSON配列としてソースを記録
                sources_json = json.dumps(["CEFR-J"])
                
                # 信頼度: CEFR-Jの公式リストなので1.0
                confidence = 1.0
                
                # VALUES行を生成
                values = f"  ('{word_lemma}', '{pos}', '{cefr_level}', '{sources_json}', {confidence})"
                
                if j < len(batch) - 1:
                    values += ","
                else:
                    values += ";"
                
                f.write(values + "\n")
            
            f.write("\n")
            
            print(f"✅ Generated batch {batch_num}/{total_batches}")
    
    print(f"\n💾 SQL file created: {output_sql}")
    print(f"📊 Total INSERT statements: {(len(words) + batch_size - 1) // batch_size}")
    
    # 統計情報を生成
    level_counts = {}
    pos_counts = {}
    for word in words:
        level = word['cefr_level']
        pos = word['pos']
        level_counts[level] = level_counts.get(level, 0) + 1
        pos_counts[pos] = pos_counts.get(pos, 0) + 1
    
    print("\n📊 Statistics by CEFR Level:")
    for level in ['A1', 'A2', 'B1', 'B2']:
        count = level_counts.get(level, 0)
        print(f"   {level}: {count:,} words")
    
    print("\n📊 Statistics by POS:")
    for pos, count in sorted(pos_counts.items(), key=lambda x: -x[1])[:10]:
        print(f"   {pos}: {count:,} words")

def main():
    # パス設定
    base_dir = Path(__file__).parent.parent
    csv_path = base_dir / "data" / "vocabulary" / "cefrj_wordlist_parsed.csv"
    output_sql = base_dir / "migrations" / "0019_import_cefrj_wordlist.sql"
    
    if not csv_path.exists():
        print(f"❌ Error: CSV file not found: {csv_path}")
        print("   Please run convert-cefrj-wordlist.py first")
        sys.exit(1)
    
    try:
        generate_sql_inserts(str(csv_path), str(output_sql), batch_size=500)
        print(f"\n🎉 SQL generation completed successfully!")
        print(f"📁 Output file: {output_sql}")
        print(f"\n🚀 Next step: Run the migration")
        print(f"   wrangler d1 execute kobeya-logs-db --local --file={output_sql.name}")
        return 0
    except Exception as e:
        print(f"❌ Error during SQL generation: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
