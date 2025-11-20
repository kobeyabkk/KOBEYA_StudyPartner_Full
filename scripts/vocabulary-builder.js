#!/usr/bin/env node

/**
 * Vocabulary Runtime Builder (Day 2実装)
 * 
 * 目的: 既存のeiken_vocabulary_lexiconから、ランタイム最適化された
 *      eiken_vocabulary_runtimeテーブルを生成する
 * 
 * 処理内容:
 * 1. 各word_lemmaごとに最小CEFRレベルを計算
 * 2. 一般的な活用形を生成（-s, -ed, -ing, 複数形など）
 * 3. 略語・特殊ケースを追加（TV, USA, 曜日小文字版など）
 * 4. eiken_vocabulary_runtimeテーブルを作成・投入
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====================
// 設定
// ====================

const OUTPUT_DIR = path.join(__dirname, '../.cache');
const OUTPUT_SQL_FILE = path.join(OUTPUT_DIR, 'runtime-vocabulary.sql');
const OUTPUT_JSON_FILE = path.join(OUTPUT_DIR, 'runtime-vocabulary.json');

// ====================
// 不規則動詞マップ (Day 1から拡張)
// ====================

const IRREGULAR_VERBS = {
  // be動詞
  'am': 'be', 'is': 'be', 'are': 'be', 'was': 'be', 'were': 'be', 'been': 'be', 'being': 'be',
  
  // have
  'has': 'have', 'had': 'have', 'having': 'have',
  
  // do
  'does': 'do', 'did': 'do', 'done': 'do', 'doing': 'do',
  
  // go
  'goes': 'go', 'went': 'go', 'gone': 'go', 'going': 'go',
  
  // get
  'gets': 'get', 'got': 'get', 'gotten': 'get', 'getting': 'get',
  
  // その他の主要な不規則動詞（Day 1で定義済み）
  'makes': 'make', 'made': 'make', 'making': 'make',
  'takes': 'take', 'took': 'take', 'taken': 'take', 'taking': 'take',
  'comes': 'come', 'came': 'come', 'coming': 'come',
  'sees': 'see', 'saw': 'see', 'seen': 'see', 'seeing': 'see',
  'knows': 'know', 'knew': 'know', 'known': 'know', 'knowing': 'know',
  'thinks': 'think', 'thought': 'think', 'thinking': 'think',
  'gives': 'give', 'gave': 'give', 'given': 'give', 'giving': 'give',
  'finds': 'find', 'found': 'find', 'finding': 'find',
  'tells': 'tell', 'told': 'tell', 'telling': 'tell',
  'becomes': 'become', 'became': 'become', 'becoming': 'become',
  'leaves': 'leave', 'left': 'leave', 'leaving': 'leave',
  'feels': 'feel', 'felt': 'feel', 'feeling': 'feel',
  'brings': 'bring', 'brought': 'bring', 'bringing': 'bring',
  'begins': 'begin', 'began': 'begin', 'begun': 'begin', 'beginning': 'begin',
  'keeps': 'keep', 'kept': 'keep', 'keeping': 'keep',
  'holds': 'hold', 'held': 'hold', 'holding': 'hold',
  'writes': 'write', 'wrote': 'write', 'written': 'write', 'writing': 'write',
  'stands': 'stand', 'stood': 'stand', 'standing': 'stand',
  'hears': 'hear', 'heard': 'hear', 'hearing': 'hear',
  'lets': 'let', 'letting': 'let',
  'means': 'mean', 'meant': 'mean', 'meaning': 'mean',
  'sets': 'set', 'setting': 'set',
  'meets': 'meet', 'met': 'meet', 'meeting': 'meet',
  'runs': 'run', 'ran': 'run', 'running': 'run',
  'pays': 'pay', 'paid': 'pay', 'paying': 'pay',
  'sits': 'sit', 'sat': 'sit', 'sitting': 'sit',
  'speaks': 'speak', 'spoke': 'speak', 'spoken': 'speak', 'speaking': 'speak',
  'lies': 'lie', 'lay': 'lie', 'lain': 'lie', 'lying': 'lie',
  'leads': 'lead', 'led': 'lead', 'leading': 'lead',
  'reads': 'read', 'reading': 'read',
  'grows': 'grow', 'grew': 'grow', 'grown': 'grow', 'growing': 'grow',
  'loses': 'lose', 'lost': 'lose', 'losing': 'lose',
  'falls': 'fall', 'fell': 'fall', 'fallen': 'fall', 'falling': 'fall',
  'sends': 'send', 'sent': 'send', 'sending': 'send',
  'builds': 'build', 'built': 'build', 'building': 'build',
  'understands': 'understand', 'understood': 'understand', 'understanding': 'understand',
  'draws': 'draw', 'drew': 'draw', 'drawn': 'draw', 'drawing': 'draw',
  'breaks': 'break', 'broke': 'break', 'broken': 'break', 'breaking': 'break',
  'spends': 'spend', 'spent': 'spend', 'spending': 'spend',
  'cuts': 'cut', 'cutting': 'cut',
  'rises': 'rise', 'rose': 'rise', 'risen': 'rise', 'rising': 'rise',
  'drives': 'drive', 'drove': 'drive', 'driven': 'drive', 'driving': 'drive',
  'buys': 'buy', 'bought': 'buy', 'buying': 'buy',
  'wears': 'wear', 'wore': 'wear', 'worn': 'wear', 'wearing': 'wear',
  'chooses': 'choose', 'chose': 'choose', 'chosen': 'choose', 'choosing': 'choose',
  'seeks': 'seek', 'sought': 'seek', 'seeking': 'seek',
  'throws': 'throw', 'threw': 'throw', 'thrown': 'throw', 'throwing': 'throw',
  'catches': 'catch', 'caught': 'catch', 'catching': 'catch',
  'deals': 'deal', 'dealt': 'deal', 'dealing': 'deal',
  'wins': 'win', 'won': 'win', 'winning': 'win',
  'forgets': 'forget', 'forgot': 'forget', 'forgotten': 'forget', 'forgetting': 'forget',
  'teaches': 'teach', 'taught': 'teach', 'teaching': 'teach',
  'strikes': 'strike', 'struck': 'strike', 'stricken': 'strike', 'striking': 'strike',
  'hangs': 'hang', 'hung': 'hang', 'hanging': 'hang',
  'shakes': 'shake', 'shook': 'shake', 'shaken': 'shake', 'shaking': 'shake',
  'rides': 'ride', 'rode': 'ride', 'ridden': 'ride', 'riding': 'ride',
  'sings': 'sing', 'sang': 'sing', 'sung': 'sing', 'singing': 'sing',
  'bites': 'bite', 'bit': 'bite', 'bitten': 'bite', 'biting': 'bite',
  'hides': 'hide', 'hid': 'hide', 'hidden': 'hide', 'hiding': 'hide',
  'flies': 'fly', 'flew': 'fly', 'flown': 'fly', 'flying': 'fly',
  'fights': 'fight', 'fought': 'fight', 'fighting': 'fight',
  'sleeps': 'sleep', 'slept': 'sleep', 'sleeping': 'sleep',
};

// ====================
// 不規則複数形マップ
// ====================

const IRREGULAR_PLURALS = {
  'children': 'child',
  'people': 'person',
  'men': 'man',
  'women': 'woman',
  'teeth': 'tooth',
  'feet': 'foot',
  'mice': 'mouse',
  'geese': 'goose',
  'sheep': 'sheep',
  'fish': 'fish',
  'deer': 'deer',
  'oxen': 'ox',
};

// ====================
// 略語・特殊ケース
// ====================

const ABBREVIATIONS_AND_SPECIAL = {
  // 一般的な略語
  'tv': 'television',
  'usa': 'america',
  'uk': 'england',
  'mr': 'mister',
  'mrs': 'missus',
  'ms': 'miss',
  'dr': 'doctor',
  
  // 曜日の小文字版（Day 1で見つかった問題）
  'monday': 'Monday',
  'tuesday': 'Tuesday',
  'wednesday': 'Wednesday',
  'thursday': 'Thursday',
  'friday': 'Friday',
  'saturday': 'Saturday',
  'sunday': 'Sunday',
  
  // 月の小文字版
  'january': 'January',
  'february': 'February',
  'march': 'March',
  'april': 'April',
  'may': 'May',
  'june': 'June',
  'july': 'July',
  'august': 'August',
  'september': 'September',
  'october': 'October',
  'november': 'November',
  'december': 'December',
};

// ====================
// ユーティリティ関数
// ====================

/**
 * CEFRレベルを数値にマッピング
 */
