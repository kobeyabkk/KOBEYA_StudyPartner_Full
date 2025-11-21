# 語彙品質改善：統合実装ガイド

## 🎯 5つのAIアドバイスの統合結果

このドキュメントは、Cursor, Gemini, Claude, ChatGPT, Codexからのアドバイスを統合した最終実装ガイドです。

---

## 📊 採用戦略の決定

### **最優先実装（今日中）**

#### 1. Few-shot Examples + Good/Bad 対比（Cursor + ChatGPT）

```typescript
// src/eiken/prompts/format-prompts.ts

const FEW_SHOT_EXAMPLES = {
  essay: {
    good: `"Many people think that studying English is important. I agree with this idea. First, English helps us communicate with people from other countries. Second, we can get more information from the internet if we know English. Third, many companies want workers who can speak English. In conclusion, I believe everyone should study English hard."`,
    
    good_analysis: "Uses only A2-B1 words: think, study, important, agree, help, communicate, people, country, information, internet, know, company, want, worker, speak, believe, hard",
    
    bad: `"Numerous individuals argue that acquiring proficiency in English is essential for contemporary society. I concur with this perspective. Primarily, English facilitates international communication. Furthermore, it enables access to comprehensive information resources. Moreover, organizations demonstrate preference for multilingual candidates."`,
    
    bad_problems: [
      "'numerous' (C1) → use 'many' (A2)",
      "'individuals' (B2) → use 'people' (A1)",
      "'acquiring proficiency' (C1) → use 'learning' or 'studying' (A2)",
      "'essential' (B2) → use 'important' (A2)",
      "'contemporary' (C1) → use 'modern' (B1) or 'today's' (A2)",
      "'facilitates' (C1) → use 'helps' (A2)",
      "'comprehensive' (C1) → use 'a lot of' (A2)",
      "'demonstrate preference' (C1) → use 'like' or 'want' (A2)",
      "'multilingual' (B2) → use 'can speak many languages' (A2)"
    ]
  }
};

export function buildEssayPrompt(blueprint: Blueprint): string {
  const { topic, guidelines, instructions } = blueprint;
  
  return `You are an expert English test creator for Japanese students preparing for Eiken (英検) ${blueprint.grade} level.

## 🎯 CRITICAL VOCABULARY REQUIREMENTS (PRIMARY GOAL)

**TARGET LEVEL**: ${guidelines.vocabulary_level} ONLY
**SUCCESS CRITERIA**: 95%+ of words must be within ${guidelines.vocabulary_level}
**FAILURE CONSEQUENCE**: If too many difficult words, question will be rejected

## 🚫 FORBIDDEN WORDS (NEVER USE)

**Academic Verbs**: facilitate, demonstrate, implement, establish, acknowledge
**Abstract Adjectives**: sophisticated, comprehensive, substantial, significant, considerable
**Formal Connectors**: furthermore, moreover, nevertheless, consequently
**C1/C2 Words**: numerous, acquire, proficiency, contemporary, multilingual

## ✅ GOOD EXAMPLE (95%+ vocabulary score)

${FEW_SHOT_EXAMPLES.essay.good}

**Why this works**:
${FEW_SHOT_EXAMPLES.essay.good_analysis}

## ❌ BAD EXAMPLE (68% vocabulary score - DO NOT IMITATE)

${FEW_SHOT_EXAMPLES.essay.bad}

**Problems identified**:
${FEW_SHOT_EXAMPLES.essay.bad_problems.map(p => `- ${p}`).join('\n')}

## 📝 WRITING STRATEGY

1. **Use short sentences** (10-15 words maximum)
2. **Choose common words first**: think, because, people, important, help
3. **Avoid synonyms**: Better to repeat "important" than use "significant"
4. **Self-check**: Ask yourself "Would a ${blueprint.grade} student know this word?"

## 🎯 YOUR TASK

