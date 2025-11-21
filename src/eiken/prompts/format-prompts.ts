/**
 * Phase 3: Format-Specific LLM Prompt Templates
 * 
 * 5つの問題形式それぞれに最適化されたプロンプトテンプレート
 * Phase 4: Few-shot Examples with Good/Bad comparison for vocabulary quality
 */

import type { Blueprint, EikenGrade } from '../types';

// ====================
// Few-shot Examples for Vocabulary Control
// ====================

/**
 * Essay形式のFew-shot例（Good vs Bad）
 */
const ESSAY_FEW_SHOT_EXAMPLES = {
  good: `"Many people think that studying English is important. I agree with this idea. First, English helps us communicate with people from other countries. Second, we can get more information from the internet if we know English. Third, many companies want workers who can speak English. In conclusion, I believe everyone should study English hard."`,
  
  good_analysis: "Uses only A2-B1 words: think, study, important, agree, help, communicate, people, country, information, internet, know, company, want, worker, speak, believe, hard",
  
  bad: `"Numerous individuals argue that acquiring proficiency in English is essential for contemporary society. I concur with this perspective. Primarily, English facilitates international communication. Furthermore, it enables access to comprehensive information resources. Moreover, organizations demonstrate preference for multilingual candidates."`,
  
  bad_problems: [
    "'numerous' (C1) → use 'many' (A2)",
    "'individuals' (B2) → use 'people' (A1)",
    "'acquiring proficiency' (C1) → use 'learning' or 'studying' (A2)",
    "'essential' (B2) → use 'important' (A2)",
    "'contemporary' (C1) → use 'modern' (B1) or 'today's' (A2)",
    "'concur' (C1) → use 'agree' (A2)",
    "'facilitates' (C1) → use 'helps' (A2)",
    "'enables' (B2) → use 'lets us' (A2)",
    "'comprehensive' (C1) → use 'a lot of' or 'much' (A2)",
    "'demonstrate preference' (C1) → use 'like' or 'want' (A2)",
    "'multilingual' (B2) → use 'can speak many languages' (A2)"
  ]
};

/**
 * Long Reading形式のFew-shot例
 */
const LONG_READING_FEW_SHOT_EXAMPLES = {
  good: `"Many young people today spend a lot of time using smartphones. They use them to talk to friends, play games, and look at pictures. But some people worry that smartphones are not good for children.

First, using smartphones too much can make people tired. When you look at a small screen for a long time, your eyes get tired. Also, many young people stay up late because they are using their phones. This makes them feel sleepy during the day.

Second, spending too much time on smartphones means less time for other important things. Children need to play outside, do homework, and talk to their family. If they use smartphones all day, they don't have time for these activities.

However, smartphones can also be useful. We can use them to learn new things and keep in touch with friends who live far away. The important thing is to use smartphones in a good way, not too much."`,
  
  good_analysis: "Uses mostly A2-B1 vocabulary: spend, time, smartphone, talk, friend, worry, tired, screen, stay up late, sleepy, important, play, outside, homework, useful, learn, keep in touch",
  
  bad: `"Contemporary adolescents demonstrate substantial engagement with mobile technology. They utilize these devices to facilitate social interaction, participate in recreational activities, and access visual content. Nevertheless, numerous stakeholders express concern regarding the implications of smartphone usage among minors.

Primarily, excessive screen time contributes to physiological fatigue. Prolonged exposure to diminutive displays induces ocular strain. Furthermore, adolescents frequently maintain irregular sleep patterns due to nocturnal device usage, subsequently experiencing daytime somnolence.

Additionally, disproportionate smartphone engagement diminishes opportunities for alternative essential activities. Children require physical outdoor recreation, academic responsibilities, and familial communication. Comprehensive device utilization precludes adequate time allocation for these pursuits."`,
  
  bad_problems: [
    "'contemporary adolescents' (C1) → use 'young people today' (A2)",
    "'demonstrate substantial engagement' (C1) → use 'spend a lot of time' (A2)",
    "'utilize' (C1) → use 'use' (A1)",
    "'facilitate social interaction' (C1) → use 'talk to friends' (A2)",
    "'participate in recreational activities' (C1) → use 'play games' (A2)",
    "'stakeholders' (C1) → use 'people' (A1)",
    "'implications' (C1) → use 'effects' or 'results' (B1)",
    "'primarily' (B2) → use 'first' (A1)",
    "'physiological fatigue' (C2) → use 'being tired' (A2)",
    "'prolonged exposure' (C1) → use 'looking for a long time' (A2)",
    "'diminutive displays' (C2) → use 'small screens' (A2)",
    "'induces ocular strain' (C2) → use 'makes eyes tired' (A2)",
    "'subsequently' (C1) → use 'then' (A2)"
  ]
};

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

