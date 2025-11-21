/**
 * Phase 3: Format-Specific LLM Prompt Templates
 * 
 * 5つの問題形式それぞれに最適化されたプロンプトテンプレート
 */

import type { Blueprint, EikenGrade } from '../types';

/**
 * 文法穴埋め問題のプロンプト生成
 */
export function buildGrammarFillPrompt(blueprint: Blueprint): string {
  const { topic, guidelines, instructions } = blueprint;
  
  return `You are an expert English test creator for Japanese students preparing for Eiken (英検) ${blueprint.grade} level.

## Task
Create ONE grammar fill-in-the-blank question about "${topic.topic_label_en}" (${topic.topic_label_ja}).

## Topic Context
${topic.scenario_description}

## Requirements
${instructions.prompt_template}

## Vocabulary Level
- CEFR Level: ${guidelines.vocabulary_level}
- Use only words appropriate for ${blueprint.grade} level
- Sentence length: ${guidelines.sentence_length.target} words (±3)

## Grammar Focus
Target one of these grammar patterns:
${guidelines.grammar_patterns.map(g => `- ${g}`).join('\n')}

## Output Format (JSON)
{
  "question_text": "The sentence with _____ (blank)",
  "correct_answer": "the correct form",
  "distractors": ["wrong option 1", "wrong option 2", "wrong option 3"],
  "grammar_point": "what grammar is being tested",
  "explanation": "Why this is correct (in English). Include meanings of ALL choices.",
  "explanation_ja": "なぜこれが正解か（日本語で）。全ての選択肢の語彙の意味を含めること。",
  "translation_ja": "問題文の日本語訳",
  "vocabulary_meanings": {
    "correct_answer": "meaning in Japanese",
    "distractor_1": "meaning in Japanese",
    "distractor_2": "meaning in Japanese",
    "distractor_3": "meaning in Japanese"
  }
}

## Important Notes
- ONE blank per sentence only
- Provide clear context clues
- Distractors should be plausible but clearly wrong
- Use natural, authentic English
- The sentence must relate to the topic: ${topic.topic_label_en}
- MUST provide Japanese meanings for ALL vocabulary choices (correct answer + all distractors)`;
}

/**
 * 意見スピーチ問題のプロンプト生成
 */
export function buildOpinionSpeechPrompt(blueprint: Blueprint): string {
  const { topic, guidelines, instructions } = blueprint;
  
  return `You are an expert English test creator for Japanese students preparing for Eiken (英検) ${blueprint.grade} level.

## Task
Create an opinion speech question about "${topic.topic_label_en}" (${topic.topic_label_ja}).

## Topic Context
${topic.scenario_description}

## Requirements
${instructions.prompt_template}

## Target Response Length
- ${instructions.time_limit_minutes} minutes speaking time
- Approximately 40-80 words

## Vocabulary Level
- CEFR Level: ${guidelines.vocabulary_level}
- Sentence complexity: ${guidelines.complexity}

## Output Format (JSON)
{
  "question_text": "The opinion question prompt",
  "question_text_ja": "質問文の日本語訳",
  "sample_answer": "A good example answer (60-80 words)",
  "sample_answer_ja": "模範解答の日本語訳",
  "key_points": ["point 1", "point 2", "point 3"],
  "useful_expressions": ["expression 1", "expression 2"],
  "explanation": "What makes a good answer for this question",
  "explanation_ja": "良い回答のポイント（日本語で）"
}

## Important Notes
- The question should allow multiple viewpoints
- Be culturally appropriate for Japanese students
- Encourage personal opinion with reasons
- The topic: ${topic.topic_label_en}`;
}

/**
 * 音読問題のプロンプト生成
 */
export function buildReadingAloudPrompt(blueprint: Blueprint): string {
  const { topic, guidelines, instructions } = blueprint;
  
  return `You are an expert English test creator for Japanese students preparing for Eiken (英検) ${blueprint.grade} level.

## Task
Create a short passage for reading aloud practice about "${topic.topic_label_en}" (${topic.topic_label_ja}).

## Topic Context
${topic.scenario_description}

## Requirements
${instructions.prompt_template}

## Passage Specifications
- Length: 50-80 words
- ${instructions.time_limit_minutes} minutes reading time
- CEFR Level: ${guidelines.vocabulary_level}
- Sentence complexity: ${guidelines.complexity}

## Output Format (JSON)
{
  "passage": "The complete passage to read aloud",
  "passage_ja": "パッセージの日本語訳",
  "word_count": 65,
  "difficult_words": [
    {"word": "example", "pronunciation": "/ɪɡˈzæmpəl/", "meaning_ja": "例"}
  ],
  "focus_points": ["pronunciation tip 1", "pronunciation tip 2"],
  "focus_points_ja": ["発音のポイント1", "発音のポイント2"]
}

## Important Notes
- Use natural, flowing sentences
- Include varied sentence structures
- Avoid tongue-twisters
- Topic-relevant content: ${topic.topic_label_en}`;
}

