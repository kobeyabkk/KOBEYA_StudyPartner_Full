/**
 * 読解問題自動生成API
 * 
 * POST /api/reading-comprehension/generate-questions
 * - 本文・タイトルから読解問題を生成
 * 
 * POST /api/reading-comprehension/extract-metadata
 * - 本文からメタ情報（主人公・時・場所など）を抽出
 */

import { Hono } from 'hono';
import type {
  Question,
  ChoiceQuestion,
  ExtractQuestion,
  OrderQuestion,
  StoryMetadata,
  Grade,
  QuestionGenerationOptions
} from '../utils/reading-comprehension-generator';
import {
  generateBasicQuestionsForLowGrade,
  generateQuestionsForMidGrade,
  generateQuestionsForHighGrade
} from '../utils/reading-comprehension-generator';

type Bindings = {
  OPENAI_API_KEY: string;
  DB?: D1Database;
};

const router = new Hono<{ Bindings: Bindings }>();

// ==================== 問題生成API ====================

interface GenerateQuestionsRequest {
  body: string;
  title: string;
  grade: Grade;
  metadata?: StoryMetadata;
  options?: QuestionGenerationOptions;
}

interface GenerateQuestionsResponse {
  questions: Question[];
  metadata?: StoryMetadata;
  generatedAt: string;
}

router.post('/generate-questions', async (c) => {
  try {
    const requestData: GenerateQuestionsRequest = await c.req.json();
    const { body, title, grade, metadata, options } = requestData;

    if (!body || !title || !grade) {
      return c.json(
        {
          ok: false,
          error: 'missing_required_fields',
          message: '本文・タイトル・学年は必須です'
        },
        400
      );
    }

    let questions: Question[] = [];

    // 学年に応じた問題生成
    switch (grade) {
      case 'low':
        questions = generateBasicQuestionsForLowGrade(body, title, metadata);
        break;
      case 'mid':
        questions = await generateQuestionsForMidGrade(
          body,
          title,
          metadata,
          options?.useLLM ?? false
        );
        break;
      case 'high':
        questions = await generateQuestionsForHighGrade(body, title, metadata);
        break;
    }

    // 問題数制限
    const questionCount = options?.questionCount || (grade === 'low' ? 5 : grade === 'mid' ? 6 : 7);
    questions = questions.slice(0, questionCount);

    const response: GenerateQuestionsResponse = {
      questions,
      metadata: metadata || undefined,
      generatedAt: new Date().toISOString()
    };

    return c.json({ ok: true, ...response }, 200);
  } catch (error) {
    console.error('❌ Generate questions error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        ok: false,
        error: 'generation_error',
        message: errorMessage
      },
      500
    );
  }
});

// ==================== メタ情報抽出API（LLM使用） ====================

interface ExtractMetadataRequest {
  body: string;
  title: string;
}

interface ExtractMetadataResponse {
  metadata: StoryMetadata;
  extractedAt: string;
}

router.post('/extract-metadata', async (c) => {
  try {
    const requestData: ExtractMetadataRequest = await c.req.json();
    const { body, title } = requestData;

    if (!body || !title) {
      return c.json(
        {
          ok: false,
          error: 'missing_required_fields',
          message: '本文・タイトルは必須です'
        },
        400
      );
    }

    const apiKey = c.env?.OPENAI_API_KEY;
    if (!apiKey) {
      return c.json(
        {
          ok: false,
          error: 'api_key_missing',
          message: 'OpenAI APIキーが設定されていません'
        },
        500
      );
    }

    // LLMでメタ情報を抽出
    const metadata = await extractMetadataWithLLM(body, title, apiKey);

    const response: ExtractMetadataResponse = {
      metadata,
      extractedAt: new Date().toISOString()
    };

    return c.json({ ok: true, ...response }, 200);
  } catch (error) {
    console.error('❌ Extract metadata error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        ok: false,
        error: 'extraction_error',
        message: errorMessage
      },
      500
    );
  }
});

// ==================== LLM統合関数 ====================

/**
 * LLMでメタ情報を抽出
 */
async function extractMetadataWithLLM(
  body: string,
  title: string,
  apiKey: string
): Promise<StoryMetadata> {
  const prompt = `
あなたは小学生向け読解問題の専門家です。
以下の物語を読んで、メタ情報を抽出してください。

【物語】
タイトル: ${title}

${body}

【指示】
以下の情報を抽出し、JSON形式で出力してください：
- mainCharacter: 主人公（簡潔に）
- time: 時（「ある日」「朝」など）
- place: 場所（簡潔に）
- mainEvent: 主な出来事（30文字以内）
- feelings: 心情の変化（配列）
  - character: キャラクター名
  - emotion: 感情（「うれしい」「かなしい」など）
  - reason: その感情の理由（簡潔に）
  - sourceText: 本文の該当箇所（50文字以内）

【出力形式】JSONのみ
{
  "mainCharacter": "主人公名",
  "time": "時",
  "place": "場所",
  "mainEvent": "主な出来事",
  "feelings": [
    {
      "character": "キャラクター名",
      "emotion": "感情",
      "reason": "理由",
      "sourceText": "本文の該当箇所"
    }
  ],
  "extractedBy": "llm"
}
`;

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
          content: 'あなたは小学生向け読解問題の専門家です。メタ情報を正確に抽出してください。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // JSON抽出
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM応答からJSONを抽出できませんでした');
  }

  try {
    const metadata = JSON.parse(jsonMatch[0]) as StoryMetadata;
    metadata.extractedBy = 'llm';
    return metadata;
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    throw new Error('メタ情報のJSON解析に失敗しました');
  }
}

