/**
 * 小学生向け読解問題自動生成ユーティリティ
 * 
 * 低学年: ルールベースで「基本5問」を生成
 * 中学年: ルールベース + LLM補助
 * 高学年: LLM中心で多様な問題形式を生成
 */

// ==================== 型定義 ====================

export type Grade = 'low' | 'mid' | 'high';

export type QuestionType =
  | 'who'        // だれ
  | 'when'       // いつ
  | 'where'      // どこ
  | 'what'       // なに
  | 'feeling'    // きもち
  | 'why'        // なぜ
  | 'extract'    // 抜き出し
  | 'summary'    // 要約・主旨
  | 'order'      // 順序入れかえ
  | 'blank';     // 穴埋め（既存互換）

export type QuestionFormat = 'choice' | 'extract' | 'order';

export interface ChoiceQuestion {
  text: string;
  choices: string[];
  answer: number;
  type: QuestionType;
  format: 'choice';
  explanation?: string;
  sourceText?: string;
}

export interface ExtractQuestion {
  text: string;
  correctAnswer: string;
  type: 'extract';
  format: 'extract';
  sourceText?: string;
  maxLength?: number;
}

export interface OrderQuestion {
  text: string;
  sentences: string[];
  correctOrder: number[];
  type: 'order';
  format: 'order';
  sourceText?: string;
}

export type Question = ChoiceQuestion | ExtractQuestion | OrderQuestion;

export interface StoryMetadata {
  mainCharacter?: string;
  time?: string;
  place?: string;
  mainEvent?: string;
  feelings?: Array<{
    character: string;
    emotion: string;
    reason?: string;
    sourceText: string;
  }>;
  extractedBy?: 'rule' | 'llm' | 'manual';
}

export interface QuestionGenerationOptions {
  grade: Grade;
  questionTypes?: QuestionType[];
  useLLM?: boolean;
  questionCount?: number;
}

// ==================== 定数 ====================

const DUMMY_CHARACTERS = ['男の子', '女の子', 'おとうさん', 'おかあさん', 'いぬ', 'ねこ', 'うさぎ', 'きつね'];
const DUMMY_PLACES = ['もり', 'かわ', 'やま', 'うみ', 'がっこう', 'こうえん', 'いえ', 'みせ'];
const DUMMY_EMOTIONS = ['うれしい', 'たのしい', 'かなしい', 'こわい', 'びっくり', 'おこ', 'なか', 'わら'];

const TIME_PATTERNS: Record<string, string[]> = {
  'ある日': ['ある日', 'いつか', 'むかし'],
  '朝': ['朝', '昼', '夜'],
  '夕方': ['夕方', '朝', '夜'],
  '夜': ['夜', '朝', '昼'],
  'むかし': ['むかし', '今', 'これから'],
  'きょう': ['きょう', 'きのう', 'あした']
};

const PLACE_KEYWORDS = ['にわ', '森', '家', '学校', '公園', '川', '池', '海', '山', 'がっこう', 'こうえん'];
const TIME_KEYWORDS = ['ある日', '朝', '昼', '夕方', '夜', 'むかし', 'きょう', 'きのう', 'あした'];
const EMOTION_KEYWORDS = ['うれしい', 'たのしい', 'かなしい', 'こわい', 'びっくり', 'おこ', 'なか', 'わら', 'よろこ'];

// ==================== 低学年向け「基本5問」生成 ====================

/**
 * 低学年向け基本5問を生成
 */
