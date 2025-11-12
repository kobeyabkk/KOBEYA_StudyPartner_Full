/**
 * Text Profiler - 簡易版CVLA実装
 * 
 * CVLA3 (Uchida & Negishi, 2018) のアルゴリズムを参考に
 * テキスト全体のCEFR-Jレベルを推定する
 * 
 * 実装メトリクス（Phase 1版）:
 * - AvrDiff: 語彙の平均難易度
 * - BperA: B/C level語彙の比率
 * - ARI: Automated Readability Index
 */

import nlp from 'compromise';
import type { EikenEnv } from '../types';

export type EikenGrade = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1';
export type CEFRJLevel = 'preA1' | 'A1.1' | 'A1.2' | 'A1.3' | 'A2.1' | 'A2.2' | 'B1.1' | 'B1.2' | 'B2.1' | 'B2.2' | 'C1' | 'C2';

export interface TextProfileResult {
  cefrjLevel: CEFRJLevel;
  numericScore: number;
  isValid: boolean;
  metrics: {
    AvrDiff: number;
    BperA: number;
    ARI: number;
  };
  suggestions: string | null;
}

interface VocabEntry {
  word_lemma: string;
  cefr_level: string;
  grade_level: number | null;
}

/**
 * CEFR levelを数値に変換
 */
function cefrToNumeric(cefr: string): number {
  const mapping: Record<string, number> = {
    'A1': 1,
    'A2': 2,
    'B1': 3,
    'B2': 4,
    'C1': 5,
    'C2': 6
  };
  return mapping[cefr] || 0;
}

/**
 * 数値スコアをCEFR-Jレベルにマッピング
 * 
 * Table 2 from Uchida & Negishi (2018):
 * x < 0.5 → preA1
 * 0.5 ≤ x < 0.84 → A1.1
 * 0.84 ≤ x < 1.17 → A1.2
 * 1.17 ≤ x < 1.5 → A1.3
 * 1.5 ≤ x < 2 → A2.1
 * 2 ≤ x < 2.5 → A2.2
 * 2.5 ≤ x < 3 → B1.1
 * 3 ≤ x < 3.5 → B1.2
 * 3.5 ≤ x < 4 → B2.1
 * 4 ≤ x < 4.5 → B2.2
 * 4.5 ≤ x < 5.5 → C1
 * x ≥ 5.5 → C2
 */
function mapScoreToCEFRJ(score: number): CEFRJLevel {
  if (score < 0.5) return 'preA1';
  if (score < 0.84) return 'A1.1';
  if (score < 1.17) return 'A1.2';
  if (score < 1.5) return 'A1.3';
  if (score < 2) return 'A2.1';
  if (score < 2.5) return 'A2.2';
  if (score < 3) return 'B1.1';
  if (score < 3.5) return 'B1.2';
  if (score < 4) return 'B2.1';
  if (score < 4.5) return 'B2.2';
  if (score < 5.5) return 'C1';
  return 'C2';
}

/**
 * CEFR-JレベルをEiken Gradeに変換
 */
function cefrjToGrade(cefrj: CEFRJLevel): EikenGrade {
  const mapping: Record<CEFRJLevel, EikenGrade> = {
    'preA1': '5',
    'A1.1': '5',
    'A1.2': '5',
    'A1.3': '5',
    'A2.1': '3',
    'A2.2': '3',
    'B1.1': '2',
    'B1.2': '2',
    'B2.1': 'pre1',
    'B2.2': 'pre1',
    'C1': '1',
    'C2': '1'
  };
  return mapping[cefrj] || '3';
}

/**
 * ARI (Automated Readability Index) を計算
 * 
 * ARI = 4.71 * (characters / words) + 0.5 * (words / sentences) - 21.43
 */
function calculateARI(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const characters = text.replace(/\s/g, '').length;
  
  if (sentences.length === 0 || words.length === 0) {
    return 0;
  }
  
  const charsPerWord = characters / words.length;
  const wordsPerSentence = words.length / sentences.length;
  
  const ari = 4.71 * charsPerWord + 0.5 * wordsPerSentence - 21.43;
  
  return Math.max(0, ari);
}

/**
 * テキスト全体のCEFR-Jレベルを推定
 * 
 * 簡易版CVLA実装（3つのメトリクスのみ）:
 * 1. AvrDiff: 語彙の平均難易度
 * 2. BperA: B/C level語彙の比率
 * 3. ARI: Automated Readability Index
 */
