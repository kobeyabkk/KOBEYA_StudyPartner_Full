/**
 * 📋 小論文添削システム - 2段階評価ロジック
 * 
 * Stage 1: 形式・制約チェック（門番）
 * Stage 2: 内容評価（ルーブリック採点）
 */

// =====================================
// 型定義
// =====================================

export interface EssayInput {
  essayText: string;
  themeTitle: string;
  mainProblem: string;
  targetCharCount: number;
  themeKeywords?: string[];
  constraints?: string[];
}

export interface Stage1Result {
  passed: boolean;
  scoreUpperLimit?: number;
  reasons: string[];
  checks: {
    charCount: CheckResult;
    themeKeywords: CheckResult;
    constraints: CheckResult;
  };
}

export interface CheckResult {
  passed: boolean;
  reason?: string;
  details?: any;
}

export interface Stage2Input {
  essayText: string;
  themeTitle: string;
  mainProblem: string;
  targetCharCount: number;
}

export interface Stage2Result {
  scores: {
    themeRelevance: number;     // テーマとの関連性 /25
    logicStructure: number;      // 論理構成 /25
    specificity: number;         // 具体性 /20
    expression: number;          // 表現力 /15
    structure: number;           // 構成 /15
  };
  overallScore: number;
  feedback: {
    positive: string[];
    critical: string[];
    nextAction: string[];
  };
  exampleImprovement?: string;
}

export interface FinalEvaluation {
  stage1: Stage1Result;
  stage2?: Stage2Result;
  finalScore: number;
  displayMessage: string;
}

// =====================================
// Stage 1: 形式・制約チェック
// =====================================

/**
 * Stage 1-A: 文字数チェック
 * 70%未満 → NG
 */
export function checkCharCount(
  actualCount: number,
  targetCount: number,
  step: 1 | 3 | 4 | 5
): CheckResult {
  const ratio = actualCount / targetCount;
  
  // Step 1/3（短文）: 70%未満でNG
  // Step 4/5（本練習）: 60%未満でNG
  const threshold = (step === 1 || step === 3) ? 0.7 : 0.6;
  
  if (ratio < threshold) {
    const shortage = targetCount - actualCount;
    return {
      passed: false,
      reason: `文字数が目標の${Math.round(ratio * 100)}%（${actualCount}字/${targetCount}字）です。あと${shortage}字必要です。`,
      details: {
        actual: actualCount,
        target: targetCount,
        ratio: ratio,
        shortage: shortage
      }
    };
  }
  
  return { passed: true };
}

/**
 * Stage 1-B: テーマキーワードチェック
 * 必須キーワードが1つも含まれていない → NG
 */
export function checkThemeKeywords(
  essayText: string,
  themeKeywords: string[]
): CheckResult {
  if (!themeKeywords || themeKeywords.length === 0) {
    // キーワードが指定されていない場合はスキップ
    return { passed: true };
  }
  
  const foundKeywords = themeKeywords.filter(keyword => 
    essayText.includes(keyword)
  );
  
  if (foundKeywords.length === 0) {
    return {
      passed: false,
      reason: `テーマキーワード（${themeKeywords.join('、')}）が1つも使用されていません。`,
      details: {
        required: themeKeywords,
        found: foundKeywords
      }
    };
  }
  
  return { 
    passed: true,
    details: {
      found: foundKeywords
    }
  };
}

/**
 * Stage 1-C: 制約条件チェック
 * 指定された制約条件（例: 「2つ挙げよ」「賛成の立場で」）を満たしているか
 */
export function checkConstraints(
  essayText: string,
  constraints: string[]
): CheckResult {
  if (!constraints || constraints.length === 0) {
    // 制約条件が指定されていない場合はスキップ
    return { passed: true };
  }
  
  // TODO: 将来的にはLLMで判定
  // 現時点では簡易的なキーワードチェック
  const violations: string[] = [];
  
  for (const constraint of constraints) {
    // 例: 「賛成の立場」という制約がある場合
    if (constraint.includes('賛成') && !essayText.includes('賛成')) {
      violations.push(`「${constraint}」の条件を満たしていません`);
    }
    // 例: 「反対の立場」という制約がある場合
    if (constraint.includes('反対') && !essayText.includes('反対')) {
      violations.push(`「${constraint}」の条件を満たしていません`);
    }
  }
  
  if (violations.length > 0) {
    return {
      passed: false,
      reason: violations.join('、'),
      details: {
        constraints: constraints,
        violations: violations
      }
    };
  }
  
  return { passed: true };
}