export function generateBasicQuestionsForLowGrade(
  body: string,
  title: string,
  metadata?: StoryMetadata
): Question[] {
  const questions: Question[] = [];
  const sentences = body.split(/[。\n]+/).filter(s => s.trim().length > 0);

  // 1. だれ（who）問題
  const character = metadata?.mainCharacter || extractMainCharacter(title, body);
  if (character) {
    const whoQuestion = generateWhoQuestion(character, body);
    if (whoQuestion) questions.push(whoQuestion);
  }

  // 2. いつ（when）問題
  const timeInfo = metadata?.time || extractTime(sentences);
  if (timeInfo) {
    const whenQuestion = generateWhenQuestion(timeInfo, body);
    if (whenQuestion) questions.push(whenQuestion);
  }

  // 3. どこ（where）問題
  const placeInfo = metadata?.place || extractPlace(sentences);
  if (placeInfo) {
    const whereQuestion = generateWhereQuestion(placeInfo, body);
    if (whereQuestion) questions.push(whereQuestion);
  }

  // 4. なに（what）問題
  const eventInfo = metadata?.mainEvent || extractMainEvent(sentences);
  if (eventInfo) {
    const whatQuestion = generateWhatQuestion(eventInfo, body);
    if (whatQuestion) questions.push(whatQuestion);
  }

  // 5. きもち（feeling）問題
  let feelingData = null;
  if (metadata?.feelings && metadata.feelings.length > 0) {
    feelingData = metadata.feelings[0];
  } else {
    feelingData = extractFeeling(sentences);
  }
  if (feelingData) {
    const feelingQuestion = generateFeelingQuestion(feelingData, body);
    if (feelingQuestion) questions.push(feelingQuestion);
  }

  return questions.slice(0, 5); // 最大5問
}

// ==================== 個別問題生成関数 ====================

function generateWhoQuestion(
  character: string,
  body: string
): ChoiceQuestion | null {
  const choices = [character];

  // ダミー選択肢生成
  while (choices.length < 3) {
    const dummy = DUMMY_CHARACTERS[Math.floor(Math.random() * DUMMY_CHARACTERS.length)];
    if (!choices.includes(dummy)) {
      choices.push(dummy);
    }
  }

  const shuffled = [...choices].sort(() => Math.random() - 0.5);
  const answerIndex = shuffled.indexOf(character);

  // 本文から該当箇所を抽出（簡易版）
  const charIndex = body.indexOf(character);
  const sourceText = charIndex >= 0
    ? body.slice(Math.max(0, charIndex - 10), charIndex + character.length + 20)
    : '';

  return {
    text: 'このお話の主人公はだれですか。',
    choices: shuffled,
    answer: answerIndex,
    type: 'who',
    format: 'choice',
    sourceText
  };
}

function generateWhenQuestion(
  timeInfo: string,
  body: string
): ChoiceQuestion | null {
  let choices = [timeInfo];
  const patterns = TIME_PATTERNS[timeInfo] || [timeInfo, 'いつか', 'ある日'];

  for (const p of patterns) {
    if (choices.length >= 3) break;
    if (!choices.includes(p)) choices.push(p);
  }

  // 3つに満たない場合は追加
  while (choices.length < 3) {
    const dummy = TIME_KEYWORDS[Math.floor(Math.random() * TIME_KEYWORDS.length)];
    if (!choices.includes(dummy)) choices.push(dummy);
  }

  const shuffled = [...choices].sort(() => Math.random() - 0.5);
  const answerIndex = shuffled.indexOf(timeInfo);

  return {
    text: 'このお話は、いつのはなしですか。',
    choices: shuffled.slice(0, 3),
    answer: answerIndex,
    type: 'when',
    format: 'choice'
  };
}

function generateWhereQuestion(
  placeInfo: string,
  body: string
): ChoiceQuestion | null {
  const choices = [placeInfo];

  while (choices.length < 3) {
    const dummy = DUMMY_PLACES[Math.floor(Math.random() * DUMMY_PLACES.length)];
    if (!choices.includes(dummy)) {
      choices.push(dummy);
    }
  }

  const shuffled = [...choices].sort(() => Math.random() - 0.5);
  const answerIndex = shuffled.indexOf(placeInfo);

  return {
    text: 'このお話は、どこでのお話ですか。',
    choices: shuffled,
    answer: answerIndex,
    type: 'where',
    format: 'choice'
  };
}

function generateWhatQuestion(
  eventInfo: string,
  body: string
): ChoiceQuestion | null {
  // 主な出来事を簡潔に表現
  const eventSummary = eventInfo.length > 20 ? eventInfo.slice(0, 20) + '...' : eventInfo;

  // 選択肢生成（簡易版）
  const choices = [eventSummary];
  const dummyEvents = ['あそんだ', 'たべた', 'べんきょうした', 'さんぽした', 'はしった'];
  
  while (choices.length < 3) {
    const dummy = dummyEvents[Math.floor(Math.random() * dummyEvents.length)];
    if (!choices.includes(dummy)) {
      choices.push(dummy);
    }
  }

  const shuffled = [...choices].sort(() => Math.random() - 0.5);
  const answerIndex = shuffled.indexOf(eventSummary);

  return {
    text: 'このお話で、主人公は何をしましたか。',
    choices: shuffled,
    answer: answerIndex,
    type: 'what',
    format: 'choice'
  };
}

