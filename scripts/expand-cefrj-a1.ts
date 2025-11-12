/**
 * CEFR-J A1語彙の完全展開スクリプト
 * 
 * 目的: CEFR-J Wordlistの全A1語彙（1,166語）を活用形に展開
 * 入力: data/cefrj-a1-vocabulary.csv
 * 出力: data/cefrj-a1-expanded.json
 */

import { expandVerb, expandNoun, expandAdjective, expandVocabEntry } from './inflection-expander.ts';

// CSVパーサー
function parseCSV(csvContent: string): Array<Record<string, string>> {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = values[i] || '';
    });
    return record;
  });
}

// 品詞をシステム用に正規化
function normalizePos(pos: string): 'verb' | 'noun' | 'adjective' | 'adverb' | 'other' {
  const posLower = pos.toLowerCase();
  if (posLower === 'verb') return 'verb';
  if (posLower === 'noun') return 'noun';
  if (posLower === 'adj') return 'adjective';
  if (posLower === 'adv') return 'adverb';
  return 'other';
}

// メイン処理
async function main() {
  console.log('🚀 CEFR-J A1 Vocabulary Expansion\n');
  
  // 1. CSVファイルを読み込み
  console.log('📖 Reading CSV file...');
  const csvContent = await Deno.readTextFile('./data/cefrj-a1-vocabulary.csv');
  const records = parseCSV(csvContent);
  console.log(`✅ Loaded ${records.length} A1 vocabulary entries\n`);
  
  // 2. 語彙エントリーに変換
  console.log('🔄 Converting to vocabulary entries...');
  const vocabEntries = records.map(record => ({
    base: record.word_lemma,
    pos: normalizePos(record.pos),
    cefr_level: record.cefr_level,
    eiken_grade: '5', // A1 = 英検5級
    zipf_score: parseFloat(record.zipf_score) || 0,
    sources: record.sources,
    confidence: parseFloat(record.confidence) || 0,
  }));
  
  // 3. 品詞別に集計
  const posCounts: Record<string, number> = {};
  vocabEntries.forEach(entry => {
    posCounts[entry.pos] = (posCounts[entry.pos] || 0) + 1;
  });
  
  console.log('📊 Part of Speech Distribution:');
  Object.entries(posCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pos, count]) => {
      console.log(`  ${pos}: ${count}`);
    });
  console.log();
  
  // 4. 活用形に展開
  console.log('⚙️  Expanding all entries to inflected forms...');
  const expandedEntries = vocabEntries.map(entry => {
    try {
      return expandVocabEntry(entry);
    } catch (error) {
      console.warn(`⚠️  Warning: Failed to expand "${entry.base}" (${entry.pos}):`, error.message);
      return {
        ...entry,
        forms: [entry.base],
        expansion_type: 'regular' as const,
        note: `Expansion failed: ${error.message}`,
      };
    }
  });
  
  // 5. 統計計算
  console.log('📊 Calculating statistics...\n');
  const totalBase = expandedEntries.length;
  const totalForms = expandedEntries.reduce((sum, entry) => sum + entry.forms.length, 0);
  const irregularCount = expandedEntries.filter(e => e.expansion_type === 'irregular').length;
  const regularCount = expandedEntries.filter(e => e.expansion_type === 'regular').length;
  
  // 品詞別の統計
  const statsByPos: Record<string, { base: number; forms: number; irregular: number }> = {};
  expandedEntries.forEach(entry => {
    if (!statsByPos[entry.pos]) {
      statsByPos[entry.pos] = { base: 0, forms: 0, irregular: 0 };
    }
    statsByPos[entry.pos].base++;
    statsByPos[entry.pos].forms += entry.forms.length;
    if (entry.expansion_type === 'irregular') {
      statsByPos[entry.pos].irregular++;
    }
  });
  
  console.log('=== 📊 EXPANSION STATISTICS ===\n');
  console.log(`Total base forms: ${totalBase}`);
  console.log(`Total expanded forms: ${totalForms}`);
  console.log(`Expansion rate: ${(totalForms / totalBase).toFixed(2)}x`);
  console.log(`Irregular forms: ${irregularCount} (${((irregularCount / totalBase) * 100).toFixed(1)}%)`);
  console.log(`Regular forms: ${regularCount} (${((regularCount / totalBase) * 100).toFixed(1)}%)`);
  console.log();
  
  console.log('=== 📊 STATISTICS BY PART OF SPEECH ===\n');
  Object.entries(statsByPos)
    .sort((a, b) => b[1].base - a[1].base)
    .forEach(([pos, stats]) => {
      const expansionRate = (stats.forms / stats.base).toFixed(2);
      const irregularPct = ((stats.irregular / stats.base) * 100).toFixed(1);
      console.log(`${pos}:`);
      console.log(`  Base forms: ${stats.base}`);
      console.log(`  Expanded forms: ${stats.forms}`);
      console.log(`  Expansion rate: ${expansionRate}x`);
      console.log(`  Irregular: ${stats.irregular} (${irregularPct}%)`);
      console.log();
    });
  
  // 6. JSON出力
  const output = {
    metadata: {
      generated_at: new Date().toISOString(),
      source: 'CEFR-J Wordlist Ver1.6',
      cefr_level: 'A1',
      eiken_grade: '5',
      total_base_forms: totalBase,
      total_expanded_forms: totalForms,
      expansion_rate: parseFloat((totalForms / totalBase).toFixed(2)),
      irregular_count: irregularCount,
      regular_count: regularCount,
      statistics_by_pos: statsByPos,
    },
    vocabulary: expandedEntries,
  };
  
  // 7. ファイルに保存
  const outputPath = './data/cefrj-a1-expanded.json';
  await Deno.writeTextFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`✅ Saved to: ${outputPath}`);
  console.log(`📦 File size: ${(JSON.stringify(output).length / 1024).toFixed(1)} KB`);
  
  // 8. サンプル表示（動詞10個）
  console.log('\n=== 📘 SAMPLE: First 10 Verbs ===\n');
  const verbs = expandedEntries.filter(e => e.pos === 'verb').slice(0, 10);
  verbs.forEach(verb => {
    console.log(`${verb.base} (${verb.expansion_type}):`);
    console.log(`  Forms: ${verb.forms.join(', ')}`);
    if (verb.note) console.log(`  Note: ${verb.note}`);
    console.log();
  });
  
  // 9. 不規則形のリスト
  console.log('=== 🔍 IRREGULAR FORMS DETECTED ===\n');
  const irregularEntries = expandedEntries.filter(e => e.expansion_type === 'irregular');
  console.log(`Total irregular forms: ${irregularEntries.length}\n`);
  
  const irregularByPos: Record<string, string[]> = {};
  irregularEntries.forEach(entry => {
    if (!irregularByPos[entry.pos]) {
      irregularByPos[entry.pos] = [];
    }
    irregularByPos[entry.pos].push(entry.base);
  });
  
  Object.entries(irregularByPos).forEach(([pos, words]) => {
    console.log(`${pos} (${words.length}):`);
    console.log(`  ${words.slice(0, 20).join(', ')}${words.length > 20 ? '...' : ''}`);
    console.log();
  });
  
  console.log('✅ A1 vocabulary expansion completed!');
}

// 実行
if (import.meta.main) {
  await main();
}
