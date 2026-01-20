/**
 * Phase 6.9: Ambiguity Validator
 * 
 * 複数正解問題を防止するためのAI検証層
 * GPT-4o-miniを使用して、生成された問題に複数の正解候補がないかチェック
 */

export interface ValidationResult {
  isValid: boolean;
  hasMultipleCorrectAnswers: boolean;
  potentiallyCorrectChoices: string[];
  recommendation?: string;
  reasoning?: string;
}

export interface QuestionToValidate {
  question_text: string;
  choices: string[];
  correct_answer: string;
  grammar_point?: string;
}

/**
 * 複数正解の可能性をチェックする
 * 
 * @param question 検証する問題
 * @param apiKey OpenAI APIキー
 * @returns 検証結果
 */
export async function validateMultipleCorrectAnswers(
  question: QuestionToValidate,
  apiKey: string
): Promise<ValidationResult> {
  
  const validationPrompt = `あなたは英検問題の品質チェッカーです。以下の問題を厳密に分析してください。

【問題文】
${question.question_text}

【選択肢】
${question.choices.map((c, i) => `(${i + 1}) ${c}`).join('\n')}

【提示された正解】
${question.correct_answer}

${question.grammar_point ? `【文法ポイント】\n${question.grammar_point}\n\n` : ''}

## タスク

以下を確認してください：

1. **文法的正しさ**: 提示された正解以外の選択肢が、文法的に正しくないか確認
2. **意味的妥当性**: 文脈から考えて、正解以外の選択肢が意味的に不自然でないか確認
3. **曖昧性**: 複数の選択肢が文法的・意味的に正しい可能性がないか確認

## 判定基準

- **OK（問題なし）**: 正解が1つだけ明確で、他の選択肢は明らかに誤り
- **NG（複数正解の可能性）**: 2つ以上の選択肢が正しい可能性がある
- **要注意（微妙）**: 文脈によっては別の選択肢も正解になり得る

## 出力形式（必ずJSONで回答）

{
  "hasMultipleCorrectAnswers": true/false,
  "potentiallyCorrectChoices": ["(1) choice1", "(2) choice2"],
  "reasoning": "なぜそれらの選択肢も正解になり得るか、または正解が1つだけである理由",
  "recommendation": "問題を改善するための具体的な提案（複数正解がある場合のみ）"
}

**重要**: 厳密に判定してください。少しでも複数正解の可能性があれば指摘してください。`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'あなたは英語教育の専門家で、英検問題の品質を厳密にチェックします。複数正解の可能性がある問題を発見することが得意です。'
          },
          {
            role: 'user',
            content: validationPrompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3, // 一貫性のために低めに設定
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ambiguity validation API error:', response.status, errorText);
      
      // APIエラー時はフォールバック（問題を通す）
      return {
        isValid: true,
        hasMultipleCorrectAnswers: false,
        potentiallyCorrectChoices: [],
        reasoning: 'Validation API error - defaulting to accept'
      };
    }

    const result = await response.json();
    const validationData = JSON.parse(result.choices[0].message.content);

    console.log('🔍 Ambiguity validation result:', {
      question: question.question_text.substring(0, 50) + '...',
      hasMultipleCorrectAnswers: validationData.hasMultipleCorrectAnswers,
      potentiallyCorrect: validationData.potentiallyCorrectChoices
    });

    return {
      isValid: !validationData.hasMultipleCorrectAnswers,
      hasMultipleCorrectAnswers: validationData.hasMultipleCorrectAnswers,
      potentiallyCorrectChoices: validationData.potentiallyCorrectChoices || [],
      recommendation: validationData.recommendation,
      reasoning: validationData.reasoning
    };

  } catch (error) {
    console.error('❌ Ambiguity validation error:', error);
    
    // エラー時はフォールバック（問題を通す）
    return {
      isValid: true,
      hasMultipleCorrectAnswers: false,
      potentiallyCorrectChoices: [],
      reasoning: 'Validation error - defaulting to accept'
    };
  }
}

/**
 * 複数正解の可能性がある問題を修正する提案を生成
 * 
 * @param question 元の問題
 * @param validationResult 検証結果
 * @param apiKey OpenAI APIキー
 * @returns 修正提案
 */
export async function suggestFix(
  question: QuestionToValidate,
  validationResult: ValidationResult,
  apiKey: string
): Promise<string> {
  
  if (!validationResult.hasMultipleCorrectAnswers) {
    return 'No fix needed - question is clear';
  }

  const fixPrompt = `以下の英検問題は複数の正解候補があります。問題文を修正して、正解が1つだけになるようにしてください。

【現在の問題文】
${question.question_text}

【選択肢】
${question.choices.map((c, i) => `(${i + 1}) ${c}`).join('\n')}

【意図された正解】
${question.correct_answer}

【問題点】
${validationResult.reasoning}

【複数正解の可能性がある選択肢】
${validationResult.potentiallyCorrectChoices.join(', ')}

## タスク

問題文に文脈や手がかりを追加して、意図された正解（${question.correct_answer}）だけが正解になるように修正してください。

## 修正方針

1. 会話形式の場合: Speaker Aの発言に状況・時間・目的を明示
2. 単文の場合: 時間表現や文脈を追加
3. 文法ポイントが明確になるような手がかりを含める

## 出力形式（JSONで回答）

{
  "revised_question_text": "修正後の問題文",
  "explanation": "なぜこの修正で正解が1つになるか"
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'あなたは英検問題の修正の専門家です。曖昧な問題を明確にすることが得意です。'
          },
          {
            role: 'user',
            content: fixPrompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      return validationResult.recommendation || 'Could not generate fix suggestion';
    }

    const result = await response.json();
    const fixData = JSON.parse(result.choices[0].message.content);

    return `修正案: ${fixData.revised_question_text}\n\n理由: ${fixData.explanation}`;

  } catch (error) {
    console.error('❌ Fix suggestion error:', error);
    return validationResult.recommendation || 'Error generating fix suggestion';
  }
}
