/**
 * Phase 1 PoC: 語彙辞書データインポートスクリプト
 * サンプルデータ（100語）をD1にインポート
 */

import { readFileSync } from 'fs';
import { writeFileSync } from 'fs';
import path from 'path';

interface VocabEntry {
  word_lemma: string;
  pos: string;
  cefr_level: string;
  zipf_score: number | null;
  grade_level: number | null;
  sources: string;
  confidence: number;
}

function parseCSV(csvContent: string): VocabEntry[] {
  const lines = csvContent.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const entry: any = {};
    
    headers.forEach((header, index) => {
      const value = values[index];
      
      if (header === 'zipf_score' || header === 'confidence') {
        entry[header] = value ? parseFloat(value) : null;
      } else if (header === 'grade_level') {
        entry[header] = value ? parseInt(value) : null;
      } else {
        entry[header] = value;
      }
    });
    
    return entry as VocabEntry;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

async function importVocabularyData() {
  console.log('📚 Phase 1 PoC: Importing vocabulary data...\n');
  
  // CSV読み込み
  const csvPath = path.join(process.cwd(), 'data', 'vocabulary', 'sample_vocab_poc.csv');
  const csvContent = readFileSync(csvPath, 'utf-8');
  
  const records = parseCSV(csvContent);
  
  console.log(`✅ Loaded ${records.length} vocabulary entries from CSV\n`);
  
  // D1へのインポート（ローカル環境）
  // Wrangler D1 APIを使用
  const insertStatements = records.map(entry => {
    // sourcesをJSON配列形式に変換
    // CSVから ["CEFR-J","NGSL","SVL"] のような形式になっている
    // SQLに埋め込む際は、JSON文字列としてエスケープが必要
    const sourcesJson = entry.sources.replace(/"/g, '""'); // SQL用にダブルクォートをエスケープ
    
    return `INSERT INTO eiken_vocabulary_lexicon 
      (word_lemma, pos, cefr_level, zipf_score, grade_level, sources, confidence)
      VALUES 
      ('${entry.word_lemma}', '${entry.pos}', '${entry.cefr_level}', 
       ${entry.zipf_score}, ${entry.grade_level}, '${sourcesJson}', ${entry.confidence});`;
  });
  
  // SQL生成
  const sqlPath = path.join(process.cwd(), 'data', 'vocabulary', 'import_sample_data.sql');
  const sqlContent = insertStatements.join('\n');
  
  writeFileSync(sqlPath, sqlContent);
  
  console.log(`✅ Generated SQL file: ${sqlPath}`);
  console.log(`📝 Total INSERT statements: ${insertStatements.length}\n`);
  
  // CEFR分布を表示
  const cefrDistribution: Record<string, number> = {};
  records.forEach(entry => {
    cefrDistribution[entry.cefr_level] = (cefrDistribution[entry.cefr_level] || 0) + 1;
  });
  
  console.log('📊 CEFR Distribution:');
  Object.entries(cefrDistribution)
    .sort()
    .forEach(([level, count]) => {
      const percentage = ((count / records.length) * 100).toFixed(1);
      console.log(`   ${level}: ${count} words (${percentage}%)`);
    });
  
  console.log('\n✅ Import preparation complete!');
  console.log('   Next step: Run the following command to import:');
  console.log('   npx wrangler d1 execute kobeya-logs-db --local --file=./data/vocabulary/import_sample_data.sql');
}

importVocabularyData().catch(console.error);