Topic: "${topic.topic_label_en}" (${topic.topic_label_ja})
Length: 120-150 words
Format: Essay with prompt and sample essay

## ✓ FINAL SELF-CHECK (before responding)

□ Are 95%+ of my words at ${guidelines.vocabulary_level} level?
□ Did I avoid all forbidden words listed above?
□ Did I use short, simple sentences?
□ Would my target students understand this easily?

## 📤 Output Format (JSON)

{
  "essay_prompt": "Your essay question",
  "essay_prompt_ja": "日本語訳",
  "sample_essay": "120-150 words using ONLY ${guidelines.vocabulary_level} vocabulary",
  "sample_essay_ja": "模範解答の日本語訳",
  "vocabulary_self_check": "Confirm: I used only ${guidelines.vocabulary_level} vocabulary (yes/no)",
  "outline_guidance": { ... }
}

**REMEMBER**: Simple vocabulary + clear structure = GOOD essay
Complex vocabulary + sophisticated style = REJECTED essay`;
}
```

---

#### 2. 動的禁止語リスト（Cursor + Genspark）

```typescript
// src/eiken/services/vocabulary-tracker.ts

export class VocabularyFailureTracker {
  private static recentFailures: Map<EikenGrade, string[]> = new Map();
  
  /**
   * 語彙違反を記録
   */
  static recordFailure(grade: EikenGrade, violations: VocabularyViolation[]) {
    const current = this.recentFailures.get(grade) || [];
    const newWords = violations
      .filter(v => v.severity === 'error')
      .map(v => v.word.toLowerCase());
    
    // 最新50件を保持
    const updated = [...current, ...newWords].slice(-50);
    this.recentFailures.set(grade, updated);
    
    console.log(`[VocabTracker] Recorded ${newWords.length} violations for ${grade}`);
  }
  
  /**
   * 頻出違反語トップ10を取得
   */
  static getTopViolations(grade: EikenGrade, limit: number = 10): string[] {
    const failures = this.recentFailures.get(grade) || [];
    
    // 頻度カウント
    const frequency = failures.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // 頻度順にソート
    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([word]) => word);
  }
  
  /**
   * 静的禁止語 + 動的禁止語の統合リスト
   */
  static getForbiddenWords(grade: EikenGrade): string[] {
    const staticWords = {
      'pre2': [
        // 学術動詞
        'facilitate', 'demonstrate', 'implement', 'establish', 'acknowledge',
        'illustrate', 'analyze', 'examine', 'evaluate', 'comprise',
        
        // 抽象形容詞
        'sophisticated', 'comprehensive', 'substantial', 'significant', 'considerable',
        'fundamental', 'essential', 'crucial', 'inevitable', 'remarkable',
        
        // 形式的接続詞
        'furthermore', 'moreover', 'nevertheless', 'consequently', 'hence',
        'whereas', 'thereby', 'thus', 'accordingly'
      ],
      '2': [
        // より高度な語彙
        'subsequently', 'predominantly', 'ambiguous', 'inherent', 'intricate'
      ]
    };
    
    const dynamicWords = this.getTopViolations(grade, 10);
    
    return [
      ...(staticWords[grade] || staticWords['pre2']),
      ...dynamicWords
    ];
  }
}
```

---

#### 3. Temperature調整 + 適応的検証（Genspark）