## 🎯 CRITICAL VOCABULARY REQUIREMENTS (PRIMARY GOAL FOR LONG PASSAGES)

**TARGET LEVEL**: ${guidelines.vocabulary_level} ONLY
**SUCCESS CRITERIA**: 90%+ of words must be within ${guidelines.vocabulary_level} (slightly relaxed for long passages)
**FAILURE CONSEQUENCE**: If too many difficult words, passage will be REJECTED

## 🚫 FORBIDDEN WORDS (NEVER USE IN 200-300 WORD PASSAGES)

**Academic Verbs**: facilitate, demonstrate, implement, establish, utilize, constitute, articulate
**Abstract Adjectives**: sophisticated, comprehensive, substantial, considerable, prominent, profound, intricate
**Formal Connectors**: furthermore, moreover, nevertheless, consequently, hence, whereas, thereby, notwithstanding
**C1/C2 Words**: contemporary, predominantly, subsequently, ambiguous, endeavor, implications, stakeholders

## ✅ GOOD EXAMPLE (92% vocabulary score - FOLLOW THIS STYLE)

${LONG_READING_FEW_SHOT_EXAMPLES.good}

**Why this works**:
${LONG_READING_FEW_SHOT_EXAMPLES.good_analysis}

## ❌ BAD EXAMPLE (69% vocabulary score - DO NOT IMITATE)

${LONG_READING_FEW_SHOT_EXAMPLES.bad}

**Problems identified**:
${LONG_READING_FEW_SHOT_EXAMPLES.bad_problems.map(p => `- ${p}`).join('\n')}

## 📝 WRITING STRATEGY FOR LONG PASSAGES

1. **Use short sentences** (12-18 words maximum)
2. **Repeat key words**: Don't avoid repetition - clarity is more important than variety
3. **Choose simple words**: today, people, many, important, use, help, need, want, think
4. **Break paragraphs clearly**: One main idea per paragraph
5. **Simple transitions**: First, Second, Also, But, However (not Nevertheless, Furthermore)

## 🎯 YOUR TASK

Topic: "${topic.topic_label_en}" (${topic.topic_label_ja})

## Topic Context
${topic.scenario_description}

## Requirements
${instructions.prompt_template}

## Passage Specifications
- Length: 200-300 words (for ${blueprint.grade} level)
- CEFR Level: ${guidelines.vocabulary_level}
- Complexity: ${guidelines.complexity}
- Number of questions: 3-4
- Structure: Clear intro, 2-3 body paragraphs, simple conclusion

## ✓ FINAL SELF-CHECK (before responding)

□ Are 90%+ of my words at ${guidelines.vocabulary_level} level?
□ Did I avoid all forbidden words listed above?
□ Did I use short, clear sentences throughout?
□ Is each paragraph focused on one main idea?
□ Did I follow the GOOD example style, not the BAD example?

## 📤 Output Format (JSON)

{
  "passage": "The complete reading passage (200-300 words using ONLY ${guidelines.vocabulary_level} vocabulary)",
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
  ],
  "vocabulary_self_check": "Confirm: I used only ${guidelines.vocabulary_level} vocabulary (yes/no)"
}