function cefrToNumber(level) {
  const mapping = {
    'A1': 1,
    'A2': 2,
    'B1': 3,
    'B2': 4,
    'C1': 5,
    'C2': 6,
  };
  return mapping[level] || 999;
}

/**
 * 数値をCEFRレベルに変換
 */
function numberToCefr(num) {
  const mapping = {
    1: 'A1',
    2: 'A2',
    3: 'B1',
    4: 'B2',
    5: 'C1',
    6: 'C2',
  };
  return mapping[num] || 'C2';
}

/**
 * 規則的な活用形を生成
 */
function generateInflections(baseWord, minLevel) {
  const inflections = new Map();
  
  // 基本形
  inflections.set(baseWord, { lemma: baseWord, level: minLevel });
  
  // 不規則動詞・複数形をチェック
  const irregularVerb = Object.entries(IRREGULAR_VERBS).find(([_, base]) => base === baseWord);
  const irregularPlural = Object.entries(IRREGULAR_PLURALS).find(([_, base]) => base === baseWord);
  
  if (irregularVerb || irregularPlural) {
    // 不規則形は既にマップに含まれているのでスキップ
    return inflections;
  }
  
  // 規則的な活用形を生成
  
  // -s形（三単現、複数形）
  if (baseWord.endsWith('s') || baseWord.endsWith('ss') || 
      baseWord.endsWith('x') || baseWord.endsWith('z') ||
      baseWord.endsWith('ch') || baseWord.endsWith('sh')) {
    inflections.set(baseWord + 'es', { lemma: baseWord, level: minLevel });
  } else if (baseWord.endsWith('y') && baseWord.length > 1 && 
             !'aeiou'.includes(baseWord[baseWord.length - 2])) {
    // 子音 + y → ies
    inflections.set(baseWord.slice(0, -1) + 'ies', { lemma: baseWord, level: minLevel });
  } else {
    inflections.set(baseWord + 's', { lemma: baseWord, level: minLevel });
  }
  
  // -ed形（過去形）
  if (baseWord.endsWith('e')) {
    inflections.set(baseWord + 'd', { lemma: baseWord, level: minLevel });
  } else if (baseWord.endsWith('y') && baseWord.length > 1 && 
             !'aeiou'.includes(baseWord[baseWord.length - 2])) {
    inflections.set(baseWord.slice(0, -1) + 'ied', { lemma: baseWord, level: minLevel });
  } else {
    inflections.set(baseWord + 'ed', { lemma: baseWord, level: minLevel });
  }
  
  // -ing形（進行形）
  if (baseWord.endsWith('e') && !baseWord.endsWith('ee') && !baseWord.endsWith('ie')) {
    inflections.set(baseWord.slice(0, -1) + 'ing', { lemma: baseWord, level: minLevel });
  } else {
    inflections.set(baseWord + 'ing', { lemma: baseWord, level: minLevel });
  }
  
  return inflections;
}