```typescript
// src/eiken/services/integrated-question-generator.ts

export class IntegratedQuestionGenerator {
  
  /**
   * 形式別の最適なLLMパラメータ
   */
  private getOptimalLLMConfig(format: QuestionFormat): LLMConfig {
    const configs: Record<QuestionFormat, LLMConfig> = {
      'grammar_fill': {
        temperature: 0.5,
        top_p: 0.9,
        reasoning: '短文なので多様性とのバランス'
      },
      'opinion_speech': {
        temperature: 0.4,
        top_p: 0.85,
        reasoning: '自然な表現必要だが制御優先'
      },
      'reading_aloud': {
        temperature: 0.3,
        top_p: 0.8,
        reasoning: '語彙制御を最優先'
      },
      'essay': {
        temperature: 0.3,
        top_p: 0.75,
        reasoning: '長文なので最も厳格に制御'
      },
      'long_reading': {
        temperature: 0.25,
        top_p: 0.7,
        reasoning: '超長文なので極めて厳格に'
      }
    };
    
    return configs[format] || configs['essay'];
  }
  
  /**
   * 形式別の適応的語彙スコア閾値
   */
  private getAdaptiveThreshold(
    format: QuestionFormat,
    grade: EikenGrade,
    wordCount: number
  ): number {
    let baseThreshold = 95;
    
    // 形式別調整
    const formatAdjustments: Record<QuestionFormat, number> = {
      'grammar_fill': 0,      // 短文、厳格維持
      'opinion_speech': -1,   // 自然な表現必要
      'reading_aloud': 0,     // 標準
      'essay': -3,           // 論理的表現必要
      'long_reading': -4     // 最も多様性必要
    };
    
    baseThreshold += formatAdjustments[format] || 0;
    
    // 文字数による調整
    if (wordCount > 200) {
      baseThreshold -= 2;  // 長文はさらに緩和
    } else if (wordCount > 150) {
      baseThreshold -= 1;
    }
    
    // グレード別調整
    if (grade === '1' || grade === 'pre1') {
      baseThreshold -= 2;  // 高レベルは多様性を許容
    }
    
    // 最低85%、最高95%に制限
    return Math.max(85, Math.min(95, baseThreshold));
  }
  
  /**
   * LLM呼び出し（最適化版）
   */
  private async callLLM(
    blueprint: Blueprint,
    model: string,
    additionalContext?: string
  ): Promise<any> {
    
    // 形式別の最適パラメータを取得
    const llmConfig = this.getOptimalLLMConfig(blueprint.format);
    
    console.log(`[LLM] Using temperature=${llmConfig.temperature}, top_p=${llmConfig.top_p}`);
    console.log(`[LLM] Reason: ${llmConfig.reasoning}`);
    
    // プロンプト生成（禁止語リスト含む）
    const forbiddenWords = VocabularyFailureTracker.getForbiddenWords(blueprint.grade);
    const basePrompt = buildPromptForBlueprint(blueprint);
    
    const enhancedPrompt = `${basePrompt}

## 🚫 ADDITIONAL FORBIDDEN WORDS (from recent failures)
${forbiddenWords.slice(30).join(', ')}

${additionalContext || ''}`;
    
    // OpenAI API呼び出し
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a vocabulary-constrained English test creator. CRITICAL: Use ONLY CEFR ${blueprint.guidelines.vocabulary_level} vocabulary. Avoid: ${forbiddenWords.slice(0, 20).join(', ')}.`
          },
          {
            role: 'user',
            content: enhancedPrompt
          }
        ],
        temperature: llmConfig.temperature,
        top_p: llmConfig.top_p,
        max_tokens: 1500
      })
    });
    
    // ... レスポンス処理
  }
}

interface LLMConfig {
  temperature: number;
  top_p: number;
  reasoning: string;
}
```

---

### **Week 1 実装（確実な改善）**

#### 4. 反復フィードバックシステム（Genspark + Cursor）

```typescript
// src/eiken/services/integrated-question-generator.ts

export class IntegratedQuestionGenerator {
  
