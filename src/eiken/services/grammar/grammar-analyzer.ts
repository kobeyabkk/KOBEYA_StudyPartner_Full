/**
 * Grammar Analyzer Service
 * 文法パターン解析サービス
 * 
 * 目的: 英文から文法パターンを検出し、学校文法用語で解説を生成
 */

export interface GrammarTerm {
  id: number;
  term_code: string;
  term_name_ja: string;
  grade_level: string;
  eiken_grade: string;
  pattern_en: string;
  pattern_ja: string;
  explanation_template: string;
  example_sentences: Array<{ en: string; ja: string }>;
}

export interface GrammarAnalysisResult {
  detected_patterns: Array<{
    term_code: string;
    term_name_ja: string;
    pattern_en: string;
    explanation: string;
    confidence: number;
    matched_text?: string;
  }>;
  school_style_explanation: string;
  grammar_breakdown: string[];
}

export class GrammarAnalyzer {
  private db: D1Database;
  private grammarTermsCache: Map<string, GrammarTerm> = new Map();

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * 文法用語をキャッシュからロード（初回のみDB取得）
   */
  private async loadGrammarTerms(): Promise<void> {
    if (this.grammarTermsCache.size > 0) {
      return; // Already loaded
    }

    const result = await this.db.prepare(`
      SELECT 
        id, term_code, term_name_ja, grade_level, eiken_grade,
        pattern_en, pattern_ja, explanation_template, example_sentences
      FROM grammar_terms
      ORDER BY 
        CASE grade_level
          WHEN '小学校' THEN 1
          WHEN '中1' THEN 2
          WHEN '中2' THEN 3
          WHEN '中3' THEN 4
          WHEN '高校' THEN 5
          ELSE 6
        END,
        id
    `).all();

    if (result.results) {
      for (const row of result.results as any[]) {
        const term: GrammarTerm = {
          ...row,
          example_sentences: row.example_sentences ? JSON.parse(row.example_sentences) : []
        };
        this.grammarTermsCache.set(term.term_code, term);
      }
    }

    console.log(`[GrammarAnalyzer] Loaded ${this.grammarTermsCache.size} grammar terms`);
  }

  /**
   * 英文から文法パターンを検出
   */
  public async analyzeGrammar(
    text: string,
    eikenGrade?: string
  ): Promise<GrammarAnalysisResult> {
    await this.loadGrammarTerms();

    const detectedPatterns: GrammarAnalysisResult['detected_patterns'] = [];

    // パターン検出ロジック
    const patterns = this.detectPatterns(text, eikenGrade);
    detectedPatterns.push(...patterns);

    // 学校文法スタイルの解説生成
    const schoolStyleExplanation = this.generateSchoolStyleExplanation(
      text,
      detectedPatterns
    );

    // 文法分解
    const grammarBreakdown = this.generateGrammarBreakdown(text, detectedPatterns);

    return {
      detected_patterns: detectedPatterns,
      school_style_explanation: schoolStyleExplanation,
      grammar_breakdown: grammarBreakdown
    };
  }

