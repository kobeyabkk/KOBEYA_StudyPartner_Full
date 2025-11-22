/**
 * 英検級別の文法制約定義
 * 
 * Phase 4B: 文法複雑さの制御
 */

export interface GrammarConstraint {
  grade: string;
  allowedGrammar: string[];
  forbiddenPatterns: Array<{
    pattern: RegExp;
    name: string;
    description: string;
  }>;
  maxWordsPerSentence: number;
  maxClausesPerSentence: number;
}

/**
 * 英検5級の文法制約
 */
const grade5Constraints: GrammarConstraint = {
  grade: '5',
  allowedGrammar: [
    'be動詞（am, is, are）',
    '一般動詞の現在形',
    'can（能力）',
    '命令文',
    '疑問詞（what, who, when, where, how）の疑問文',
    '所有格（my, your, his, her）',
    '代名詞（I, you, he, she, it, we, they）',
    '基本的な前置詞（in, on, at, to, from）',
  ],
  forbiddenPatterns: [
    {
      pattern: /\b(when|if|because|although|while)\s+\w+\s+(is|are|am|was|were|do|does|did|can|will|have|has)\b/i,
      name: '接続詞when/if/because',
      description: '接続詞として使われるwhen, if, becauseは4級以降'
    },
    {
      pattern: /\b(someone|something|anyone|anything|everyone|everything|no one|nothing)\b/i,
      name: '不定代名詞',
      description: 'someone, somethingなどは4級以降'
    },
    {
      pattern: /\b(was|were|did|went|came|had|made|got|took)\b/i,
      name: '過去形',
      description: '過去形は4級以降'
    },
    {
      pattern: /\bwill\s+\w+/i,
      name: '未来形will',
      description: 'willによる未来形は4級以降'
    },
    {
      pattern: /\b(must|should|may|might|could)\b/i,
      name: '助動詞must/should等',
      description: 'must, shouldなどは3級以降'
    },
    {
      pattern: /\b\w+ing\b(?!\s+(is|are|am))/i,
      name: '動名詞・分詞',
      description: '動名詞や現在分詞は3級以降（進行形を除く）'
    }
  ],
  maxWordsPerSentence: 15,
  maxClausesPerSentence: 1
};

/**
 * 英検4級の文法制約
 */
const grade4Constraints: GrammarConstraint = {
  grade: '4',
  allowedGrammar: [
    ...grade5Constraints.allowedGrammar,
    '過去形（規則・不規則）',
    '未来形（will, be going to）',
    '接続詞（when, if, because, but, so）',
    '不定代名詞（someone, something, anyone, anything）',
    '比較級（-er, more）',
  ],
  forbiddenPatterns: [
    {
      pattern: /\b(must|should|may|might)\b/i,
      name: '助動詞must/should等',
      description: 'must, shouldなどは3級以降'
    },
    {
      pattern: /\bhave\s+(been|gone|done|eaten|seen)\b/i,
      name: '現在完了',
      description: '現在完了形は3級以降'
    },
    {
      pattern: /\b\w+ing\b(?!\s+(is|are|am|was|were))/i,
      name: '動名詞',
      description: '動名詞は3級以降（進行形を除く）'
    }
  ],
  maxWordsPerSentence: 20,
  maxClausesPerSentence: 2
};

/**
 * 英検3級の文法制約
 */
const grade3Constraints: GrammarConstraint = {
  grade: '3',
  allowedGrammar: [
    ...grade4Constraints.allowedGrammar,
    '現在完了形（have/has + 過去分詞）',
    '助動詞（must, should, may）',
    '動名詞（～ing）',
    '不定詞（to + 動詞）',
    '受動態（基本）',
    '最上級（-est, most）',
  ],
  forbiddenPatterns: [
    {
      pattern: /\b(had\s+\w+ed|had\s+been)\b/i,
      name: '過去完了',
      description: '過去完了は準2級以降'
    },
    {
      pattern: /\bwould\s+(have|be)\b/i,
      name: '仮定法',
      description: '仮定法は2級以降'
    }
  ],
  maxWordsPerSentence: 25,
  maxClausesPerSentence: 3
};

/**
 * 準2級・2級・準1級・1級は制約を緩和
 */
const upperGradeConstraints: GrammarConstraint = {
  grade: 'pre2-1',
  allowedGrammar: ['すべての文法項目'],
  forbiddenPatterns: [],
  maxWordsPerSentence: 40,
  maxClausesPerSentence: 5
};

/**
 * 級に応じた文法制約を取得
 */
export function getGrammarConstraints(grade: string): GrammarConstraint {
  switch (grade) {
    case '5':
      return grade5Constraints;
    case '4':
      return grade4Constraints;
    case '3':
      return grade3Constraints;
    case 'pre-2':
    case 'pre2':
    case '2':
    case 'pre-1':
    case 'pre1':
    case '1':
      return upperGradeConstraints;
    default:
      return grade5Constraints; // デフォルトは最も厳しい5級
  }
}

/**
 * テキストが文法制約に違反していないかチェック
 */
export function validateGrammarComplexity(
  text: string,
  grade: string
): {
  passed: boolean;
  violations: string[];
} {
  const constraints = getGrammarConstraints(grade);
  const violations: string[] = [];

  // 禁止パターンのチェック
  for (const forbidden of constraints.forbiddenPatterns) {
    if (forbidden.pattern.test(text)) {
      violations.push(`${forbidden.name}: ${forbidden.description}`);
    }
  }

  // 文の長さチェック（簡易版）
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  for (const sentence of sentences) {
    const wordCount = sentence.trim().split(/\s+/).length;
    if (wordCount > constraints.maxWordsPerSentence) {
      violations.push(
        `文が長すぎます: ${wordCount}語（最大${constraints.maxWordsPerSentence}語）`
      );
    }
  }

  return {
    passed: violations.length === 0,
    violations
  };
}

/**
 * LLMプロンプトに追加する文法制約の説明文を生成
 */
export function getGrammarPromptInstructions(grade: string): string {
  const constraints = getGrammarConstraints(grade);
  
  const instructions = [
    `## 文法制約（英検${grade}級）`,
    '',
    '### 使用可能な文法:',
    ...constraints.allowedGrammar.map(g => `- ${g}`),
    '',
  ];

  if (constraints.forbiddenPatterns.length > 0) {
    instructions.push('### 使用禁止の文法:');
    for (const forbidden of constraints.forbiddenPatterns) {
      instructions.push(`- ${forbidden.name}: ${forbidden.description}`);
    }
    instructions.push('');
  }

  instructions.push(
    `### その他の制約:`,
    `- 1文の最大語数: ${constraints.maxWordsPerSentence}語`,
    `- 1文の最大節数: ${constraints.maxClausesPerSentence}節`,
    ''
  );

  return instructions.join('\n');
}