function generateFeelingQuestion(
  feelingData: { character: string; emotion: string; sourceText?: string },
  body: string
): ChoiceQuestion | null {
  const choices = [feelingData.emotion];

  while (choices.length < 3) {
    const dummy = DUMMY_EMOTIONS[Math.floor(Math.random() * DUMMY_EMOTIONS.length)];
    if (!choices.includes(dummy) && dummy !== feelingData.emotion) {
      choices.push(dummy);
    }
  }

  const shuffled = [...choices].sort(() => Math.random() - 0.5);
  const answerIndex = shuffled.indexOf(feelingData.emotion);

  return {
    text: '「' + (feelingData.sourceText?.slice(0, 20) || 'この場面') + '」のとき、主人公はどんな気持ちでしたか。',
    choices: shuffled,
    answer: answerIndex,
    type: 'feeling',
    format: 'choice',
    sourceText: feelingData.sourceText
  };
}

// ==================== 抽出ヘルパー関数 ====================

function extractMainCharacter(title: string, body: string): string | null {
  // タイトルから推定
  const titlePatterns = [
    /(.+?)(の子|ちゃん|くん|さん|じいさん|ばあさん|くんちゃん)/,
    /(.+?)(の|と)/  // 「赤ずきん」「アヒルの子」など
  ];

  for (const pattern of titlePatterns) {
    const match = title.match(pattern);
    if (match && match[1].length <= 10) {
      return match[1] + (match[2] || '');
    }
  }

  // 本文の最初の文から主語を抽出（簡易版）
  const firstSentence = body.split(/[。\n]/)[0];
  const subjectMatch = firstSentence.match(/(.+?)[はが]/);
  if (subjectMatch && subjectMatch[1].length < 10 && subjectMatch[1].length > 1) {
    return subjectMatch[1];
  }

  return null;
}

function extractTime(sentences: string[]): string | null {
  for (const sentence of sentences.slice(0, 5)) {
    for (const keyword of TIME_KEYWORDS) {
      if (sentence.includes(keyword)) {
        return keyword;
      }
    }
  }
  return null;
}

function extractPlace(sentences: string[]): string | null {
  for (const sentence of sentences) {
    for (const keyword of PLACE_KEYWORDS) {
      if (sentence.includes(keyword)) {
        return keyword;
      }
    }
  }
  return null;
}

function extractMainEvent(sentences: string[]): string | null {
  // 動詞を含む文から主な動作を抽出
  const verbPatterns = /(たべ|の|い|かえ|でかけ|あそ|はな|み|き|か|とどけ|もって)/;
  for (const sentence of sentences.slice(0, 5)) {
    if (verbPatterns.test(sentence)) {
      // 簡潔に要約（30文字以内）
      const summary = sentence.slice(0, 30);
      return summary.replace(/[。、]/g, '');
    }
  }
  return null;
}

function extractFeeling(
  sentences: string[]
): { character: string; emotion: string; sourceText: string } | null {
  for (const sentence of sentences) {
    for (const keyword of EMOTION_KEYWORDS) {
      if (sentence.includes(keyword)) {
        return {
          character: '主人公',
          emotion: keyword,
          sourceText: sentence.slice(0, 50)
        };
      }
    }
  }
  return null;
}

// ==================== 中学年・高学年向け（LLM統合準備） ====================

/**
 * 中学年向け問題生成（基本5問 + 理由問題）
 */
export async function generateQuestionsForMidGrade(
  body: string,
  title: string,
  metadata?: StoryMetadata,
  useLLM: boolean = false
): Promise<Question[]> {
  // まず基本5問を生成
  const basicQuestions = generateBasicQuestionsForLowGrade(body, title, metadata);

  if (useLLM) {
    // LLMで理由問題を生成
    // 注: API呼び出しはフロントエンド側で行うことを推奨
    // ここではルールベースにフォールバック
    const whyQuestion = generateWhyQuestionRuleBased(body, metadata);
    if (whyQuestion) {
      return [...basicQuestions, whyQuestion].slice(0, 6);
    }
    return basicQuestions;
  } else {
    // ルールベースで理由問題を追加（簡易版）
    const whyQuestion = generateWhyQuestionRuleBased(body, metadata);
    if (whyQuestion) {
      return [...basicQuestions, whyQuestion].slice(0, 6);
    }
    return basicQuestions;
  }
}

