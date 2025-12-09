/**
 * Phase 6: Teacher-Style Explanation Service
 * 
 * 学校の先生風の解説を生成するサービス
 * 4ブロック構成：＜着眼点＞＜鉄則＞＜当てはめ＞＜誤答の理由＞
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { EikenGrade } from '../types';
import { detectGrammarTags, getGrammarTermForTag, getGrammarRuleIdsForTags, type GrammarTag } from './grammar-tag-detector';

/**
 * 4ブロック解説テンプレート
 */
export interface TeacherStyleExplanation {
  focus_points: string;     // ＜着眼点＞
  grammar_rule: string;      // ＜鉄則！＞または＜Point！＞
  application: string;       // ＜当てはめ＞
  wrong_reasons: {           // ＜誤答の理由＞
    [choice: string]: string;
  };
}

/**
 * 文法ルール情報
 */
interface GrammarRule {
  term_code: string;
  term_name_ja: string;
  pattern_ja: string;
  explanation_template: string;
  example_sentences?: string;
}

/**
 * 解説生成用のコンテキスト
 */
export interface ExplanationContext {
  question_text: string;
  choices: string[];
  correct_answer: string;
  grammar_point?: string;
  grade: EikenGrade;
  detected_tags?: GrammarTag[];
  grammar_rules?: GrammarRule[];
}

/**
 * 教師風解説生成サービス
 */
export class TeacherStyleExplanationService {
  constructor(private db: D1Database) {}

  /**
   * 問題から文法タグを検出し、関連する文法ルールを取得
   */
  async detectGrammarContext(
    questionText: string,
    choices: string[],
    correctAnswer: string
  ): Promise<{ tags: GrammarTag[]; rules: GrammarRule[] }> {
    // 文法タグ検出
    const tags = detectGrammarTags(questionText, choices, correctAnswer);
    
    // タグに対応するルールIDを取得
    const ruleIds = getGrammarRuleIdsForTags(tags);
    
    // データベースから文法ルールを取得
    const rules: GrammarRule[] = [];
    
    if (ruleIds.length > 0) {
      const placeholders = ruleIds.map(() => '?').join(',');
      const query = `
        SELECT term_code, term_name_ja, pattern_ja, explanation_template, example_sentences
        FROM grammar_terms
        WHERE term_code IN (${placeholders})
        LIMIT 5
      `;
      
      try {
        const { results } = await this.db.prepare(query).bind(...ruleIds).all();
        rules.push(...(results as any[]));
      } catch (error) {
        console.warn('[TeacherStyle] Failed to fetch grammar rules:', error);
      }
    }
    
    console.log('[TeacherStyle] Detected tags:', tags);
    console.log('[TeacherStyle] Retrieved rules:', rules.length);
    
    return { tags, rules };
  }

  /**
   * 4ブロック解説のプロンプトを生成
   */
  buildTeacherStylePrompt(context: ExplanationContext): string {
    const { question_text, choices, correct_answer, grade, detected_tags = [], grammar_rules = [] } = context;
    
    // 検出された文法タグの日本語名
    const tagNames = detected_tags.map(tag => getGrammarTermForTag(tag)).join('、');
    
    // 文法ルールのリスト
    const rulesText = grammar_rules.map(rule => 
      `- ${rule.term_name_ja}（${rule.term_code}）：${rule.explanation_template}`
    ).join('\n');
    
    return `あなたは日本の中学・高校の英語教師です。生徒に文法を教える立場で、分かりやすく解説してください。

## 解説の構成（必須）

解説は必ず次の4ブロックで構成してください：

### ＜着眼点＞
生徒が「まずここを見るべき」というヒントを示します。
- 問題文中のキーワード（if、tomorrow、yesterday、every day など）
- 会話の文脈や状況
- 時制を示すヒント

例：
- 「if（もし〜なら）と tomorrow（明日）があるので、『未来の条件』の文です。」
- 「yesterday（昨日）があるので、過去の出来事を表す文です。」
- 「every Sunday（毎週日曜日）があるので、習慣を表す文です。」

### ＜鉄則！＞または＜Point！＞
文法の重要なルールを明確に示します。
- 小学生・中学1年生向けには「＜Point！＞」を使う
- 中学2年生以上には「＜鉄則！＞」を使う
- 必ず具体的なルールを1-2文で説明する

利用可能な文法ルール：
${rulesText || '（検出されたルールなし - 一般的な文法知識を使用）'}

例：
- 「＜鉄則！＞ 時・条件の副詞節（if / when など）では、未来のことでも現在形を使います。」
- 「＜Point！＞ 過去の出来事には過去形を使います。yesterday, last week, ago などが目印です。」

### ＜当てはめ＞
この問題に対して、鉄則をどう適用するかを説明します。
- 主語の確認（I / you / he / she / it / they など）
- 時制の確認
- なぜこの形になるのか

例：
- 「if の中は現在形にするので、動詞の形は現在形です。主語が it（3単現）なので、3単現のsをつけて rains になります。」
- 「主語が I なので、eat の過去形 ate を使います。」

### ＜誤答の理由＞
各選択肢がなぜ間違いなのかを1行ずつ説明します。
- 選択肢ごとに「×」マークを付ける
- 文法形式を明示（動詞の原形、過去形、現在進行形など）
- なぜこの文脈では使えないかを簡潔に

例：
- 「rain：動詞の原形。3単現のsがついていないので ×」
- 「rained：過去形。if節では現在形を使うので ×」
- 「is raining：現在進行形。条件節では基本的に使わないので ×」

## 問題情報

問題文：${question_text}

選択肢：
${choices.map((choice, index) => `${index + 1}. ${choice}`).join('\n')}

正解：${correct_answer}

検出された文法タグ：${tagNames || 'なし'}

対象学年：英検${grade}級

## 出力形式

以下の形式で出力してください：

＜着眼点＞
[ここに着眼点を書く]

＜${grade === '5' || grade === '4' ? 'Point！' : '鉄則！'}＞
[ここに文法ルールを書く]

＜当てはめ＞
[ここにこの問題への適用方法を書く]

＜誤答の理由＞
${choices.filter(c => c !== correct_answer).map(choice => `${choice}：[ここに理由を書く] ×`).join('\n')}

## 重要な注意事項

1. 必ず4ブロック構成を守ること
2. 学年に応じた用語を使うこと（英検${grade}級レベル）
3. 「〜という意味です」だけの説明は避け、文法ルールを明確に示すこと
4. 各選択肢の文法形式を明示すること（動詞の原形、過去形、3単現のs など）
5. 簡潔で分かりやすい表現を心がけること`;
  }

