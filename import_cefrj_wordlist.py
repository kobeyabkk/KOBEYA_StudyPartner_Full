#!/usr/bin/env python3
"""
CEFR-J Wordlist Ver1.6.xlsx を解析して vocabulary_master テーブル用のSQL INSERT文を生成
"""

import pandas as pd
import json
import re
from pathlib import Path

# CEFR レベルを数値スコアに変換
CEFR_SCORES = {
    'A1': 1,
    'A2': 2,
    'B1': 3,
    'B2': 4,
    'C1': 5,
    'C2': 6,
    'Pre-A1': 1,
    'A1.1': 1,
    'A1.2': 1,
    'A1.3': 1,
    'A2.1': 2,
    'A2.2': 2,
    'B1.1': 3,
    'B1.2': 3,
    'B2.1': 4,
    'B2.2': 4,
}

# Eiken グレードマッピング（推定）
CEFR_TO_EIKEN = {
    1: 'grade_5',      # A1 → 英検5級
    2: 'grade_4',      # A2 → 英検4級
    3: 'pre_2',        # B1 → 英検準2級
    4: 'grade_2',      # B2 → 英検2級
    5: 'pre_1',        # C1 → 英検準1級
    6: 'grade_1',      # C2 → 英検1級
}

def normalize_cefr_level(level_str):
    """CEFR レベル文字列を正規化"""
    if not level_str or pd.isna(level_str):
        return None
    
    level_str = str(level_str).strip().upper()
    
    # Pre-A1, A1.1 などを A1 に正規化
    if level_str.startswith('PRE-'):
        return 'A1'
    if '.' in level_str:
        return level_str.split('.')[0]
    
    return level_str if level_str in ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] else None

def calculate_difficulty_score(cefr_level, frequency=None):
    """
    難易度スコアを計算 (0-100)
    CEFR レベルと頻度に基づく
    """
    if not cefr_level:
        return 50  # デフォルト
    
    cefr_score = CEFR_SCORES.get(cefr_level, 3)
    
    # CEFR スコアを 0-100 に変換
    # A1=20, A2=35, B1=50, B2=65, C1=80, C2=95
    base_score = 15 + (cefr_score * 15)
    
    # 頻度で微調整（もし利用可能なら）
    if frequency and not pd.isna(frequency):
        try:
            freq_value = float(frequency)
            # 高頻度 = 低難易度
            if freq_value > 1000:
                base_score -= 5
            elif freq_value < 100:
                base_score += 5
        except:
            pass
    
    return min(100, max(0, base_score))

def parse_wordlist(excel_path):
    """Excel ファイルを解析して語彙データを抽出"""
    print(f"📖 Reading Excel file: {excel_path}")
    
    # Excelファイルを読み込み
    xl = pd.ExcelFile(excel_path)
    print(f"📋 Sheets found: {xl.sheet_names}")
    
    # 'ALL' シートを読み込み（すべての語彙が含まれる）
    df = pd.read_excel(excel_path, sheet_name='ALL')
    print(f"📊 Total rows: {len(df)}")
    print(f"📊 Columns: {df.columns.tolist()}")
    
    # 最初の数行を表示
    print("\n📝 First 5 rows:")
    print(df.head())
    
    vocabulary_data = []
    
    for idx, row in df.iterrows():
        # 単語とレベルの列を探す（列名は実際のファイルに合わせて調整）
        word = None
        cefr_level = None
        pos = None
        
        # 列名を確認して適切に割り当て
        for col in df.columns:
            col_lower = str(col).lower()
            if 'word' in col_lower or 'lemma' in col_lower:
                word = row[col]
            elif 'cefr' in col_lower or 'level' in col_lower:
                cefr_level = row[col]
            elif 'pos' in col_lower or 'part' in col_lower:
                pos = row[col]
        
        if not word or pd.isna(word):
            continue
        
        word = str(word).strip().lower()
        
        # CEFR レベルを正規化
        normalized_cefr = normalize_cefr_level(cefr_level)
        if not normalized_cefr:
            continue
        
        cefr_score = CEFR_SCORES.get(normalized_cefr, 3)
        difficulty = calculate_difficulty_score(normalized_cefr)
        eiken_grade = CEFR_TO_EIKEN.get(cefr_score, 'pre_2')
        
        # 品詞を正規化
        if pos and not pd.isna(pos):
            pos_str = str(pos).strip().lower()
        else:
            pos_str = 'unknown'
        
        vocab_entry = {
            'word': word,
            'part_of_speech': pos_str,
            'cefr_level': normalized_cefr,
            'cefr_score': cefr_score,
            'difficulty_score': difficulty,
            'eiken_grade': eiken_grade,
            'frequency_rank': idx + 1,  # 行番号を頻度ランクとして使用
        }
        
        vocabulary_data.append(vocab_entry)
    
    print(f"\n✅ Parsed {len(vocabulary_data)} vocabulary entries")
    
    # レベル別の統計
    level_counts = {}
    for entry in vocabulary_data:
        level = entry['cefr_level']
        level_counts[level] = level_counts.get(level, 0) + 1
    
    print("\n📊 Vocabulary distribution by CEFR level:")
    for level in sorted(level_counts.keys()):
        print(f"  {level}: {level_counts[level]} words")
    
    return vocabulary_data