/**
 * ルールベースでの理由問題生成（簡易版）
 */
function generateWhyQuestionRuleBased(
  body: string,
  metadata?: StoryMetadata
): ChoiceQuestion | null {
  // 「なぜ」「〜から」などのパターンから理由を抽出（簡易版）
  const sentences = body.split(/[。\n]+/).filter(s => s.trim().length > 0);
  
  for (const sentence of sentences) {
    if (sentence.includes('から') || sentence.includes('ので') || sentence.includes('ため')) {
      // 理由を含む文を見つけた場合の簡易処理
      const choices = ['本文にある理由', '別の理由1', '別の理由2'];
      return {
        text: '主人公がこの行動をしたのはなぜですか。',
        choices,
        answer: 0,
        type: 'why',
        format: 'choice',
        sourceText: sentence
      };
    }
  }
  
  return null;
}

/**
 * LLMで理由問題を生成
 * 注: この関数はAPI経由で呼び出されることを想定
 */
async function generateWhyQuestionWithLLM(
  body: string,
  metadata?: StoryMetadata,
  apiKey?: string
): Promise<ChoiceQuestion[]> {
  if (!apiKey) {
    // APIキーがない場合はルールベースにフォールバック
    const whyQuestion = generateWhyQuestionRuleBased(body, metadata);
    return whyQuestion ? [whyQuestion] : [];
  }

  try {
    // APIエンドポイントを呼び出す
    const response = await fetch('/api/reading-comprehension/generate-why', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, metadata })
    });

    if (!response.ok) {
      throw new Error(`API呼び出しエラー: ${response.status}`);
    }

    const data = await response.json();
    return data.questions || [];
  } catch (error) {
    console.error('LLM生成エラー:', error);
    // エラー時はルールベースにフォールバック
    const whyQuestion = generateWhyQuestionRuleBased(body, metadata);
    return whyQuestion ? [whyQuestion] : [];
  }
}

/**
 * 高学年向け多様な問題形式生成
 * 注: この関数はAPI経由で呼び出されることを想定
 */
export async function generateQuestionsForHighGrade(
  body: string,
  title: string,
  metadata?: StoryMetadata,
  apiKey?: string
): Promise<Question[]> {
  if (!apiKey) {
    // APIキーがない場合は基本問題のみ生成
    return generateBasicQuestionsForLowGrade(body, title, metadata);
  }

  try {
    // APIエンドポイントを呼び出す
    const response = await fetch('/api/reading-comprehension/generate-diverse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, title, metadata })
    });

    if (!response.ok) {
      throw new Error(`API呼び出しエラー: ${response.status}`);
    }

    const data = await response.json();
    return data.questions || generateBasicQuestionsForLowGrade(body, title, metadata);
  } catch (error) {
    console.error('LLM生成エラー:', error);
    // エラー時は基本問題のみ生成
    return generateBasicQuestionsForLowGrade(body, title, metadata);
  }
}

// ==================== 問題数・文字数制御 ====================

/**
 * 学年・レイアウトに応じた最適な問題数を取得
 */
export function getOptimalQuestionCount(grade: Grade, isVertical: boolean): number {
  if (isVertical) {
    return grade === 'low' ? 4 : grade === 'mid' ? 5 : 6;
  } else {
    return grade === 'low' ? 5 : grade === 'mid' ? 6 : 7;
  }
}

/**
 * 問題の文字数を検証
 */
export function validateQuestionLength(question: Question, isVertical: boolean): boolean {
  const maxLength = isVertical ? 80 : 100;

  if (question.format === 'choice') {
    const totalLength = question.text.length +
      question.choices.reduce((sum, c) => sum + c.length, 0);
    return totalLength <= maxLength;
  }

  if (question.format === 'extract') {
    return question.text.length <= maxLength;
  }

  return true;
}