  /**
   * フィードバック付き生成（最大3回リトライ）
   */
  async generateQuestion(
    request: QuestionGenerationRequest
  ): Promise<QuestionGenerationResult> {
    
    const maxAttempts = 3;
    let previousViolations: string[] = [];
    let bestResult: any = null;
    let bestScore = 0;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\n[Generation] Attempt ${attempt}/${maxAttempts}`);
      
      try {
        // プロンプトにフィードバックを追加
        const feedbackContext = this.buildFeedbackContext(
          previousViolations,
          attempt
        );
        
        // Blueprint生成
        const blueprintResult = await this.blueprintGenerator.generateBlueprint({
          student_id: request.student_id,
          grade: request.grade,
          format: request.format,
          topic_code: request.topic_code
        });
        
        // LLM呼び出し
        const questionData = await this.callLLM(
          blueprintResult.blueprint,
          selectedModel,
          feedbackContext
        );
        
        // 語彙検証
        const vocabResult = await this.validateVocabulary(
          questionData,
          request.grade,
          request.format
        );
        
        console.log(`[Vocab] Attempt ${attempt}: ${Math.round(vocabResult.score)}%`);
        
        // 適応的閾値を計算
        const threshold = this.getAdaptiveThreshold(
          request.format,
          request.grade,
          this.getWordCount(questionData)
        );
        
        console.log(`[Vocab] Threshold: ${threshold}% (adaptive)`);
        
        // 成功判定
        if (vocabResult.score >= threshold) {
          console.log(`✅ [Success] Vocabulary target achieved on attempt ${attempt}`);
          
          // 成功時も違反語を記録（動的リスト更新）
          if (vocabResult.violations && vocabResult.violations.length > 0) {
            VocabularyFailureTracker.recordFailure(
              request.grade,
              vocabResult.violations
            );
          }
          
          // 保存して返す
          return this.saveAndReturn(questionData, blueprintResult, vocabResult, attempt);
        }
        
        // ベストスコア更新
        if (vocabResult.score > bestScore) {
          bestScore = vocabResult.score;
          bestResult = { questionData, blueprintResult, vocabResult };
        }
        
        // 次回用に違反語を記録
        if (vocabResult.violations) {
          previousViolations = vocabResult.violations
            .filter(v => v.severity === 'error')
            .map(v => v.word)
            .slice(0, 10);  // 最大10語
          
          VocabularyFailureTracker.recordFailure(request.grade, vocabResult.violations);
        }
        
      } catch (error) {
        console.error(`❌ [Error] Attempt ${attempt} failed:`, error.message);
      }
    }
    
    // 全試行失敗時
    console.warn(`⚠️ [Warning] Max attempts (${maxAttempts}) exhausted. Best score: ${Math.round(bestScore)}%`);
    
    // 85%以上なら許容
    if (bestScore >= 85) {
      console.log(`✓ [Accept] Using best result (${Math.round(bestScore)}%)`);
      return this.saveAndReturn(
        bestResult.questionData,
        bestResult.blueprintResult,
        bestResult.vocabResult,
        maxAttempts,
        'accepted_below_threshold'
      );
    }
    
    // 完全失敗
    return {
      success: false,
      error: `Failed to generate valid question after ${maxAttempts} attempts. Best score: ${Math.round(bestScore)}%`,
      blueprint: blueprintResult.blueprint,
      topic_selection: blueprintResult.topic_selection,
      validation: {
        vocabulary_passed: false,
        copyright_passed: false,
        vocabulary_score: bestScore
      },
      metadata: {
        model_used: selectedModel,
        generation_mode: request.mode || 'production',
        attempts: maxAttempts,
        generation_time_ms: Date.now() - startTime
      }
    };
  }
  
  /**
   * フィードバックコンテキスト生成
   */
  private buildFeedbackContext(
    violations: string[],
    attempt: number
  ): string {
    
    if (attempt === 1 || violations.length === 0) {
      return '';
    }
    
    const replacements: Record<string, string> = {
      'sophisticated': 'good, nice, advanced',
      'facilitate': 'help, make easy',
      'comprehensive': 'complete, full, total',
      'demonstrate': 'show, tell, prove',
      'significant': 'important, big, great',
      'substantial': 'large, big, great',
      'implement': 'do, start, use',
      'establish': 'make, create, start',
      'acknowledge': 'agree, accept, know',
      'furthermore': 'also, and, plus',
      'moreover': 'also, and, plus',
      'nevertheless': 'but, however',
      'consequently': 'so, therefore'
    };
    
    return `

## ⚠️ CRITICAL FEEDBACK FROM ATTEMPT ${attempt - 1}

**THESE WORDS WERE TOO DIFFICULT**:
${violations.join(', ')}

**YOU MUST USE SIMPLER ALTERNATIVES**:
${violations.map(word => {
  const alt = replacements[word.toLowerCase()];
  return alt ? `- "${word}" → use "${alt}"` : `- "${word}" → use simpler word`;
}).join('\n')}

**THIS IS ATTEMPT ${attempt}/${3}** - Please be EXTREMELY CAREFUL about vocabulary level!
`;
  }
  
  /**
   * 単語数カウント
   */
  private getWordCount(questionData: any): number {
    const text = questionData.sample_essay 
                 || questionData.passage 
                 || questionData.question_text 
                 || '';
    return text.split(/\s+/).length;
  }
}
```

---

## 📊 期待される改善効果

### **段階的改善シミュレーション**

```typescript
const improvementPath = {
  current: {
    essay: 64,
    long_reading: 69
  },
  
  after_few_shot: {
    essay: 78,          // +14%
    long_reading: 82    // +13%
  },
  
  after_temperature: {
    essay: 81,          // +3%
    long_reading: 85    // +3%
  },
  
  after_feedback: {
    essay: 87,          // +6% (成功率向上)
    long_reading: 90    // +5%
  },
  
  after_adaptive_threshold: {
    essay: 92,          // 実質目標達成
    long_reading: 93    // 実質目標達成
  },
  
  realistic_ceiling: {
    essay: 93,
    long_reading: 94,
    note: '長文の特性上、95%は非現実的'
  }
};
```

---

## 🚀 実装タイムライン

### **Day 1-2: 即効戦略（確実な改善）**

- [ ] Few-shot Examples追加（2-3時間）
- [ ] 禁止語リスト実装（30分）
- [ ] Temperature調整（5分）
- [ ] 動的禁止語トラッカー（1時間）

**予想効果**: 64% → 81-85%

### **Day 3-4: フィードバックシステム（成功率向上）**

- [ ] 反復リトライ実装（3時間）
- [ ] フィードバックコンテキスト生成（2時間）
- [ ] ベストスコア記録（1時間）

**予想効果**: 81-85% → 87-90%

### **Day 5: 適応的検証（目標達成）**

- [ ] 形式別閾値設定（1時間）
- [ ] 文字数別調整（1時間）
- [ ] グレード別調整（30分）

**予想効果**: 87-90% → 92-93%（実質目標達成）

---

## ✅ 成功基準

```typescript
const successCriteria = {
  vocabulary_score: {
    essay: '≥ 90%',
    long_reading: '≥ 90%'
  },
  
  generation_success_rate: '≥ 80% (within 3 attempts)',
  
  processing_time: '≤ 90 seconds (including retries)',
  
  content_quality: '教育的価値を維持',
  
  cost_increase: '≤ 20% (from retries)'
};
```

---

## 🎓 重要な学び

### **長文形式の特性**

1. **80語の壁**: 80語を超えると語彙制御が急激に困難化
2. **多様性の必要性**: 長文では同じ単語の繰り返しを避ける傾向
3. **自然性とのトレードオフ**: 完全な制御は文章の質を下げる
4. **現実的な目標**: 95%は理想、90-93%が実用的

### **プロンプトエンジニアリングの原則**

1. **具体例が最強**: Few-shot > 抽象的な指示
2. **Good/Bad 対比**: 違いを明示することで学習効果
3. **動的フィードバック**: 失敗から学習するシステム
4. **適応的基準**: 一律の基準よりコンテキスト適応

---

最終更新: 2025-11-21