  /**
   * パターン検出（ルールベース）
   */
  private detectPatterns(
    text: string,
    eikenGrade?: string
  ): GrammarAnalysisResult['detected_patterns'] {
    const detected: GrammarAnalysisResult['detected_patterns'] = [];
    const textLower = text.toLowerCase();

    // 1. 受動態（be + 過去分詞）
    if (/\b(am|is|are|was|were|been)\s+\w+(ed|en)\b/i.test(text)) {
      const term = this.grammarTermsCache.get('passive_voice');
      if (term) {
        detected.push({
          term_code: 'passive_voice',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.9,
          matched_text: text.match(/\b(am|is|are|was|were|been)\s+\w+(ed|en)\b/i)?.[0]
        });
      }
    }

    // 2. 現在完了形（have/has + 過去分詞）
    if (/\b(have|has)\s+\w+(ed|en)\b/i.test(text)) {
      const term = this.grammarTermsCache.get('present_perfect_cont');
      if (term) {
        detected.push({
          term_code: 'present_perfect_cont',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.85,
          matched_text: text.match(/\b(have|has)\s+\w+(ed|en)\b/i)?.[0]
        });
      }
    }

    // 3. 不定詞（to + 動詞）
    if (/\bto\s+[a-z]+\b/i.test(text)) {
      const term = this.grammarTermsCache.get('infinitive_noun');
      if (term) {
        detected.push({
          term_code: 'infinitive_noun',
          term_name_ja: '不定詞',
          pattern_en: term.pattern_en,
          explanation: '【不定詞】to + 動詞の形。名詞的・形容詞的・副詞的用法がある',
          confidence: 0.8,
          matched_text: text.match(/\bto\s+[a-z]+\b/i)?.[0]
        });
      }
    }

    // 4. 現在進行形（be + 動詞ing）
    if (/\b(am|is|are)\s+\w+ing\b/i.test(text)) {
      const term = this.grammarTermsCache.get('present_progressive');
      if (term) {
        detected.push({
          term_code: 'present_progressive',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.9,
          matched_text: text.match(/\b(am|is|are)\s+\w+ing\b/i)?.[0]
        });
      }
    }

    // 5. 過去進行形（was/were + 動詞ing）
    if (/\b(was|were)\s+\w+ing\b/i.test(text)) {
      const term = this.grammarTermsCache.get('past_progressive');
      if (term) {
        detected.push({
          term_code: 'past_progressive',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.9,
          matched_text: text.match(/\b(was|were)\s+\w+ing\b/i)?.[0]
        });
      }
    }

    // 6. 未来形（will + 動詞）
    if (/\bwill\s+[a-z]+\b/i.test(text)) {
      const term = this.grammarTermsCache.get('future_will');
      if (term) {
        detected.push({
          term_code: 'future_will',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.95,
          matched_text: text.match(/\bwill\s+[a-z]+\b/i)?.[0]
        });
      }
    }

    // 7. be going to
    if (/\b(am|is|are)\s+going\s+to\s+[a-z]+\b/i.test(text)) {
      const term = this.grammarTermsCache.get('future_be_going_to');
      if (term) {
        detected.push({
          term_code: 'future_be_going_to',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.95,
          matched_text: text.match(/\b(am|is|are)\s+going\s+to\s+[a-z]+\b/i)?.[0]
        });
      }
    }

    // 8. 比較級（-er than / more ... than）
    if (/\b\w+er\s+than\b/i.test(text) || /\bmore\s+\w+\s+than\b/i.test(text)) {
      const term = this.grammarTermsCache.get('comparative');
      if (term) {
        detected.push({
          term_code: 'comparative',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.9,
          matched_text: text.match(/\b(\w+er|more\s+\w+)\s+than\b/i)?.[0]
        });
      }
    }

    // 9. 最上級（the -est / the most）
    if (/\bthe\s+\w+est\b/i.test(text) || /\bthe\s+most\s+\w+\b/i.test(text)) {
      const term = this.grammarTermsCache.get('superlative');
      if (term) {
        detected.push({
          term_code: 'superlative',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.9,
          matched_text: text.match(/\bthe\s+(\w+est|most\s+\w+)\b/i)?.[0]
        });
      }
    }

    // 10. 関係代名詞（who/which/that）
    if (/\b(who|which|that)\s+[a-z]+\b/i.test(text)) {
      const term = this.grammarTermsCache.get('relative_pronoun_subj');
      if (term) {
        detected.push({
          term_code: 'relative_pronoun_subj',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.8,
          matched_text: text.match(/\b(who|which|that)\s+[a-z]+\b/i)?.[0]
        });
      }
    }

    // 11. 助動詞 can
    if (/\bcan\s+[a-z]+\b/i.test(text)) {
      const term = this.grammarTermsCache.get('can_ability');
      if (term) {
        detected.push({
          term_code: 'can_ability',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.95,
          matched_text: text.match(/\bcan\s+[a-z]+\b/i)?.[0]
        });
      }
    }

    // 12. 助動詞 must
    if (/\bmust\s+[a-z]+\b/i.test(text)) {
      const term = this.grammarTermsCache.get('must');
      if (term) {
        detected.push({
          term_code: 'must',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.95,
          matched_text: text.match(/\bmust\s+[a-z]+\b/i)?.[0]
        });
      }
    }

    // 13. SVOC構文（find/make/keep + O + C）
    if (/\b(find|found|make|made|keep|kept)\s+\w+\s+\w+/i.test(text)) {
      const term = this.grammarTermsCache.get('svoc');
      if (term) {
        detected.push({
          term_code: 'svoc',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.7,
          matched_text: text.match(/\b(find|found|make|made|keep|kept)\s+\w+\s+\w+/i)?.[0]
        });
      }
    }

    // 14. There is/are
    if (/\bthere\s+(is|are|was|were)\b/i.test(text)) {
      const term = this.grammarTermsCache.get('there_is');
      if (term) {
        detected.push({
          term_code: 'there_is',
          term_name_ja: term.term_name_ja,
          pattern_en: term.pattern_en,
          explanation: term.explanation_template,
          confidence: 0.95,
          matched_text: text.match(/\bthere\s+(is|are|was|were)\b/i)?.[0]
        });
      }
    }

    // 重複削除（優先度の高いものを残す）
    const uniqueDetected = this.deduplicatePatterns(detected);

    return uniqueDetected;
  }

