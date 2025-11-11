/**
 * CEFR-J Wordlist Ver1.6 → D1インポートスクリプト
 * 7,801語の公式語彙データをeiken_vocabulary_lexiconテーブルに投入
 */

import XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import path from 'path';

interface CEFRJEntry {
  headword: string;
  pos: string;
  cefr: string;
  coreInventory1?: string;
  coreInventory2?: string;
  threshold?: string;
}

interface VocabEntry {
  word_lemma: string;
  pos: string;
  cefr_level: string;
  zipf_score: number | null;
  grade_level: number | null;
  sources: string;
  confidence: number;
}

// CEFRから英検級へのマッピング
function cefrToGrade(cefr: string): number | null {
  const mapping: Record<string, number> = {
    'A1': 5,     // 5級
    'A2': 3,     // 3級
    'B1': 2,     // 2級
    'B2': 11,    // 準1級
    'C1': 1,     // 1級
    'C2': 1      // 1級（C2もC1と同じ扱い）
  };
  return mapping[cefr] || null;
}

// 品詞名の正規化
function normalizePOS(pos: string): string {
  const mapping: Record<string, string> = {
    'verb': 'verb',
    'noun': 'noun',
    'adjective': 'adj',
    'adverb': 'adv',
    'determiner': 'det',
    'preposition': 'prep',
    'conjunction': 'conj',
    'pronoun': 'pron',
    'auxiliary': 'verb',  // 助動詞は動詞扱い
    'interjection': 'other',
    'numeral': 'other'
  };
  
  const normalized = mapping[pos.toLowerCase()];
  return normalized || 'other';
}

// Zipfスコアの推定（頻出度に基づく簡易推定）
function estimateZipf(cefr: string, coreInventory1?: string, coreInventory2?: string): number {
  // CoreInventoryにある語彙は頻出
  if (coreInventory1) return 6.0;  // 非常に頻出
  if (coreInventory2) return 5.0;  // 頻出
  
  // CEFRレベルで推定
  const zipfByLevel: Record<string, number> = {
    'A1': 5.5,
    'A2': 4.5,
    'B1': 4.0,
    'B2': 3.5,
    'C1': 3.0,
    'C2': 2.5
  };
  
  return zipfByLevel[cefr] || 3.0;
}

async function importCEFRJToD1() {
  console.log('📚 Importing CEFR-J Wordlist Ver1.6 to D1...\n');
  
  const excelPath = path.join(process.cwd(), 'data', 'vocabulary', 'CEFR-J_Wordlist_Ver1.6.xlsx');
  
  // Excelファイルを読み込み
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets['ALL'];  // ALLシートを使用
  
  // JSONに変換
  const jsonData = XLSX.utils.sheet_to_json(sheet) as any[];
  
  console.log(`✅ Loaded ${jsonData.length} entries from CEFR-J Wordlist\n`);
  
  // データ変換
  const vocabEntries: VocabEntry[] = jsonData.map(row => {
    const cefr = row['CEFR'] || 'A1';
    
    return {
      word_lemma: row['headword'],
      pos: normalizePOS(row['pos'] || 'other'),
      cefr_level: cefr,
      zipf_score: estimateZipf(cefr, row['CoreInventory 1'], row['CoreInventory 2']),
      grade_level: cefrToGrade(cefr),
      sources: '["CEFR-J"]',
      confidence: 1.0  // 公式データなので高信頼度
    };
  });
  
  console.log('📊 Statistics:');
  console.log(`   Total entries: ${vocabEntries.length}`);
  
  // CEFR分布
  const cefrDist: Record<string, number> = {};
  vocabEntries.forEach(entry => {
    cefrDist[entry.cefr_level] = (cefrDist[entry.cefr_level] || 0) + 1;
  });
  
  console.log('\n   CEFR Distribution:');
  Object.entries(cefrDist).sort().forEach(([level, count]) => {
    const percentage = ((count / vocabEntries.length) * 100).toFixed(1);
    console.log(`     ${level}: ${count} words (${percentage}%)`);
  });
  
  // 品詞分布
  const posDist: Record<string, number> = {};
  vocabEntries.forEach(entry => {
    posDist[entry.pos] = (posDist[entry.pos] || 0) + 1;
  });
  
  console.log('\n   POS Distribution:');
  Object.entries(posDist).sort((a, b) => b[1] - a[1]).forEach(([pos, count]) => {
    const percentage = ((count / vocabEntries.length) * 100).toFixed(1);
    console.log(`     ${pos}: ${count} words (${percentage}%)`);
  });
  
  // SQL生成（バッチインサート形式）
  console.log('\n📝 Generating SQL INSERT statements...');
  
  const batchSize = 500;  // 500語ずつバッチ処理
  const batches: string[] = [];
  
  for (let i = 0; i < vocabEntries.length; i += batchSize) {
    const batch = vocabEntries.slice(i, i + batchSize);
    
    const values = batch.map(entry => {
      const escapedLemma = entry.word_lemma.replace(/'/g, "''");
      return `('${escapedLemma}', '${entry.pos}', '${entry.cefr_level}', ${entry.zipf_score}, ${entry.grade_level}, '${entry.sources}', ${entry.confidence})`;
    }).join(',\n');
    
    const sql = `-- Batch ${Math.floor(i / batchSize) + 1} (${batch.length} entries)\nINSERT INTO eiken_vocabulary_lexicon 
(word_lemma, pos, cefr_level, zipf_score, grade_level, sources, confidence)
VALUES 
${values};`;
    
    batches.push(sql);
  }
  
  // SQLファイルを生成
  const sqlPath = path.join(process.cwd(), 'data', 'vocabulary', 'cefrj_import.sql');
  const sqlContent = `-- CEFR-J Wordlist Ver1.6 Import
-- Total: ${vocabEntries.length} entries
-- Generated: ${new Date().toISOString()}

${batches.join('\n\n')}
`;
  
  writeFileSync(sqlPath, sqlContent);
  
  console.log(`\n✅ SQL file generated: ${sqlPath}`);
  console.log(`   Total batches: ${batches.length}`);
  console.log(`   Total entries: ${vocabEntries.length}`);
  
  // CSVも生成（バックアップ用）
  const csvPath = path.join(process.cwd(), 'data', 'vocabulary', 'cefrj_wordlist.csv');
  const csvContent = [
    'word_lemma,pos,cefr_level,zipf_score,grade_level,sources,confidence',
    ...vocabEntries.map(entry => 
      `${entry.word_lemma},${entry.pos},${entry.cefr_level},${entry.zipf_score},${entry.grade_level},"${entry.sources}",${entry.confidence}`
    )
  ].join('\n');
  
  writeFileSync(csvPath, csvContent);
  
  console.log(`✅ CSV file generated: ${csvPath}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('\n🚀 Next steps:');
  console.log('   1. Review the generated SQL file');
  console.log('   2. Import to D1 with:');
  console.log('      npx wrangler d1 execute kobeya-logs-db --local --file=./data/vocabulary/cefrj_import.sql');
  console.log('   3. Verify data with:');
  console.log('      npx wrangler d1 execute kobeya-logs-db --local --command="SELECT COUNT(*) FROM eiken_vocabulary_lexicon;"');
}

importCEFRJToD1().catch(console.error);
