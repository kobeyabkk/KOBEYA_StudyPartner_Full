/**
 * Phase 1 PoC: 語彙レベル分析サービス
 * compromise を使用して Lemmatization を実装
 */

import nlp from 'compromise';
import type { EikenEnv } from '../types';

export type EikenGrade = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1';

export interface VocabularyAnalysisResult {
  isValid: boolean;
  totalWords: number;
  uniqueWords: number;
  validWords: number;
  validPercentage: number;
  outOfRangeWords: string[];
  outOfRangeRatio: number;
  suggestions: string | null;
  zipfViolations: string[];
  zipfViolationRatio: number;
}

interface VocabEntry {
  lemma: string;
  cefr_level: string;
  eiken_grade: string | null;
  zipf_score: number | null;
}

/**
 * テキストの語彙レベルを分析
 * 
 * @param text 分析対象のテキスト
 * @param targetGrade 目標級 ('5', '4', '3', 'pre2', '2', 'pre1', '1')
 * @param env Cloudflare環境変数
 * @returns 語彙分析結果
 */
export async function analyzeVocabularyLevel(
  text: string,
  targetGrade: EikenGrade,
  env: EikenEnv
): Promise<VocabularyAnalysisResult> {
  
  console.log(`📊 Analyzing vocabulary for Grade ${targetGrade}...`);
  
  // 1. トークナイズ & Lemmatization（compromise使用）
  const doc = nlp(text);
  const tokens = doc.terms().out('array');
  
  // 各単語を原型（Lemma）に変換
  const lemmas: string[] = [];
  tokens.forEach((token: string) => {
    // 動詞は不定詞形に、名詞は単数形に
    const verbForm = doc.match(token).verbs().toInfinitive().out('text');
    if (verbForm) {
      lemmas.push(verbForm.toLowerCase());
    } else {
      const nounForm = doc.match(token).nouns().toSingular().out('text');
      if (nounForm) {
        lemmas.push(nounForm.toLowerCase());
      } else {
        // その他の品詞はそのまま
        lemmas.push(token.toLowerCase());
      }
    }
  });
  
  const uniqueLemmas = [...new Set(lemmas)].filter(lemma => lemma.length > 0);
  
  console.log(`   Total words: ${lemmas.length}, Unique: ${uniqueLemmas.length}`);
  
  // 2. D1に一括クエリ（高速化）
  if (uniqueLemmas.length === 0) {
    return {
      isValid: true,
      totalWords: 0,
      uniqueWords: 0,
      validWords: 0,
      validPercentage: 100,
      outOfRangeWords: [],
      outOfRangeRatio: 0,
      suggestions: null,
      zipfViolations: [],
      zipfViolationRatio: 0
    };
  }
  
  const placeholders = uniqueLemmas.map(() => '?').join(',');
  const vocabData = await env.DB.prepare(`
    SELECT lemma, cefr_level, eiken_grade, zipf_score
    FROM eiken_vocabulary_lexicon
    WHERE lemma IN (${placeholders})
    ORDER BY source_confidence DESC
  `).bind(...uniqueLemmas).all();
  
  console.log(`   Found ${vocabData.results.length} words in dictionary`);
  
  // 3. レベル判定
  const vocabMap = new Map<string, VocabEntry>(
    vocabData.results.map((row: any) => [row.lemma, row as VocabEntry])
  );
  
  const targetCEFR = getTargetCEFR(targetGrade);
  const targetZipfMin = 3.5; // 頻度閾値
  
  const outOfRange: string[] = [];
  const zipfViolations: string[] = [];
  
  for (const lemma of uniqueLemmas) {
    const vocabInfo = vocabMap.get(lemma);
    
    if (!vocabInfo) {
      // 辞書にない単語（固有名詞、専門用語等）→ 許容
      continue;
    }
    
    // CEFR超過チェック
    if (isAboveCEFR(vocabInfo.cefr_level, targetCEFR)) {
      outOfRange.push(lemma);
    }
    
    // 頻度チェック（低頻度語は避ける）
    if (vocabInfo.zipf_score && vocabInfo.zipf_score < targetZipfMin) {
      zipfViolations.push(lemma);
    }
  }
  
  const outOfRangeRatio = outOfRange.length / uniqueLemmas.length;
  const zipfViolationRatio = zipfViolations.length / uniqueLemmas.length;
  
  console.log(`   Out of range: ${outOfRange.length} (${(outOfRangeRatio * 100).toFixed(1)}%)`);
  console.log(`   Zipf violations: ${zipfViolations.length} (${(zipfViolationRatio * 100).toFixed(1)}%)`);
  
  // 4. 判定（3%ルール + 5% Zipfルール）
  const isValid = outOfRangeRatio < 0.03 && zipfViolationRatio < 0.05;
  const validWords = uniqueLemmas.length - outOfRange.length;
  const validPercentage = (validWords / uniqueLemmas.length) * 100;
  
  return {
    isValid,
    totalWords: lemmas.length,
    uniqueWords: uniqueLemmas.length,
    validWords,
    validPercentage,
    outOfRangeWords: outOfRange,
    outOfRangeRatio,
    suggestions: !isValid && outOfRange.length > 0
      ? `以下の単語を${targetCEFR}レベルに置き換えてください: ${outOfRange.slice(0, 5).join(', ')}`
      : null,
    zipfViolations,
    zipfViolationRatio
  };
}

/**
 * 英検級からCEFRレベルへの変換
 */
export function getTargetCEFR(grade: EikenGrade): string {
  const mapping: Record<EikenGrade, string> = {
    '5': 'A1',
    '4': 'A1',
    '3': 'A2',
    'pre2': 'A2',
    '2': 'B1',
    'pre1': 'B2',
    '1': 'C1'
  };
  return mapping[grade] || 'B1';
}

/**
 * CEFRレベルの比較
 */
function isAboveCEFR(wordLevel: string, targetLevel: string): boolean {
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const wordIndex = levels.indexOf(wordLevel);
  const targetIndex = levels.indexOf(targetLevel);
  
  if (wordIndex === -1 || targetIndex === -1) {
    return false;
  }
  
  return wordIndex > targetIndex;
}