/**
 * SQLファイルを生成
 */
function generateSQL(runtimeVocabulary) {
  const lines = [];
  
  lines.push('-- Runtime Vocabulary Table (Day 2実装)');
  lines.push('-- Generated: ' + new Date().toISOString());
  lines.push('');
  
  // テーブル作成
  lines.push('DROP TABLE IF EXISTS eiken_vocabulary_runtime;');
  lines.push('');
  lines.push('CREATE TABLE eiken_vocabulary_runtime (');
  lines.push('  word_form TEXT PRIMARY KEY NOT NULL,');
  lines.push('  base_lemma TEXT NOT NULL,');
  lines.push('  min_cefr_level TEXT NOT NULL,');
  lines.push('  is_special BOOLEAN DEFAULT 0,');
  lines.push('  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
  lines.push(');');
  lines.push('');
  
  // インデックス作成
  lines.push('CREATE INDEX idx_runtime_lemma ON eiken_vocabulary_runtime(base_lemma);');
  lines.push('CREATE INDEX idx_runtime_level ON eiken_vocabulary_runtime(min_cefr_level);');
  lines.push('');
  
  // データ投入
  lines.push('-- Insert data');
  lines.push('BEGIN TRANSACTION;');
  lines.push('');
  
  let count = 0;
  for (const [wordForm, data] of runtimeVocabulary.entries()) {
    const isSpecial = data.is_special ? 1 : 0;
    lines.push(`INSERT INTO eiken_vocabulary_runtime (word_form, base_lemma, min_cefr_level, is_special) VALUES ('${wordForm}', '${data.lemma}', '${data.level}', ${isSpecial});`);
    count++;
    
    // 1000行ごとにコミット/トランザクション再開
    if (count % 1000 === 0) {
      lines.push('');
      lines.push('COMMIT;');
      lines.push('BEGIN TRANSACTION;');
      lines.push('');
    }
  }
  
  lines.push('');
  lines.push('COMMIT;');
  lines.push('');
  lines.push(`-- Total entries: ${count}`);
  
  return lines.join('\n');
}

/**
 * メイン処理
 */
async function main() {
  console.log('====================================');
  console.log('Vocabulary Runtime Builder (Day 2)');
  console.log('====================================');
  console.log('');
  
  // ダミーデータでテスト（実際はD1から取得）
  console.log('⚠️  Note: このスクリプトは現在ダミーデータを使用しています。');
  console.log('   実際の実装では、D1からデータを取得する必要があります。');
  console.log('');
  
  // サンプルデータ（実際はD1から）
  const lexiconData = [
    { word_lemma: 'like', cefr_level: 'A1', pos: 'verb' },
    { word_lemma: 'like', cefr_level: 'B1', pos: 'prep' },
    { word_lemma: 'play', cefr_level: 'A1', pos: 'verb' },
    { word_lemma: 'play', cefr_level: 'A1', pos: 'noun' },
    { word_lemma: 'help', cefr_level: 'A1', pos: 'verb' },
    { word_lemma: 'go', cefr_level: 'A1', pos: 'verb' },
    { word_lemma: 'morning', cefr_level: 'A1', pos: 'noun' },
    { word_lemma: 'television', cefr_level: 'A1', pos: 'noun' },
  ];
  
  console.log(`📊 処理対象: ${lexiconData.length}語の辞書エントリ`);
  console.log('');
  
  // Step 1: 各lemmaの最小CEFRレベルを計算
  console.log('Step 1: 最小CEFRレベルを計算中...');
  const lemmaMinLevels = new Map();
  
  for (const entry of lexiconData) {
    const currentMin = lemmaMinLevels.get(entry.word_lemma);
    const currentLevel = cefrToNumber(entry.cefr_level);
    
    if (!currentMin || currentLevel < cefrToNumber(currentMin)) {
      lemmaMinLevels.set(entry.word_lemma, entry.cefr_level);
    }
  }
  
  console.log(`  ✅ ${lemmaMinLevels.size}個のユニークな見出し語`);
  console.log('');
  
  // Step 2: 活用形を生成
  console.log('Step 2: 活用形を生成中...');
  const runtimeVocabulary = new Map();
  
  for (const [lemma, minLevel] of lemmaMinLevels.entries()) {
    const inflections = generateInflections(lemma, minLevel);
    for (const [form, data] of inflections.entries()) {
      runtimeVocabulary.set(form, { ...data, is_special: false });
    }
  }
  
  console.log(`  ✅ ${runtimeVocabulary.size}個の単語形式（活用形含む）`);
  console.log('');
  
  // Step 3: 不規則動詞を追加
  console.log('Step 3: 不規則動詞を追加中...');
  let irregularCount = 0;
  for (const [inflected, base] of Object.entries(IRREGULAR_VERBS)) {
    const baseLevel = lemmaMinLevels.get(base);
    if (baseLevel) {
      runtimeVocabulary.set(inflected, { lemma: base, level: baseLevel, is_special: false });
      irregularCount++;
    }
  }
  console.log(`  ✅ ${irregularCount}個の不規則動詞形式`);
  console.log('');
  
  // Step 4: 不規則複数形を追加
  console.log('Step 4: 不規則複数形を追加中...');
  let pluralCount = 0;
  for (const [plural, singular] of Object.entries(IRREGULAR_PLURALS)) {
    const baseLevel = lemmaMinLevels.get(singular);
    if (baseLevel) {
      runtimeVocabulary.set(plural, { lemma: singular, level: baseLevel, is_special: false });
      pluralCount++;
    }
  }
  console.log(`  ✅ ${pluralCount}個の不規則複数形`);
  console.log('');
  
  // Step 5: 略語・特殊ケースを追加
  console.log('Step 5: 略語・特殊ケースを追加中...');
  let specialCount = 0;
  for (const [abbrev, full] of Object.entries(ABBREVIATIONS_AND_SPECIAL)) {
    const baseLevel = lemmaMinLevels.get(full.toLowerCase());
    if (baseLevel) {
      runtimeVocabulary.set(abbrev, { lemma: full.toLowerCase(), level: baseLevel, is_special: true });
      specialCount++;
    } else {
      // デフォルトでA1として扱う（曜日・月名など）
      runtimeVocabulary.set(abbrev, { lemma: full.toLowerCase(), level: 'A1', is_special: true });
      specialCount++;
    }
  }
  console.log(`  ✅ ${specialCount}個の略語・特殊ケース`);
  console.log('');
  
  // 出力ディレクトリを作成
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // SQLファイル生成
  console.log('Step 6: SQLファイル生成中...');
  const sql = generateSQL(runtimeVocabulary);
  fs.writeFileSync(OUTPUT_SQL_FILE, sql, 'utf8');
  console.log(`  ✅ ${OUTPUT_SQL_FILE}`);
  console.log('');
  
  // JSONファイル生成（デバッグ用）
  console.log('Step 7: JSONファイル生成中...');
  const json = JSON.stringify(Array.from(runtimeVocabulary.entries()), null, 2);
  fs.writeFileSync(OUTPUT_JSON_FILE, json, 'utf8');
  console.log(`  ✅ ${OUTPUT_JSON_FILE}`);
  console.log('');
  
  // サマリー
  console.log('====================================');
  console.log('📊 生成完了');
  console.log('====================================');
  console.log(`総単語形式数: ${runtimeVocabulary.size}`);
  console.log(`  - 基本形・活用形: ${runtimeVocabulary.size - irregularCount - pluralCount - specialCount}`);
  console.log(`  - 不規則動詞: ${irregularCount}`);
  console.log(`  - 不規則複数形: ${pluralCount}`);
  console.log(`  - 略語・特殊: ${specialCount}`);
  console.log('');
  console.log('次のステップ:');
  console.log('1. 実際のD1データを取得する処理を追加');
  console.log('2. 生成されたSQLをD1に投入: npx wrangler d1 execute DB --file=.cache/runtime-vocabulary.sql');
  console.log('3. ランタイムコードを新テーブルに対応させる');
  console.log('');
}

// 実行
main().catch(console.error);

export {
  generateInflections,
  cefrToNumber,
  numberToCefr,
};