export async function analyzeTextProfile(
  text: string,
  targetGrade: EikenGrade,
  env: EikenEnv
): Promise<TextProfileResult> {
  
  console.log(`📊 Text Profile Analysis for Grade ${targetGrade}...`);
  
  // 1. トークナイズ & Lemmatization（vocabulary-analyzerと同じロジック）
  const doc = nlp(text);
  const tokens = doc.terms().out('array');
  
  const lemmas: string[] = [];
  tokens.forEach(token => {
    const verbForm = doc.match(token).verbs().toInfinitive().out('text');
    if (verbForm) {
      lemmas.push(verbForm.toLowerCase());
    } else {
      const nounForm = doc.match(token).nouns().toSingular().out('text');
      if (nounForm) {
        lemmas.push(nounForm.toLowerCase());
      } else {
        lemmas.push(token.toLowerCase());
      }
    }
  });
  
  const uniqueLemmas = [...new Set(lemmas)].filter(lemma => lemma.length > 0 && /^[a-z]+$/.test(lemma));
  
  if (uniqueLemmas.length === 0) {
    return {
      cefrjLevel: 'A1.1',
      numericScore: 0.5,
      isValid: true,
      metrics: { AvrDiff: 0, BperA: 0, ARI: 0 },
      suggestions: null
    };
  }
  
  // 2. D1データベースから語彙情報を取得
  const placeholders = uniqueLemmas.map(() => '?').join(',');
  const vocabData = await env.DB.prepare(`
    SELECT word_lemma, cefr_level, grade_level
    FROM eiken_vocabulary_lexicon
    WHERE word_lemma IN (${placeholders})
    ORDER BY confidence DESC
  `).bind(...uniqueLemmas).all();
  
  const vocabMap = new Map<string, VocabEntry>(
    vocabData.results.map((row: any) => [row.word_lemma, row as VocabEntry])
  );
  
  console.log(`   Found ${vocabData.results.length} words in dictionary (out of ${uniqueLemmas.length} unique)`);
  
  // 3. AvrDiff 計算（語彙の平均難易度）
  let totalDiff = 0;
  let countedWords = 0;
  
  for (const lemma of uniqueLemmas) {
    const vocabInfo = vocabMap.get(lemma);
    if (vocabInfo && vocabInfo.cefr_level) {
      totalDiff += cefrToNumeric(vocabInfo.cefr_level);
      countedWords++;
    }
  }
  
  const AvrDiff = countedWords > 0 ? totalDiff / countedWords : 1.0;
  
  // 4. BperA 計算（B/C level語彙の比率）
  let bLevelCount = 0;
  let aLevelCount = 0;
  
  for (const lemma of uniqueLemmas) {
    const vocabInfo = vocabMap.get(lemma);
    if (vocabInfo && vocabInfo.cefr_level) {
      const level = vocabInfo.cefr_level;
      if (level === 'B1' || level === 'B2' || level === 'C1' || level === 'C2') {
        bLevelCount++;
      } else if (level === 'A1' || level === 'A2') {
        aLevelCount++;
      }
    }
  }
  
  const BperA = aLevelCount > 0 ? bLevelCount / aLevelCount : 0;
  
  // 5. ARI 計算
  const ARI = calculateARI(text);
  
  console.log(`   Metrics: AvrDiff=${AvrDiff.toFixed(2)}, BperA=${BperA.toFixed(2)}, ARI=${ARI.toFixed(2)}`);
  
  // 6. 回帰式でCEFRスコアに変換（CVLA3の式）
  const avrdiff_cefr = Math.min(AvrDiff * 6.417 - 7.184, 7);
  const bpera_cefr = Math.min(BperA * 13.146 + 0.428, 7);
  const ari_cefr = Math.min(ARI * 0.607 - 1.632, 7);
  
  console.log(`   CEFR Scores: AvrDiff=${avrdiff_cefr.toFixed(2)}, BperA=${bpera_cefr.toFixed(2)}, ARI=${ari_cefr.toFixed(2)}`);
  
  // 7. 最終スコア計算（3つの平均）
  // 注: 完全版では8つのメトリクスから最小・最大を除外して平均
  // 簡易版は3つのみなので単純平均
  const finalScore = (avrdiff_cefr + bpera_cefr + ari_cefr) / 3;
  
  // 8. CEFR-Jレベルにマッピング
  const cefrjLevel = mapScoreToCEFRJ(finalScore);
  
  console.log(`   Final Score: ${finalScore.toFixed(2)} → CEFR-J: ${cefrjLevel}`);
  
  // 9. 目標級との比較
  // CEFR-Jレベルを数値に変換（より細かい判定用）
  const cefrjNumeric: Record<CEFRJLevel, number> = {
    'preA1': 0, 'A1.1': 1, 'A1.2': 2, 'A1.3': 3,
    'A2.1': 4, 'A2.2': 5, 'B1.1': 6, 'B1.2': 7,
    'B2.1': 8, 'B2.2': 9, 'C1': 10, 'C2': 11
  };
  
  const targetCEFRJ: Record<EikenGrade, CEFRJLevel> = {
    '5': 'A1.3',      // 5級 ≈ A1
    '4': 'A2.1',      // 4級 ≈ A2
    '3': 'A2.2',      // 3級 ≈ A2
    'pre2': 'B1.1',   // 準2級 ≈ A2-B1
    '2': 'B1.2',      // 2級 ≈ B1
    'pre1': 'B2.1',   // 準1級 ≈ B2
    '1': 'C1'         // 1級 ≈ C1
  };
  
  const targetLevel = cefrjNumeric[targetCEFRJ[targetGrade]];
  const estimatedLevel = cefrjNumeric[cefrjLevel];
  
  // 推定レベルが目標レベルより3段階以上高い場合は不合格
  // 例: 目標がA2.2(5)で推定がC1(10)なら差は5 → 不合格
  // 例: 目標がB2.1(8)で推定がC2(11)なら差は3 → ギリギリ合格
  const isValid = (estimatedLevel - targetLevel) <= 3;
  
  let suggestions: string | null = null;
  if (!isValid) {
    const estimatedGrade = cefrjToGrade(cefrjLevel);
    suggestions = `テキストのレベルが目標級より高すぎます。推定: ${cefrjLevel} (Grade ${estimatedGrade}), 目標: Grade ${targetGrade}`;
  }
  
  return {
    cefrjLevel,
    numericScore: finalScore,
    isValid,
    metrics: {
      AvrDiff,
      BperA,
      ARI
    },
    suggestions
  };
}
