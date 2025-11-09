/**
 * PDF分析サービス
 * 英検過去問PDFからテキストを抽出し、構造化データに変換
 */

import type { EikenGrade } from '../types';

export interface PDFAnalysisResult {
  grade: EikenGrade;
  year: number;
  session: string;
  totalPages: number;
  sections: Section[];
  rawText: string;
}

export interface Section {
  sectionNumber: number;
  sectionType: 'vocabulary' | 'grammar' | 'cloze' | 'reading';
  startPage: number;
  endPage: number;
  questions: QuestionExtract[];
}

export interface QuestionExtract {
  questionNumber: number;
  questionText: string;
  choices: string[];
  hasContext?: boolean;
  contextText?: string;
  estimatedDifficulty?: 'easy' | 'medium' | 'hard';
}

/**
 * PDFからテキストを抽出
 */
export async function extractTextFromPDF(
  pdfPath: string
): Promise<string> {
  // pdfplumberなどを使用してテキスト抽出
  // この実装はNode.js環境用のプレースホルダー
  
  throw new Error('PDF extraction not implemented - requires external PDF library');
}

/**
 * 抽出したテキストを構造化
 */
export function parseEikenPDF(
  rawText: string,
  grade: EikenGrade,
  year: number,
  session: string
): PDFAnalysisResult {
  
  const sections: Section[] = [];
  
  // セクション1: 語彙問題を検出
  const vocabSection = extractVocabularySection(rawText);
  if (vocabSection) {
    sections.push(vocabSection);
  }
  
  // セクション2: 長文穴埋めを検出
  const clozeSection = extractClozeSection(rawText);
  if (clozeSection) {
    sections.push(clozeSection);
  }
  
  // セクション3: 長文読解を検出
  const readingSection = extractReadingSection(rawText);
  if (readingSection) {
    sections.push(readingSection);
  }
  
  return {
    grade,
    year,
    session,
    totalPages: estimatePageCount(rawText),
    sections,
    rawText
  };
}

/**
 * 語彙セクション抽出
 */
function extractVocabularySection(text: string): Section | null {
  // パターンマッチングで語彙問題を検出
  const vocabPattern = /\(\d+\)\s+[\s\S]+?\s+\(\s*\)\s+[\s\S]+?\n\s*1\s+\w+\s+2\s+\w+\s+3\s+\w+\s+4\s+\w+/g;
  const matches = text.match(vocabPattern);
  
  if (!matches || matches.length === 0) {
    return null;
  }
  
  const questions: QuestionExtract[] = [];
  
  // 各問題を解析
  matches.forEach((match, index) => {
    const questionNum = index + 1;
    const lines = match.split('\n').filter(l => l.trim());
    
    // 問題文抽出（選択肢の前まで）
    const questionText = lines
      .slice(0, -1)
      .join(' ')
      .replace(/\(\d+\)/, '')
      .trim();
    
    // 選択肢抽出
    const choicesLine = lines[lines.length - 1];
    const choices = choicesLine
      .match(/\d+\s+(\w+)/g)
      ?.map(c => c.replace(/^\d+\s+/, '')) || [];
    
    questions.push({
      questionNumber: questionNum,
      questionText,
      choices
    });
  });
  
  return {
    sectionNumber: 1,
    sectionType: 'vocabulary',
    startPage: 3,
    endPage: 5,
    questions
  };
}

/**
 * 長文穴埋めセクション抽出
 */
function extractClozeSection(text: string): Section | null {
  // パッセージタイトルを検出
  const passagePattern = /^[A-Z][a-zA-Z\s]+$/m;
  
  // 簡易実装 - 実際はより複雑なパースが必要
  return {
    sectionNumber: 2,
    sectionType: 'cloze',
    startPage: 6,
    endPage: 7,
    questions: [] // プレースホルダー
  };
}

/**
 * 長文読解セクション抽出
 */
function extractReadingSection(text: string): Section | null {
  return {
    sectionNumber: 3,
    sectionType: 'reading',
    startPage: 8,
    endPage: 24,
    questions: [] // プレースホルダー
  };
}

/**
 * ページ数推定
 */
function estimatePageCount(text: string): number {
  // フッターのページ番号を検出
  const pageMarkers = text.match(/\d+\s+無断転載/g);
  return pageMarkers ? pageMarkers.length : 24;
}