## Important Notes
- Passage should have clear structure (intro, body, conclusion)
- Questions test different skills (main idea, details, inference)
- All information needed to answer must be in the passage
- Topic: ${topic.topic_label_en}
- For each question, explanation MUST cover why the correct answer is right AND why each wrong choice is incorrect
- **REMEMBER**: Simple, clear language for 200-300 words is HARD but ESSENTIAL. Complex vocabulary = REJECTED passage`;
}

/**
 * エッセイ問題のプロンプト生成
 */
export function buildEssayPrompt(blueprint: Blueprint): string {
  const { topic, guidelines, instructions } = blueprint;
  
  return `You are an expert English test creator for Japanese students preparing for Eiken (英検) ${blueprint.grade} level.

## 🎯 CRITICAL VOCABULARY REQUIREMENTS (PRIMARY GOAL)

**TARGET LEVEL**: ${guidelines.vocabulary_level} ONLY
**SUCCESS CRITERIA**: 95%+ of words must be within ${guidelines.vocabulary_level}
**FAILURE CONSEQUENCE**: If too many difficult words, question will be REJECTED

## 🚫 FORBIDDEN WORDS (NEVER USE)

**Academic Verbs**: facilitate, demonstrate, implement, establish, acknowledge, illustrate, analyze, examine, evaluate, utilize, constitute, articulate, emphasize
**Abstract Adjectives**: sophisticated, comprehensive, substantial, significant, considerable, fundamental, essential, crucial, inevitable, remarkable, prominent, profound
**Formal Connectors**: furthermore, moreover, nevertheless, consequently, hence, whereas, thereby, thus, accordingly, notwithstanding
**C1/C2 Words**: numerous, acquire, proficiency, contemporary, multilingual, predominantly, subsequently, ambiguous, intricate, endeavor

## ✅ GOOD EXAMPLE (95%+ vocabulary score - FOLLOW THIS STYLE)

${ESSAY_FEW_SHOT_EXAMPLES.good}

**Why this works**:
${ESSAY_FEW_SHOT_EXAMPLES.good_analysis}

## ❌ BAD EXAMPLE (68% vocabulary score - DO NOT IMITATE)

${ESSAY_FEW_SHOT_EXAMPLES.bad}

**Problems identified**:
${ESSAY_FEW_SHOT_EXAMPLES.bad_problems.map(p => `- ${p}`).join('\n')}

## 📝 WRITING STRATEGY

1. **Use short sentences** (10-15 words maximum)
2. **Choose common words first**: think, because, people, important, help, want, need, make, use
3. **Avoid synonyms**: Better to repeat "important" than use "significant" or "essential"
4. **Self-check**: Ask yourself "Would a ${blueprint.grade} student know this word?"
5. **Simplify complex ideas**: Break down sophisticated concepts into simple language

## 🎯 YOUR TASK

Topic: "${topic.topic_label_en}" (${topic.topic_label_ja})

## Topic Context
${topic.scenario_description}

## Requirements
${instructions.prompt_template}

## Essay Specifications
- Target length: 120-150 words (for ${blueprint.grade} level)
- Writing time: ${instructions.time_limit_minutes} minutes
- CEFR Level: ${guidelines.vocabulary_level}
- Structure: Introduction, Body (2-3 paragraphs), Conclusion

## ✓ FINAL SELF-CHECK (before responding)

□ Are 95%+ of my words at ${guidelines.vocabulary_level} level?
□ Did I avoid all forbidden words listed above?
□ Did I use short, simple sentences?
□ Would my target students understand this easily?
□ Did I follow the GOOD example style, not the BAD example?

## 📤 Output Format (JSON)

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
  "sample_essay": "A complete model essay (120-150 words using ONLY ${guidelines.vocabulary_level} vocabulary)",
  "sample_essay_ja": "模範解答の日本語訳",
  "useful_expressions": ["expression 1", "expression 2", "expression 3"],
  "common_mistakes": ["mistake to avoid 1", "mistake to avoid 2"],
  "vocabulary_self_check": "Confirm: I used only ${guidelines.vocabulary_level} vocabulary (yes/no)"
}

## Important Notes
- The prompt should be clear and focused
- Allow for different perspectives
- Appropriate difficulty for ${blueprint.grade} level
- Topic: ${topic.topic_label_en}
- **REMEMBER**: Simple vocabulary + clear structure = GOOD essay. Complex vocabulary = REJECTED essay`;
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