  /**
   * 重複パターンを削除（信頼度の高いものを優先）
   */
  private deduplicatePatterns(
    patterns: GrammarAnalysisResult['detected_patterns']
  ): GrammarAnalysisResult['detected_patterns'] {
    const seen = new Set<string>();
    const result: GrammarAnalysisResult['detected_patterns'] = [];

    // 信頼度でソート
    const sorted = [...patterns].sort((a, b) => b.confidence - a.confidence);

    for (const pattern of sorted) {
      if (!seen.has(pattern.term_code)) {
        seen.add(pattern.term_code);
        result.push(pattern);
      }
    }

    return result;
  }

  /**
   * 学校文法スタイルの解説を生成
   */
  private generateSchoolStyleExplanation(
    text: string,
    patterns: GrammarAnalysisResult['detected_patterns']
  ): string {
    if (patterns.length === 0) {
      return '【基本文】\nシンプルな文構造です。';
    }

    const explanations: string[] = [];

    for (const pattern of patterns) {
      if (pattern.matched_text) {
        explanations.push(
          `【${pattern.term_name_ja}】\n` +
          `パターン: ${pattern.pattern_en}\n` +
          `該当箇所: "${pattern.matched_text}"\n` +
          `${pattern.explanation}`
        );
      } else {
        explanations.push(
          `【${pattern.term_name_ja}】\n` +
          `${pattern.explanation}`
        );
      }
    }

    return explanations.join('\n\n');
  }

  /**
   * 文法分解（箇条書き）
   */
  private generateGrammarBreakdown(
    text: string,
    patterns: GrammarAnalysisResult['detected_patterns']
  ): string[] {
    const breakdown: string[] = [];

    for (const pattern of patterns) {
      breakdown.push(
        `・${pattern.term_name_ja}（${pattern.pattern_en}）を使用`
      );
    }

    if (breakdown.length === 0) {
      breakdown.push('・基本的な文構造');
    }

    return breakdown;
  }

  /**
   * 特定の文法項目が含まれているかチェック
   */
  public async hasGrammarPattern(
    text: string,
    termCode: string
  ): Promise<boolean> {
    const result = await this.analyzeGrammar(text);
    return result.detected_patterns.some(p => p.term_code === termCode);
  }

  /**
   * 英検級に適した文法項目を取得
   */
  public async getGrammarForGrade(eikenGrade: string): Promise<GrammarTerm[]> {
    await this.loadGrammarTerms();

    const terms: GrammarTerm[] = [];
    for (const term of this.grammarTermsCache.values()) {
      if (term.eiken_grade === eikenGrade) {
        terms.push(term);
      }
    }

    return terms;
  }
}

export const createGrammarAnalyzer = (db: D1Database) => new GrammarAnalyzer(db);