/**
 * LLMで中学年向け理由問題を生成
 */
export async function generateWhyQuestionWithLLM(
  body: string,
  metadata?: StoryMetadata,
  apiKey?: string
): Promise<ChoiceQuestion[]> {
  if (!apiKey) {
    throw new Error('OpenAI APIキーが必要です');
  }

  const prompt = `
あなたは小学生向け読解問題の専門家です。
以下の物語を読んで、中学年（3-4年生）向けの理由問題を生成してください。

【物語】
${body}

【指示】
「なぜ〜したのですか」という理由を問う問題を1-2問生成してください。

【要件】
- 問題文は、小学生が理解しやすい簡潔な日本語で
- 選択肢は3つ、本文に基づいた正解を1つ、本文と矛盾しない誤答を2つ
- 正解の根拠となる本文の箇所を明記

【出力形式】JSON形式
{
  "questions": [
    {
      "text": "問題文",
      "choices": ["選択肢1", "選択肢2", "選択肢3"],
      "answer": 0,
      "type": "why",
      "sourceText": "本文の該当箇所"
    }
  ]
}
`;

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
          content: 'あなたは小学生向け読解問題の専門家です。適切な問題を生成してください。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1500
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM応答からJSONを抽出できませんでした');
  }

  try {
    const result = JSON.parse(jsonMatch[0]) as { questions: ChoiceQuestion[] };
    return result.questions.map(q => ({
      ...q,
      format: 'choice' as const
    }));
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    throw new Error('問題のJSON解析に失敗しました');
  }
}

/**
 * LLMで高学年向け多様な問題を生成
 */
export async function generateDiverseQuestionsWithLLM(
  body: string,
  title: string,
  metadata?: StoryMetadata,
  apiKey?: string
): Promise<Question[]> {
  if (!apiKey) {
    throw new Error('OpenAI APIキーが必要です');
  }

  const prompt = `
あなたは小学生向け読解問題の専門家です。
以下の物語を読んで、高学年（5-6年生）向けの読解問題を7問生成してください。

【物語】
タイトル: ${title}
${body}

【指示】
以下の形式の問題をバランスよく生成してください：
1. 基本理解問題（だれ・いつ・どこ・なに）: 2-3問
2. 理由・心情問題: 1-2問
3. 抜き出し問題: 1問（15文字以内の抜き出し）
4. 要約・主旨問題: 1問
5. 文の順序入れかえ問題: 1問（4つの文を並び替え）

【要件】
- 問題文は、小学生が理解しやすい簡潔な日本語で
- 選択問題は4択、本文に基づいた正解を1つ、本文と矛盾しない誤答を3つ
- 抜き出し問題は、本文から15文字以内で抜き出せる箇所を指定
- 順序入れかえ問題は、4つの文を並び替える形式

【出力形式】JSON形式
{
  "questions": [
    {
      "text": "問題文",
      "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "answer": 0,
      "type": "who",
      "format": "choice"
    },
    {
      "text": "問題文",
      "correctAnswer": "抜き出す文字列",
      "type": "extract",
      "format": "extract",
      "sourceText": "本文の該当箇所",
      "maxLength": 15
    },
    {
      "text": "問題文",
      "sentences": ["文1", "文2", "文3", "文4"],
      "correctOrder": [2, 0, 1, 3],
      "type": "order",
      "format": "order",
      "sourceText": "本文の該当箇所"
    }
  ]
}
`;

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
          content: 'あなたは小学生向け読解問題の専門家です。多様な形式の問題を生成してください。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 3000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM応答からJSONを抽出できませんでした');
  }

  try {
    const result = JSON.parse(jsonMatch[0]) as { questions: Question[] };
    return result.questions;
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    throw new Error('問題のJSON解析に失敗しました');
  }
}

// ==================== 中学年用理由問題生成API ====================

router.post('/generate-why', async (c) => {
  try {
    const requestData = await c.req.json();
    const { body, metadata } = requestData;

    if (!body) {
      return c.json({ ok: false, error: 'missing_body' }, 400);
    }

    const apiKey = c.env?.OPENAI_API_KEY;
    if (!apiKey) {
      return c.json({ ok: false, error: 'api_key_missing' }, 500);
    }

    const questions = await generateWhyQuestionWithLLM(body, metadata, apiKey);
    return c.json({ ok: true, questions }, 200);
  } catch (error) {
    console.error('❌ Generate why questions error:', error);
    return c.json(
      { ok: false, error: 'generation_error', message: String(error) },
      500
    );
  }
});

// ==================== 高学年用多様な問題生成API ====================

router.post('/generate-diverse', async (c) => {
  try {
    const requestData = await c.req.json();
    const { body, title, metadata } = requestData;

    if (!body || !title) {
      return c.json({ ok: false, error: 'missing_required_fields' }, 400);
    }

    const apiKey = c.env?.OPENAI_API_KEY;
    if (!apiKey) {
      return c.json({ ok: false, error: 'api_key_missing' }, 500);
    }

    const questions = await generateDiverseQuestionsWithLLM(body, title, metadata, apiKey);
    return c.json({ ok: true, questions }, 200);
  } catch (error) {
    console.error('❌ Generate diverse questions error:', error);
    return c.json(
      { ok: false, error: 'generation_error', message: String(error) },
      500
    );
  }
});

export default router;