  /**
   * 解説のフォーマットを検証
   */
  validateExplanationFormat(explanation: string): {
    valid: boolean;
    has_focus_points: boolean;
    has_rule: boolean;
    has_application: boolean;
    has_wrong_reasons: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    // 4ブロックの存在チェック
    const hasFocusPoints = explanation.includes('＜着眼点＞') || explanation.includes('<着眼点>');
    const hasRule = explanation.includes('＜鉄則') || explanation.includes('＜Point') || 
                    explanation.includes('<鉄則') || explanation.includes('<Point');
    const hasApplication = explanation.includes('＜当てはめ＞') || explanation.includes('<当てはめ>');
    const hasWrongReasons = explanation.includes('＜誤答の理由＞') || explanation.includes('<誤答の理由>');
    
    if (!hasFocusPoints) issues.push('＜着眼点＞ブロックが見つかりません');
    if (!hasRule) issues.push('＜鉄則！＞または＜Point！＞ブロックが見つかりません');
    if (!hasApplication) issues.push('＜当てはめ＞ブロックが見つかりません');
    if (!hasWrongReasons) issues.push('＜誤答の理由＞ブロックが見つかりません');
    
    // NG フレーズチェック
    const ngPhrases = [
      '未来を表す文なので will を使います',
      'if の後には動詞の原形を使います',
      'なんとなく',
      'ニュアンス'
    ];
    
    for (const phrase of ngPhrases) {
      if (explanation.includes(phrase)) {
        issues.push(`NGフレーズが含まれています: "${phrase}"`);
      }
    }
    
    const valid = hasFocusPoints && hasRule && hasApplication && hasWrongReasons && issues.length === 0;
    
    return {
      valid,
      has_focus_points: hasFocusPoints,
      has_rule: hasRule,
      has_application: hasApplication,
      has_wrong_reasons: hasWrongReasons,
      issues
    };
  }

  /**
   * 解説から4ブロックを抽出
   */
  parseExplanation(explanation: string): TeacherStyleExplanation | null {
    try {
      // ブロックを分割
      const focusMatch = explanation.match(/＜着眼点＞\s*([^＜]+)/);
      const ruleMatch = explanation.match(/＜(?:鉄則！|Point！)＞\s*([^＜]+)/);
      const applicationMatch = explanation.match(/＜当てはめ＞\s*([^＜]+)/);
      const wrongReasonsMatch = explanation.match(/＜誤答の理由＞\s*([\s\S]+?)(?=\n\n|\n*$)/);
      
      if (!focusMatch || !ruleMatch || !applicationMatch || !wrongReasonsMatch) {
        return null;
      }
      
      // 誤答の理由をパース
      const wrongReasons: { [choice: string]: string } = {};
      const reasonLines = wrongReasonsMatch[1].split('\n').filter(line => line.trim());
      
      for (const line of reasonLines) {
        const match = line.match(/^(.+?)[:：]\s*(.+)\s*×?\s*$/);
        if (match) {
          wrongReasons[match[1].trim()] = match[2].trim();
        }
      }
      
      return {
        focus_points: focusMatch[1].trim(),
        grammar_rule: ruleMatch[1].trim(),
        application: applicationMatch[1].trim(),
        wrong_reasons: wrongReasons
      };
    } catch (error) {
      console.error('[TeacherStyle] Failed to parse explanation:', error);
      return null;
    }
  }
}
