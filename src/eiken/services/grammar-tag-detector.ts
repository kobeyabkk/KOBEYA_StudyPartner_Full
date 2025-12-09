/**
 * Phase 6: Grammar Tag Detection Layer
 * 
 * 問題文から文法タグを自動検出し、解説生成に活用する
 */

export type GrammarTag =
  | 'conditional_clause'
  | 'present_for_future'
  | 'third_person_singular'
  | 'present_simple_habit'
  | 'present_perfect'
  | 'passive_voice'
  | 'verb_taking_gerund'
  | 'verb_taking_infinitive'
  | 'past_simple'
  | 'past_continuous'
  | 'future_will'
  | 'future_be_going_to'
  | 'comparative'
  | 'superlative'
  | 'modal_can'
  | 'modal_must'
  | 'modal_should'
  | 'relative_clause'
  | 'question_form'
  | 'negative_form';

interface TagDetectionRule {
  tag: GrammarTag;
  keywords: string[];
  regex?: RegExp;
  priority: number;
}

/**
 * 文法タグ検出ルール定義
 */
const DETECTION_RULES: TagDetectionRule[] = [
  // 条件節（if, when + 未来）
  {
    tag: 'conditional_clause',
    keywords: ['if', 'when', 'before', 'after', 'until', 'as soon as'],
    regex: /\b(if|when|before|after|until|as soon as)\b.*(tomorrow|next|will)/i,
    priority: 10,
  },
  {
    tag: 'present_for_future',
    keywords: ['if', 'when', 'tomorrow', 'next'],
    regex: /\b(if|when)\b.*\b(tomorrow|next\s+(week|month|year))/i,
    priority: 9,
  },
  
  // 3人称単数
  {
    tag: 'third_person_singular',
    keywords: ['he', 'she', 'it'],
    regex: /\b(he|she|it)\s+_____/i,
    priority: 8,
  },
  
  // 現在形（習慣）
  {
    tag: 'present_simple_habit',
    keywords: ['every', 'always', 'usually', 'often', 'sometimes', 'never'],
    regex: /\b(every\s+(day|week|month|year|morning|night)|always|usually|often|sometimes|never)\b/i,
    priority: 7,
  },
  
  // 過去形
  {
    tag: 'past_simple',
    keywords: ['yesterday', 'last', 'ago'],
    regex: /\b(yesterday|last\s+(week|month|year|night)|(\d+\s+(days?|weeks?|months?|years?))\s+ago)\b/i,
    priority: 8,
  },
  
  // 現在完了
  {
    tag: 'present_perfect',
    keywords: ['have', 'has', 'since', 'for', 'already', 'yet', 'just', 'ever', 'never'],
    regex: /\b(have|has)\s+(already|just|ever|never|been|gone)\b|since\s+\d{4}|for\s+\d+\s+(years?|months?)/i,
    priority: 9,
  },
  
  // 受動態
  {
    tag: 'passive_voice',
    keywords: ['by'],
    regex: /\b(is|are|was|were|been)\s+\w+(ed|en)\s+by\b/i,
    priority: 8,
  },
  
  // 動名詞
  {
    tag: 'verb_taking_gerund',
    keywords: ['enjoy', 'finish', 'stop', 'mind', 'avoid', 'keep'],
    regex: /\b(enjoy|finish|stop|mind|avoid|keep|consider|suggest)\s+_____/i,
    priority: 9,
  },
  
  // 不定詞
  {
    tag: 'verb_taking_infinitive',
    keywords: ['want', 'need', 'decide', 'hope', 'plan', 'expect'],
    regex: /\b(want|need|decide|hope|plan|expect|promise|refuse)\s+to\s+_____/i,
    priority: 9,
  },
  
  // 未来形（will）
  {
    tag: 'future_will',
    keywords: ['will', 'tomorrow', 'next'],
    regex: /\bwill\s+_____|\b(tomorrow|next\s+(week|month|year))\b/i,
    priority: 7,
  },
  
  // 未来形（be going to）
  {
    tag: 'future_be_going_to',
    keywords: ['going to'],
    regex: /\b(am|is|are)\s+going\s+to\s+_____/i,
    priority: 8,
  },
  
  // 比較級
  {
    tag: 'comparative',
    keywords: ['than', 'more'],
    regex: /\b(er\s+than|more\s+\w+\s+than)\b/i,
    priority: 7,
  },
  
  // 最上級
  {
    tag: 'superlative',
    keywords: ['the most', 'the best', 'the worst'],
    regex: /\bthe\s+(most|best|worst|\w+est)\b/i,
    priority: 7,
  },
  
  // 助動詞
  {
    tag: 'modal_can',
    keywords: ['can'],
    regex: /\bcan\s+_____/i,
    priority: 6,
  },
  {
    tag: 'modal_must',
    keywords: ['must'],
    regex: /\bmust\s+_____/i,
    priority: 6,
  },
  {
    tag: 'modal_should',
    keywords: ['should'],
    regex: /\bshould\s+_____/i,
    priority: 6,
  },
  
  // 疑問文
  {
    tag: 'question_form',
    keywords: ['?'],
    regex: /^(Do|Does|Did|Is|Are|Was|Were|Will|Can|Should|Must|Have|Has)\b.*\?/i,
    priority: 5,
  },
  
  // 否定文
  {
    tag: 'negative_form',
    keywords: ["don't", "doesn't", "didn't", 'not'],
    regex: /\b(do\s+not|does\s+not|did\s+not|don't|doesn't|didn't|is\s+not|are\s+not|was\s+not|were\s+not)\b/i,
    priority: 5,
  },
];

/**
 * 問題文から文法タグを検出
 * 
 * @param questionText - 問題文（空欄を含む）
 * @param choices - 選択肢
 * @param correctAnswer - 正解
 * @returns 検出された文法タグのリスト（優先度順）
 */
export function detectGrammarTags(
  questionText: string,
  choices: string[],
  correctAnswer: string
): GrammarTag[] {
  const detectedTags: Array<{ tag: GrammarTag; priority: number }> = [];
  const fullText = `${questionText} ${choices.join(' ')} ${correctAnswer}`.toLowerCase();
  
  for (const rule of DETECTION_RULES) {
    let matched = false;
    
    // キーワードマッチング
    if (rule.keywords.some(keyword => fullText.includes(keyword.toLowerCase()))) {
      matched = true;
    }
    
    // 正規表現マッチング（より厳密）
    if (rule.regex && rule.regex.test(questionText + ' ' + correctAnswer)) {
      matched = true;
      // regex マッチの場合は優先度を上げる
      detectedTags.push({ tag: rule.tag, priority: rule.priority + 1 });
      continue;
    }
    
    if (matched) {
      detectedTags.push({ tag: rule.tag, priority: rule.priority });
    }
  }
  
  // 優先度順にソートして重複を削除
  const uniqueTags = Array.from(
    new Set(detectedTags.sort((a, b) => b.priority - a.priority).map(t => t.tag))
  );
  
  // デバッグログ
  console.log('[GrammarTagDetector] Detected tags:', uniqueTags);
  
  return uniqueTags;
}

/**
 * タグに対応する日本語の文法用語を取得
 */
export function getGrammarTermForTag(tag: GrammarTag): string {
  const termMap: Record<GrammarTag, string> = {
    conditional_clause: 'if節（条件節）',
    present_for_future: '時・条件の副詞節',
    third_person_singular: '3単現のs',
    present_simple_habit: '現在形（習慣）',
    present_perfect: '現在完了形',
    passive_voice: '受動態（受け身）',
    verb_taking_gerund: '動名詞',
    verb_taking_infinitive: '不定詞',
    past_simple: '過去形',
    past_continuous: '過去進行形',
    future_will: '未来形（will）',
    future_be_going_to: '未来形（be going to）',
    comparative: '比較級',
    superlative: '最上級',
    modal_can: '助動詞（can）',
    modal_must: '助動詞（must）',
    modal_should: '助動詞（should）',
    relative_clause: '関係代名詞',
    question_form: '疑問文',
    negative_form: '否定文',
  };
  
  return termMap[tag] || tag;
}

/**
 * タグから文法ルールIDを取得（DBクエリ用）
 */
export function getGrammarRuleIdsForTags(tags: GrammarTag[]): string[] {
  const ruleIdMap: Record<GrammarTag, string[]> = {
    conditional_clause: ['H3-019', 'JHS2-012'],
    present_for_future: ['H3-019'],
    third_person_singular: ['ELEM-005', 'JHS1-003'],
    present_simple_habit: ['JHS1-002', 'JHS1-003'],
    present_perfect: ['JHS3-010', 'JHS3-011'],
    passive_voice: ['JHS3-007', 'JHS3-008'],
    verb_taking_gerund: ['JHS2-015', 'JHS3-014'],
    verb_taking_infinitive: ['JHS2-013', 'JHS2-014'],
    past_simple: ['JHS1-006', 'JHS1-007'],
    past_continuous: ['JHS2-005'],
    future_will: ['JHS1-010', 'JHS1-011'],
    future_be_going_to: ['JHS2-004'],
    comparative: ['JHS2-009', 'JHS2-010'],
    superlative: ['JHS2-011'],
    modal_can: ['JHS1-008'],
    modal_must: ['JHS2-016', 'JHS3-015'],
    modal_should: ['JHS3-016'],
    relative_clause: ['JHS3-019', 'JHS3-020'],
    question_form: ['JHS1-001'],
    negative_form: ['JHS1-004', 'JHS1-005'],
  };
  
  const ruleIds: string[] = [];
  for (const tag of tags) {
    if (ruleIdMap[tag]) {
      ruleIds.push(...ruleIdMap[tag]);
    }
  }
  
  return Array.from(new Set(ruleIds)); // 重複削除
}