/**
 * Stage 1 統合実行
 */
export function executeStage1(
  input: EssayInput,
  step: 1 | 3 | 4 | 5
): Stage1Result {
  const charCountCheck = checkCharCount(
    input.essayText.length,
    input.targetCharCount,
    step
  );
  
  const themeKeywordsCheck = checkThemeKeywords(
    input.essayText,
    input.themeKeywords || []
  );
  
  const constraintsCheck = checkConstraints(
    input.essayText,
    input.constraints || []
  );
  
  // いずれか1つでもNGなら、Stage1失敗
  const passed = charCountCheck.passed && 
                 themeKeywordsCheck.passed && 
                 constraintsCheck.passed;
  
  const reasons: string[] = [];
  if (!charCountCheck.passed) reasons.push(charCountCheck.reason!);
  if (!themeKeywordsCheck.passed) reasons.push(themeKeywordsCheck.reason!);
  if (!constraintsCheck.passed) reasons.push(constraintsCheck.reason!);
  
  return {
    passed,
    scoreUpperLimit: passed ? undefined : 40,
    reasons,
    checks: {
      charCount: charCountCheck,
      themeKeywords: themeKeywordsCheck,
      constraints: constraintsCheck
    }
  };
}

// =====================================
// Stage 2: 内容評価（プロンプト生成）
// =====================================

/**
 * Stage 2用のシステムプロンプト生成
 * temperature: 0.1-0.2 推奨
 */
export function generateStage2SystemPrompt(): string {
  return `あなたは経験豊富な小論文指導の専門家です。

【重要な前提】
この答案は、すでに以下の形式チェックを通過しています：
- 文字数要件を満たしている
- テーマキーワードを使用している
- 制約条件を満たしている

あなたの役割は、内容の質を以下のルーブリックで厳格に評価することです。

【採点ルーブリック】（100点満点）

1. テーマとの関連性 (/25点)
   【最重要・絶対厳守】この項目が最も重要です。テーマから外れている場合は容赦なく0-5点を付けてください。
   
   **厳格な判定基準（必ず守ること）**
   - **数学・物理・化学などの問題が含まれている場合 → 即座に 0点**
   - **テーマと全く無関係な話題（例：数式、確率計算、化学式など）が含まれている場合 → 即座に 0点**
   - **テーマのキーワードが含まれているだけでは不十分。テーマの核心について論じているかを厳格に判定**
   
   25-23点: 設問意図を完全に理解し、テーマの核心について深く考察している
   22-18点: テーマを理解しているが、一部の考察が浅い
   17-13点: テーマに部分的に関連しているが、主要な論点がズレている
   12-8点: テーマとの関連性が薄く、主要な論点に触れていない
   7-5点: テーマとほとんど無関係な内容
   4-0点: **完全に無関係な内容、数学・理科の問題、または全く異なる話題**
   
   【厳格な例】
   - テーマが「看護とテクノロジー」なのに「サイコロの確率計算」が含まれている → **0点（即座に不合格）**
   - テーマが「SNSの影響」なのに「数学の証明問題」が含まれている → **0点（即座に不合格）**
   - テーマが「デジタルデバイド」なのに「看護とテクノロジー」について書いている → 0-7点

2. 論理構成 (/25点)
   25-23点: 主張→理由→結論が明確で、因果関係が完璧
   22-18点: 論理構成は見えるが、一部不完全
   17-13点: 論理構成が不明瞭、または飛躍がある
   12-0点: 論理が破綻している

3. 具体性 (/20点)
   20-18点: 具体例が2つ以上あり、詳細で説得力がある
   17-14点: 具体例が1つあり、ある程度詳細
   13-10点: 具体例があるが、抽象的
   9-0点: 具体例がない、または不十分

4. 表現力 (/15点)
   15-13点: 文章が明確で自然、小論文らしい丁寧な文体
   12-10点: 文章は理解できるが、一部不自然な表現あり
   9-7点: 多くの不自然な表現、または口語的すぎる
   6-0点: 文章が不明瞭、または著しく不自然

5. 構成 (/15点)
   15-13点: 段落分けが明確で、展開が整理されている
   12-10点: 段落はあるが、やや不明瞭
   9-7点: 段落分けが不十分
   6-0点: 構成が混乱している

【評価の手順】（必ず守ること）
1. **【最優先】テーマとの関連性を超厳格にチェック**
   - **ステップ1**: 本文に数学・物理・化学などの問題（数式、確率、化学式など）が含まれていないか確認
     → 含まれている場合は即座に themeRelevance = 0点、overallScore = 0-10点
   - **ステップ2**: テーマのキーワードが本文に含まれているか
   - **ステップ3**: テーマの核心的な問題について論じているか
   - **ステップ4**: テーマから外れている場合は、themeRelevance を 0-5点とすること
2. 答案全体を読み、主張文を特定する
3. 各評価項目について、ルーブリックと照らし合わせて点数を決定
4. 各項目の点数を合計してoverallScoreを算出
5. フィードバックを作成（事実ベース、具体的に）

【厳格な採点の原則】
- テーマと無関係な内容を書いている場合、他の項目が良くても低い点数とする
- 「テクノロジー」などの抽象的なキーワードが共通していても、テーマの核心が異なれば低評価
- 疑わしい場合は、厳しく採点する

【出力形式】（JSON、必須）
{
  "scores": {
    "themeRelevance": 20,
    "logicStructure": 18,
    "specificity": 15,
    "expression": 12,
    "structure": 11
  },
  "overallScore": 76,
  "feedback": {
    "positive": ["良い点1", "良い点2"],
    "critical": ["改善点1", "改善点2"],
    "nextAction": ["次のアクション1", "次のアクション2"]
  },
  "exampleImprovement": "【改善例文（全文）】\\n生徒の小論文を参考に、同じ文字数で改善した完全な小論文を作成してください。\\n\\n（改善された小論文全文を記述）"
}

【注意点】
- 各項目の点数は必ずルーブリックに従うこと
- overallScoreは必ず5項目の合計であること
- positive, critical, nextActionは各2つ以上
- 事実に基づいた具体的なフィードバックを心がけること
- 「良く書けています」のような抽象的な褒め言葉は避けること
- **exampleImprovementは生徒の小論文全文を改善した完全版を提供すること**
- **改善例文は元の文字数と同程度（±50字以内）にすること**
- **改善例文では、生徒の主張を活かしながら、論理性・具体性・表現力を向上させること**`;
}