/**
 * 長文読解問題のプロンプト生成
 */
export function buildLongReadingPrompt(blueprint: Blueprint): string {
  const { topic, guidelines, instructions } = blueprint;
  
  return `You are an expert English test creator for Japanese students preparing for Eiken (英検) ${blueprint.grade} level.

## Task
Create a reading comprehension passage with questions about "${topic.topic_label_en}" (${topic.topic_label_ja}).

## Topic Context
${topic.scenario_description}

## Requirements
${instructions.prompt_template}

## Passage Specifications
- Length: 200-300 words (for ${blueprint.grade} level)
- CEFR Level: ${guidelines.vocabulary_level}
- Complexity: ${guidelines.complexity}
- Number of questions: 3-4

## Output Format (JSON)
{
  "passage": "The complete reading passage",
  "passage_ja": "パッセージの日本語訳",
  "word_count": 250,
  "questions": [
    {
      "question_text": "What is the main idea?",
      "choices": ["A) option 1", "B) option 2", "C) option 3", "D) option 4"],
      "correct_answer": "A",
      "explanation": "Why A is correct. Explain why other choices are wrong.",
      "explanation_ja": "なぜAが正解か。他の選択肢が不正解である理由も説明すること。"
    }
  ],
  "vocabulary_notes": [
    {"word": "term", "meaning_ja": "用語"}
  ]
}

## Important Notes
- Passage should have clear structure (intro, body, conclusion)
- Questions test different skills (main idea, details, inference)
- All information needed to answer must be in the passage
- Topic: ${topic.topic_label_en}
- For each question, explanation MUST cover why the correct answer is right AND why each wrong choice is incorrect`;
}

/**
 * エッセイ問題のプロンプト生成
 */
export function buildEssayPrompt(blueprint: Blueprint): string {
  const { topic, guidelines, instructions } = blueprint;
  
  return `You are an expert English test creator for Japanese students preparing for Eiken (英検) ${blueprint.grade} level.

## Task
Create an essay writing prompt about "${topic.topic_label_en}" (${topic.topic_label_ja}).

## Topic Context
${topic.scenario_description}

## Requirements
${instructions.prompt_template}

## Essay Specifications
- Target length: 120-150 words (for ${blueprint.grade} level)
- Writing time: ${instructions.time_limit_minutes} minutes
- CEFR Level: ${guidelines.vocabulary_level}
- Structure: Introduction, Body (2-3 paragraphs), Conclusion

## Output Format (JSON)
{
  "essay_prompt": "The essay question/prompt",
  "essay_prompt_ja": "エッセイ課題の日本語訳",
  "outline_guidance": {
    "introduction": "What to include in the introduction",
    "body_points": ["Main point 1", "Main point 2"],
    "conclusion": "How to conclude"
  },
  "outline_guidance_ja": {
    "introduction": "序論に含めるべき内容",
    "body_points": ["本論のポイント1", "本論のポイント2"],
    "conclusion": "結論の書き方"
  },
  "sample_essay": "A complete model essay (120-150 words)",
  "sample_essay_ja": "模範解答の日本語訳",
  "useful_expressions": ["expression 1", "expression 2", "expression 3"],
  "common_mistakes": ["mistake to avoid 1", "mistake to avoid 2"]
}

## Important Notes
- The prompt should be clear and focused
- Allow for different perspectives
- Appropriate difficulty for ${blueprint.grade} level
- Topic: ${topic.topic_label_en}`;
}

/**
 * Blueprint に基づいて適切なプロンプトを選択
 */
export function buildPromptForBlueprint(blueprint: Blueprint): string {
  switch (blueprint.format) {
    case 'grammar_fill':
      return buildGrammarFillPrompt(blueprint);
    case 'opinion_speech':
      return buildOpinionSpeechPrompt(blueprint);
    case 'reading_aloud':
      return buildReadingAloudPrompt(blueprint);
    case 'long_reading':
      return buildLongReadingPrompt(blueprint);
    case 'essay':
      return buildEssayPrompt(blueprint);
    default:
      throw new Error(`Unknown format: ${blueprint.format}`);
  }
}