def generate_sql_inserts(vocabulary_data, output_file):
    """SQL INSERT 文を生成"""
    print(f"\n📝 Generating SQL INSERT statements...")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("-- CEFR-J Wordlist Ver1.6 - Vocabulary Import\n")
        f.write("-- Generated from CEFR-J_Wordlist_Ver1.6.xlsx\n\n")
        
        # バッチ挿入（500単語ずつ）
        batch_size = 500
        for i in range(0, len(vocabulary_data), batch_size):
            batch = vocabulary_data[i:i+batch_size]
            
            f.write(f"-- Batch {i//batch_size + 1}: Words {i+1} to {min(i+batch_size, len(vocabulary_data))}\n")
            f.write("INSERT OR IGNORE INTO vocabulary_master (\n")
            f.write("  word, pos, definition_en, definition_ja,\n")
            f.write("  cefr_level, cefr_score, frequency_rank, final_difficulty_score,\n")
            f.write("  eiken_grade, should_annotate, created_at\n")
            f.write(") VALUES\n")
            
            values = []
            for entry in batch:
                word = entry['word'].replace("'", "''")
                pos = entry['part_of_speech'].replace("'", "''")
                cefr_level = entry['cefr_level']
                cefr_score = entry['cefr_score']
                freq_rank = entry['frequency_rank']
                difficulty = entry['difficulty_score']
                eiken_grade = entry['eiken_grade']
                
                # 難易度40以上はアノテーション対象
                should_annotate = 1 if difficulty >= 40 else 0
                
                value_str = (
                    f"  ('{word}', '{pos}', '', '', "
                    f"'{cefr_level}', {cefr_score}, {freq_rank}, {difficulty}, "
                    f"'{eiken_grade}', {should_annotate}, CURRENT_TIMESTAMP)"
                )
                values.append(value_str)
            
            f.write(",\n".join(values))
            f.write(";\n\n")
    
    print(f"✅ SQL file generated: {output_file}")
    print(f"📊 Total INSERT statements: {len(vocabulary_data)} words")

def main():
    excel_file = Path("/home/user/webapp/CEFR-J_Wordlist_Ver1.6.xlsx")
    output_file = Path("/home/user/webapp/migrations/0019_import_cefrj_wordlist.sql")
    
    if not excel_file.exists():
        print(f"❌ Error: File not found: {excel_file}")
        return
    
    # Excel ファイルを解析
    vocabulary_data = parse_wordlist(excel_file)
    
    if not vocabulary_data:
        print("❌ No vocabulary data extracted!")
        return
    
    # SQL INSERT 文を生成
    generate_sql_inserts(vocabulary_data, output_file)
    
    print("\n🎉 Import script completed successfully!")
    print(f"📂 SQL file: {output_file}")
    print("\n🚀 Next step: Apply migration with:")
    print(f"   npx wrangler d1 execute kobeya-logs-db --local --file={output_file}")

if __name__ == "__main__":
    main()