/**
 * Stage 2用のユーザープロンプト生成
 */
export function generateStage2UserPrompt(input: Stage2Input): string {
  return `以下の小論文を、ルーブリックに従って採点してください。

【テーマ】
${input.themeTitle}

【課題】
${input.mainProblem}

【目標文字数】
${input.targetCharCount}字

【生徒の小論文】
${input.essayText}

【実際の文字数】
${input.essayText.length}字

各評価項目について、必ずルーブリックと照らし合わせて点数を決定し、JSONで出力してください。`;
}

// =====================================
// ユーティリティ関数
// =====================================

/**
 * Stage1 NGの場合の表示メッセージ生成
 */
export function generateStage1FailMessage(stage1Result: Stage1Result): string {
  const reasons = stage1Result.reasons.join('\n- ');
  
  return `【形式チェック結果】

❌ 以下の理由により、内容評価に進めませんでした：

- ${reasons}

📊 現在のスコア: ${stage1Result.scoreUpperLimit}点（上限）

💡 次にやるべきこと：
上記の形式要件を満たしてから、もう一度提出してください。
形式を整えることで、内容の質が正しく評価されます。

⚠️ 重要：
入試では形式要件も厳格に評価されます。
内容が良くても、形式で減点されることを忘れないでください。`;
}

/**
 * 最終評価メッセージ生成
 */
export function generateFinalMessage(
  stage1: Stage1Result,
  stage2: Stage2Result
): string {
  const { scores, overallScore, feedback } = stage2;
  
  return `📊 採点結果

━━━━━━━━━━━━━━━━
総合評価: ${overallScore}点 / 100点
━━━━━━━━━━━━━━━━

【配点内訳】
✅ テーマとの関連性: ${scores.themeRelevance}/25点
✅ 論理構成: ${scores.logicStructure}/25点
✅ 具体性: ${scores.specificity}/20点
✅ 表現力: ${scores.expression}/15点
✅ 構成: ${scores.structure}/15点

━━━━━━━━━━━━━━━━

✨ 良かった点：
${feedback.positive.map((p, i) => `${i + 1}. ${p}`).join('\n')}

📝 改善点：
${feedback.critical.map((c, i) => `${i + 1}. ${c}`).join('\n')}

🎯 次のステップ：
${feedback.nextAction.map((a, i) => `${i + 1}. ${a}`).join('\n')}

${stage2.exampleImprovement ? `\n━━━━━━━━━━━━━━━━\n${stage2.exampleImprovement}` : ''}`;
}
