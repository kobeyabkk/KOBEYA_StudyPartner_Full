/**
 * 活用形展開スクリプト (Inflection Expander)
 * 
 * 目的: CEFR-J語彙リストの基本形を全ての活用形に展開する
 * 対象: 動詞、名詞、形容詞の活用形を生成
 * 
 * 処理フロー:
 * 1. 不規則変化リストを読み込み
 * 2. 基本形から規則的な変化形を生成
 * 3. 不規則形は事前定義されたリストを使用
 * 4. 展開済み語彙をJSON形式で出力
 */

import irregularVerbs from '../data/irregular-verbs.json' with { type: 'json' };
import irregularNouns from '../data/irregular-nouns.json' with { type: 'json' };
import irregularAdjectives from '../data/irregular-adjectives.json' with { type: 'json' };

// ========================================
// 型定義
// ========================================

interface VocabEntry {
  base: string;
  pos: 'verb' | 'noun' | 'adjective' | 'adverb' | 'other';
  cefr_level: string;
  eiken_grade: string;
}

interface ExpandedVocabEntry extends VocabEntry {
  forms: string[];
  expansion_type: 'irregular' | 'regular';
  note?: string;
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * 最後の文字を取得
 */
function lastChar(word: string): string {
  return word.slice(-1);
}

/**
 * 最後の2文字を取得
 */
function lastTwoChars(word: string): string {
  return word.slice(-2);
}

/**
 * 母音かどうかをチェック
 */
function isVowel(char: string): boolean {
  return ['a', 'e', 'i', 'o', 'u'].includes(char.toLowerCase());
}

/**
 * 子音かどうかをチェック
 */
function isConsonant(char: string): boolean {
  return !isVowel(char) && /[a-z]/i.test(char);
}

// ========================================
// 動詞の活用形展開
// ========================================

/**
 * 規則動詞の活用形を生成
 * 
 * ルール:
 * - 3人称単数現在: -s, -es, -ies
 * - 現在分詞: -ing (doubling rules適用)
 * - 過去形/過去分詞: -ed (doubling rules適用)
 */
function expandRegularVerb(base: string): string[] {
  const forms: string[] = [base];
  
  // === 3人称単数現在形 (-s, -es, -ies) ===
  if (base.endsWith('s') || base.endsWith('x') || base.endsWith('z') || 
      base.endsWith('ch') || base.endsWith('sh') || base.endsWith('o')) {
    // watches, goes, fixes, buzzes
    forms.push(base + 'es');
  } else if (base.endsWith('y') && base.length > 1 && isConsonant(base[base.length - 2])) {
    // study → studies, fly → flies
    forms.push(base.slice(0, -1) + 'ies');
  } else {
    // plays, runs, eats
    forms.push(base + 's');
  }
  
  // === 現在分詞 (-ing) ===
  if (base.endsWith('e') && !base.endsWith('ee') && !base.endsWith('ye') && !base.endsWith('oe')) {
    // make → making, come → coming
    forms.push(base.slice(0, -1) + 'ing');
  } else if (base.length >= 3 && 
             base.length <= 5 &&  // 短い語のみ（2音節以下の推定）
             isConsonant(lastChar(base)) && 
             isVowel(base[base.length - 2]) && 
             isConsonant(base[base.length - 3]) &&
             !['w', 'x', 'y'].includes(lastChar(base))) {
    // run → running, stop → stopping (doubling)
    forms.push(base + lastChar(base) + 'ing');
  } else {
    // play → playing, eat → eating, answer → answering
    forms.push(base + 'ing');
  }
  
  // === 過去形/過去分詞 (-ed) ===
  if (base.endsWith('e')) {
    // like → liked, love → loved
    forms.push(base + 'd');
  } else if (base.endsWith('y') && base.length > 1 && isConsonant(base[base.length - 2])) {
    // study → studied, cry → cried
    forms.push(base.slice(0, -1) + 'ied');
  } else if (base.length >= 3 && 
             base.length <= 5 &&  // 短い語のみ（2音節以下の推定）
             isConsonant(lastChar(base)) && 
             isVowel(base[base.length - 2]) && 
             isConsonant(base[base.length - 3]) &&
             !['w', 'x', 'y'].includes(lastChar(base))) {
    // stop → stopped (doubling)
    forms.push(base + lastChar(base) + 'ed');
  } else {
    // play → played, clean → cleaned, answer → answered
    forms.push(base + 'ed');
  }
  
  return forms;
}

/**
 * 不規則動詞の活用形を取得
 */
function expandIrregularVerb(base: string): string[] | null {
  const irregular = irregularVerbs.irregular_verbs.find(v => v.base === base);
  if (irregular) {
    return [irregular.base, ...irregular.forms];
  }
  return null;
}

/**
 * 動詞の活用形を展開（不規則優先）
 */
export function expandVerb(base: string): string[] {
  // 1. 不規則動詞をチェック
  const irregular = expandIrregularVerb(base);
  if (irregular) {
    return irregular;
  }
  
  // 2. 規則動詞として展開
  return expandRegularVerb(base);
}

// ========================================
// 名詞の複数形展開
// ========================================

/**
 * 規則名詞の複数形を生成
 * 
 * ルール:
 * - 通常: -s (book → books)
 * - s/x/z/ch/sh/o終わり: -es (box → boxes)
 * - 子音+y: y→ies (country → countries)
 * - f/fe終わり: f/fe→ves (knife → knives)
 */
function expandRegularNoun(base: string): string[] {
  const forms: string[] = [base];
  
  if (base.endsWith('s') || base.endsWith('x') || base.endsWith('z') || 
      base.endsWith('ch') || base.endsWith('sh')) {
    // boxes, watches, buses
    forms.push(base + 'es');
  } else if (base.endsWith('o') && base.length > 1 && isConsonant(base[base.length - 2])) {
    // tomato → tomatoes, hero → heroes
    // NOTE: pianoなど例外もあるが、大半はこのルール
    forms.push(base + 'es');
  } else if (base.endsWith('y') && base.length > 1 && isConsonant(base[base.length - 2])) {
    // country → countries, baby → babies
    forms.push(base.slice(0, -1) + 'ies');
  } else if (base.endsWith('f')) {
    // leaf → leaves, knife → knives (fのみ)
    forms.push(base.slice(0, -1) + 'ves');
  } else if (base.endsWith('fe')) {
    // life → lives, wife → wives
    forms.push(base.slice(0, -2) + 'ves');
  } else {
    // books, pens, dogs
    forms.push(base + 's');
  }
  
  return forms;
}

/**
 * 不規則名詞の複数形を取得
 */
function expandIrregularNoun(base: string): string[] | null {
  const irregular = irregularNouns.irregular_nouns.find(n => n.base === base);
  if (irregular) {
    return [irregular.base, ...irregular.forms];
  }
  return null;
}

/**
 * 名詞の複数形を展開（不規則優先）
 */
export function expandNoun(base: string): string[] {
  // 1. 不規則名詞をチェック
  const irregular = expandIrregularNoun(base);
  if (irregular) {
    return irregular;
  }
  
  // 2. 規則名詞として展開
  return expandRegularNoun(base);
}

// ========================================
// 形容詞の比較級・最上級展開
// ========================================

/**
 * 規則形容詞の比較級・最上級を生成
 * 
 * ルール:
 * - 短い語（1音節、2音節の一部）: -er, -est
 * - 長い語（2音節以上）: more, most
 */
function expandRegularAdjective(base: string): string[] {
  const forms: string[] = [base];
  
  // 簡易的な判定: 短い語（6文字以下）は -er/-est
  if (base.length <= 6) {
    if (base.endsWith('e')) {
      // nice → nicer → nicest
      forms.push(base + 'r', base + 'st');
    } else if (base.endsWith('y') && base.length > 1 && isConsonant(base[base.length - 2])) {
      // happy → happier → happiest
      forms.push(base.slice(0, -1) + 'ier', base.slice(0, -1) + 'iest');
    } else if (base.length >= 3 && 
               base.length <= 4 &&  // 非常に短い語のみ（1音節）
               isConsonant(lastChar(base)) && 
               isVowel(base[base.length - 2]) && 
               isConsonant(base[base.length - 3]) &&
               !['w', 'x', 'y'].includes(lastChar(base))) {
      // big → bigger → biggest (doubling)
      forms.push(base + lastChar(base) + 'er', base + lastChar(base) + 'est');
    } else {
      // small → smaller → smallest
      forms.push(base + 'er', base + 'est');
    }
  } else {
    // beautiful → more beautiful → most beautiful
    forms.push('more ' + base, 'most ' + base);
  }
  
  return forms;
}

/**
 * 不規則形容詞の比較級・最上級を取得
 */
function expandIrregularAdjective(base: string): string[] | null {
  const irregular = irregularAdjectives.irregular_adjectives.find(a => a.base === base);
  if (irregular) {
    return [irregular.base, ...irregular.forms];
  }
  return null;
}

/**
 * 形容詞の比較級・最上級を展開（不規則優先）
 */
export function expandAdjective(base: string): string[] {
  // 1. 不規則形容詞をチェック
  const irregular = expandIrregularAdjective(base);
  if (irregular) {
    return irregular;
  }
  
  // 2. 規則形容詞として展開
  return expandRegularAdjective(base);
}

// ========================================
// メイン展開関数
// ========================================

/**
 * 語彙エントリーを展開
 */
export function expandVocabEntry(entry: VocabEntry): ExpandedVocabEntry {
  let forms: string[];
  let expansion_type: 'irregular' | 'regular';
  let note: string | undefined;
  
  switch (entry.pos) {
    case 'verb':
      const irregularVerb = expandIrregularVerb(entry.base);
      if (irregularVerb) {
        forms = irregularVerb;
        expansion_type = 'irregular';
        note = 'Irregular verb';
      } else {
        forms = expandRegularVerb(entry.base);
        expansion_type = 'regular';
      }
      break;
      
    case 'noun':
      const irregularNoun = expandIrregularNoun(entry.base);
      if (irregularNoun) {
        forms = irregularNoun;
        expansion_type = 'irregular';
        note = 'Irregular noun';
      } else {
        forms = expandRegularNoun(entry.base);
        expansion_type = 'regular';
      }
      break;
      
    case 'adjective':
      const irregularAdj = expandIrregularAdjective(entry.base);
      if (irregularAdj) {
        forms = irregularAdj;
        expansion_type = 'irregular';
        note = 'Irregular adjective';
      } else {
        forms = expandRegularAdjective(entry.base);
        expansion_type = 'regular';
      }
      break;
      
    default:
      // adverb, other などは基本形のみ
      forms = [entry.base];
      expansion_type = 'regular';
      note = 'No inflection';
  }
  
  return {
    ...entry,
    forms,
    expansion_type,
    note
  };
}

/**
 * 複数の語彙エントリーを一括展開
 */
export function expandVocabList(entries: VocabEntry[]): ExpandedVocabEntry[] {
  return entries.map(expandVocabEntry);
}

// ========================================
// テスト用サンプルデータ（A1動詞10個）
// ========================================

const TEST_SAMPLE_A1_VERBS: VocabEntry[] = [
  // 不規則動詞
  { base: 'go', pos: 'verb', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'eat', pos: 'verb', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'have', pos: 'verb', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'come', pos: 'verb', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'see', pos: 'verb', cefr_level: 'A1', eiken_grade: '5' },
  
  // 規則動詞
  { base: 'play', pos: 'verb', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'study', pos: 'verb', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'watch', pos: 'verb', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'stop', pos: 'verb', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'like', pos: 'verb', cefr_level: 'A1', eiken_grade: '5' },
];

const TEST_SAMPLE_A1_NOUNS: VocabEntry[] = [
  // 不規則名詞
  { base: 'child', pos: 'noun', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'person', pos: 'noun', cefr_level: 'A1', eiken_grade: '5' },
  
  // 規則名詞
  { base: 'book', pos: 'noun', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'box', pos: 'noun', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'city', pos: 'noun', cefr_level: 'A1', eiken_grade: '5' },
];

const TEST_SAMPLE_A1_ADJECTIVES: VocabEntry[] = [
  // 不規則形容詞
  { base: 'good', pos: 'adjective', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'bad', pos: 'adjective', cefr_level: 'A1', eiken_grade: '5' },
  
  // 規則形容詞
  { base: 'big', pos: 'adjective', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'happy', pos: 'adjective', cefr_level: 'A1', eiken_grade: '5' },
  { base: 'beautiful', pos: 'adjective', cefr_level: 'A1', eiken_grade: '5' },
];

// ========================================
// CLI実行用のメイン処理
// ========================================

// Deno-specific check
const isMainModule = import.meta.main !== undefined ? import.meta.main : 
  (typeof Deno !== 'undefined' && Deno.mainModule === import.meta.url);

if (isMainModule) {
  console.log('🚀 Inflection Expander - Test Run\n');
  
  // 動詞のテスト
  console.log('=== 📘 VERBS (10 samples) ===\n');
  const expandedVerbs = expandVocabList(TEST_SAMPLE_A1_VERBS);
  expandedVerbs.forEach(entry => {
    console.log(`${entry.base} (${entry.expansion_type}):`);
    console.log(`  Forms: ${entry.forms.join(', ')}`);
    if (entry.note) console.log(`  Note: ${entry.note}`);
    console.log();
  });
  
  // 名詞のテスト
  console.log('=== 📗 NOUNS (5 samples) ===\n');
  const expandedNouns = expandVocabList(TEST_SAMPLE_A1_NOUNS);
  expandedNouns.forEach(entry => {
    console.log(`${entry.base} (${entry.expansion_type}):`);
    console.log(`  Forms: ${entry.forms.join(', ')}`);
    if (entry.note) console.log(`  Note: ${entry.note}`);
    console.log();
  });
  
  // 形容詞のテスト
  console.log('=== 📙 ADJECTIVES (5 samples) ===\n');
  const expandedAdjectives = expandVocabList(TEST_SAMPLE_A1_ADJECTIVES);
  expandedAdjectives.forEach(entry => {
    console.log(`${entry.base} (${entry.expansion_type}):`);
    console.log(`  Forms: ${entry.forms.join(', ')}`);
    if (entry.note) console.log(`  Note: ${entry.note}`);
    console.log();
  });
  
  // 統計
  console.log('=== 📊 STATISTICS ===\n');
  const allExpanded = [...expandedVerbs, ...expandedNouns, ...expandedAdjectives];
  const totalBase = allExpanded.length;
  const totalForms = allExpanded.reduce((sum, entry) => sum + entry.forms.length, 0);
  const irregularCount = allExpanded.filter(e => e.expansion_type === 'irregular').length;
  const regularCount = allExpanded.filter(e => e.expansion_type === 'regular').length;
  
  console.log(`Total base forms: ${totalBase}`);
  console.log(`Total expanded forms: ${totalForms}`);
  console.log(`Expansion rate: ${(totalForms / totalBase).toFixed(2)}x`);
  console.log(`Irregular forms: ${irregularCount} (${((irregularCount / totalBase) * 100).toFixed(1)}%)`);
  console.log(`Regular forms: ${regularCount} (${((regularCount / totalBase) * 100).toFixed(1)}%)`);
  
  // JSON出力
  console.log('\n=== 💾 JSON OUTPUT ===\n');
  const output = {
    metadata: {
      generated_at: new Date().toISOString(),
      total_base_forms: totalBase,
      total_expanded_forms: totalForms,
      expansion_rate: parseFloat((totalForms / totalBase).toFixed(2)),
    },
    verbs: expandedVerbs,
    nouns: expandedNouns,
    adjectives: expandedAdjectives,
  };
  
  console.log(JSON.stringify(output, null, 2));
  
  // ファイルに保存
  const outputPath = './data/a1-expanded-sample.json';
  await Deno.writeTextFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved to: ${outputPath}`);
}
