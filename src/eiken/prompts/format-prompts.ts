/**
 * Phase 3: Format-Specific LLM Prompt Templates
 * 
 * 5つの問題形式それぞれに最適化されたプロンプトテンプレート
 * Phase 4: Few-shot Examples with Good/Bad comparison for vocabulary quality
 * Phase 4B: Grammar complexity constraints per grade level
 */

import type { Blueprint, EikenGrade } from '../types';
import { getGrammarPromptInstructions, getExplanationTerminologyGuide } from '../config/grammar-constraints';

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
 * Phase 4C: Dialogue format for unambiguous questions
 * Phase 6 Part 3: Answer diversity tracking
 */
export function buildGrammarFillPrompt(
  blueprint: Blueprint,
  diversityGuidance?: string
): string {
  const { topic, guidelines, instructions } = blueprint;
  const grammarInstructions = getGrammarPromptInstructions(blueprint.grade);
  
  // Phase 7.4: 実際の英検に合わせた形式判定
  // 5級・4級・3級: 会話文形式（A/B dialogue）
  // 準2級: 会話文と短文の混在（徐々に移行）
  // 2級・準1級・1級: 短文形式（non-dialogue）
  const useDialogFormat = ['5', '4', '3', 'pre2'].includes(blueprint.grade);
  
  // 準2級は50%の確率で会話文を使用（実際の英検に近づける）
  const isPre2 = blueprint.grade === 'pre2';
  const shouldUseDialogForPre2 = isPre2 && Math.random() < 0.5;
  
  // 最終判定: 準2級は50%、それ以外は級に応じて決定
  const finalUseDialogFormat = isPre2 ? shouldUseDialogForPre2 : useDialogFormat;
  
  const formatInstruction = finalUseDialogFormat
    ? `
## 🎯 QUESTION FORMAT: A/B Dialogue (Eiken ${blueprint.grade} Standard)

**REAL EIKEN EXAM FORMAT**:
- Grades 5, 4, 3: Always use dialogue format (realistic conversations)
- Grade Pre-2: Mix of dialogue and single sentences (transition period)
- Grades 2, Pre-1, 1: Single sentence format (academic/formal context)

**CRITICAL**: This question should use dialogue format!

Format structure (MUST use line break after A:):
A: [Context/situation statement]
B: [Response with blank _____]

**CRITICAL**: In your JSON output, use actual newline character \\n between A: and B: lines!

**Why dialogue format?**
- Provides natural context automatically
- Eliminates multiple correct answers
- Matches actual Eiken exam format
- Makes grammar point unambiguous

**GOOD Example** (Clear, unambiguous - note the line break!):
A: Look! Ms. Green is over there.
B: Oh, _____ you say hello to her?

In JSON: "question_text": "A: Look! Ms. Green is over there.\\nB: Oh, _____ you say hello to her?"

Choices: Can, Do, Is, Are
✓ Answer: Can (ability question - context makes this clear)
✗ "Do" would be unnatural in this context ("Oh, do you..." sounds wrong)

**BAD Example** (Ambiguous - DO NOT CREATE):
_____ you say hello to her?

Choices: Can, Do, Is, Are
Problem: Both "Can" (ability) and "Do" (habit) are grammatically correct!
This creates confusion and multiple valid answers.

**Rules for creating dialogue**:
1. Speaker A provides situation/context
2. Speaker B's response contains the blank
3. Context must make only ONE answer natural
4. Test grammar naturally through conversation
5. Both speakers use appropriate ${blueprint.grade} level language

**Context examples for different grammar**:
- Can (ability): "Look! Ms. Green..." → Natural ability question
- Will (future): "Tomorrow is Sunday..." → Natural future plan
- Present continuous: "Where is Tom?" → Natural "He is playing..."
- Past simple: "What did you do yesterday?" → Natural past response
`
    : `
## 🎯 QUESTION FORMAT: Single Sentence (Eiken ${blueprint.grade} Standard)

**REAL EIKEN EXAM FORMAT**:
- Grades 5, 4, 3: Dialogue format (see conversational context)
- Grade Pre-2: Mix of dialogue and single sentences
- Grades 2, Pre-1, 1: **Single sentence format** (academic/formal)

**CRITICAL**: This question should use single sentence format!

**For Grades 2, Pre-1, 1:**
- Use formal, academic, or business context
- One complete sentence with clear grammatical structure
- More sophisticated vocabulary and complex grammar
- Context should be clear from the sentence itself

**IMPORTANT**: Add sufficient context to eliminate ambiguous answers!

**Good Example (Grade 2)**:
The company decided to _____ a new policy to improve employee satisfaction.
Choices: implement, neglect, postpone, ignore
✓ Answer: implement (formal business context)

**Good Example (Pre-1)**:
It is essential that the board _____ this proposal before making a final decision.
Choices: reviews, review, reviewed, will review
✓ Answer: review (subjunctive mood with "essential that")

If a question could have multiple correct answers:
- Provide clear contextual clues within the sentence
- Use formal/academic vocabulary appropriate for ${blueprint.grade}
- Ensure only ONE answer is both grammatically AND contextually correct
`;

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

${grammarInstructions}

## Grammar Focus
Target one of these grammar patterns:
${guidelines.grammar_patterns.map(g => `- ${g}`).join('\n')}

${diversityGuidance || ''}

${formatInstruction}

## 🚨 CRITICAL: Prevent Multiple Correct Answers

**Your question MUST have EXACTLY ONE correct answer!**

Common mistakes to avoid:
❌ "_____ you like pizza?" (Both "Do" and "Would" work)
❌ "She _____ to school." (Both "goes" and "went" could work)
❌ "I _____ play soccer every weekend." (Both "usually" and nothing work)

Solutions:
✓ Use dialogue format (recommended for ${blueprint.grade})
✓ Add time markers: "yesterday", "every day", "tomorrow"
✓ Add context that specifies the grammar
✓ Make sure distractors are clearly wrong in THIS context

## Output Format (JSON)
{
  "question_text": "${finalUseDialogFormat ? 'A: [context]\\nB: [sentence with _____] (MUST include \\\\n line break!)' : 'The sentence with _____ (blank)'}",
  "correct_answer": "the correct form",
  "distractors": ["wrong option 1", "wrong option 2", "wrong option 3"],
  "grammar_point": "what grammar is being tested",
  "explanation": "なぜこれが正解か（日本語で詳しく説明）。全ての選択肢の意味と文法的な理由を含めること。",
  "translation_ja": "問題文の日本語訳（会話形式の場合は両方のセリフを訳すこと）",
  "vocabulary_meanings": {
    "correct_answer": "meaning in Japanese",
    "distractor_1": "meaning in Japanese",
    "distractor_2": "meaning in Japanese",
    "distractor_3": "meaning in Japanese",
    "key_phrase_1": "問題文に出てくる重要な熟語や表現の意味（例: keep in touch with = 〜と連絡を取り合う）",
    "key_phrase_2": "別の重要表現があれば追加"
  }
}

## IMPORTANT: explanation field MUST be in JAPANESE using APPROPRIATE GRADE-LEVEL TERMS

${getExplanationTerminologyGuide(blueprint.grade)}

## 🏫 CRITICAL: Use 4-Block Teacher-Style Explanation Format

Your explanation MUST follow this structure:

**＜着眼点＞**
Point out key hints in the question (keywords, time markers, context clues)
Example: "if（もし〜なら）と tomorrow（明日）があるので、『未来の条件』の文です。"

**＜${blueprint.grade === '5' || blueprint.grade === '4' ? 'Point！' : '鉄則！'}＞**
State the grammar rule clearly and concisely (1-2 sentences)
Example: "時・条件の副詞節（if / when など）では、未来のことでも現在形を使います。"

**＜当てはめ＞**
Apply the rule to this specific question
Example: "if の中は現在形にするので、主語が it（3単現）なので、rains になります。"

**＜誤答の理由＞**
Explain why each wrong choice is incorrect (one line per choice, end with ×)
Example: "rain：動詞の原形。3単現のsがついていないので ×"

**CRITICAL**: 
- Use age-appropriate terminology as specified in the guide above!
- DO NOT use vague phrases like "未来を表す文なので will を使います" without explaining the rule
- DO specify grammar forms: 動詞の原形、過去形、現在進行形、3単現のs, etc.

## Important Notes
- ONE blank per sentence only
- ${finalUseDialogFormat ? '**CRITICAL**: Use A/B dialogue format with actual line break (\\n) between speakers! Example: "A: text\\nB: text"' : 'Provide clear context clues'}
- Distractors should be plausible but clearly wrong IN THIS CONTEXT
- Use natural, authentic English
- The sentence must relate to the topic: ${topic.topic_label_en}
- **MUST provide**:
  1. Japanese translation of the ENTIRE question (translation_ja)
  2. Japanese meanings for ALL vocabulary choices (correct answer + all distractors)
  3. Japanese meanings for KEY PHRASES and IDIOMS in the question text (e.g., "keep in touch with" = 「〜と連絡を取り合う」)
- **CRITICAL**: Ensure ONLY ONE answer is correct - no ambiguity allowed!
${finalUseDialogFormat ? '- **LINE BREAK REQUIREMENT**: Your question_text MUST contain \\n character: "A: ... \\nB: ..."' : ''}

## 🌐 Translation & Vocabulary Requirements
**CRITICAL**: Students need to understand the question to answer it!
- translation_ja: Provide COMPLETE Japanese translation of question_text
  ${finalUseDialogFormat ? '- If dialogue format, translate BOTH A: and B: lines' : ''}
- vocabulary_meanings: Include ALL important words/phrases:
  * All answer choices (correct + distractors)
  * Key phrases/idioms in question (e.g., "keep in touch with", "used to", "look forward to")
  * Any difficult vocabulary that ${blueprint.grade} students might not know

🚨🚨🚨 MANDATORY SELF-CHECK BEFORE RESPONDING 🚨🚨🚨

Before submitting your JSON, verify:
1. ✓ explanation_ja starts with "＜着眼点＞"
2. ✓ explanation_ja contains "＜鉄則！＞" or "＜Point！＞"
3. ✓ explanation_ja contains "＜当てはめ＞"
4. ✓ explanation_ja contains "＜誤答の理由＞"
5. ✓ There are empty lines (\\n\\n) between each block
6. ✓ explanation_ja is at least 100 characters long

❌ REJECT if explanation_ja looks like:
"この文は過去の文なので、動詞は過去形を使います。主語はyouなので、didが正解です。"

✅ ACCEPT if explanation_ja looks like:
"＜着眼点＞\\n過去のことを聞く疑問文です。\\n\\n＜鉄則！＞\\n過去のことを聞く疑問文では、文の最初に Did を使います。\\n\\n＜当てはめ＞\\n'yesterday'という言葉があるので、過去のことです。だから Did が正解です。\\n\\n＜誤答の理由＞\\ndo/doesは現在形、areはbe動詞なので×。"

If ANY check fails, FIX your explanation_ja before responding!`;
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
  "explanation": "良い回答のポイント（日本語で詳しく説明）"
}

## IMPORTANT: explanation field MUST be in JAPANESE using APPROPRIATE GRADE-LEVEL TERMS

${getExplanationTerminologyGuide(blueprint.grade)}

- Explain what makes a good answer for Japanese learners
- Use age-appropriate language as specified in the guide above
- Avoid overly complex grammatical terminology
- Focus on practical speaking tips rather than abstract theory

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
  const grammarInstructions = getGrammarPromptInstructions(blueprint.grade);
  
  return `You are an expert English test creator for Japanese students preparing for Eiken (英検) ${blueprint.grade} level.

${grammarInstructions}

## 🎯 CRITICAL VOCABULARY REQUIREMENTS (PRIMARY GOAL FOR LONG PASSAGES)

**TARGET LEVEL**: ${guidelines.vocabulary_level} ONLY
**SUCCESS CRITERIA**: 90%+ of words must be within ${guidelines.vocabulary_level}
**FAILURE CONSEQUENCE**: If too many difficult words, passage will be REJECTED (aim for 85%+ minimum)

**⚠️ Phase 3 WARNING**: Previous attempts scored 76.3% - this is TOO LOW and will be REJECTED.
You MUST use simpler vocabulary throughout the entire passage. Every sentence matters!

## 🚫 FORBIDDEN WORDS (NEVER USE IN 200-300 WORD PASSAGES)

**Phase 3 Update**: Expanded forbidden words list for better vocabulary control

**Academic Verbs (NEVER)**: 
- facilitate, demonstrate, implement, establish, utilize, constitute, articulate
- examine, analyze, evaluate, assess, investigate, emphasize, acknowledge
- manifest, exemplify, elucidate, ascertain, discern, endeavor

**Abstract Adjectives (NEVER)**: 
- sophisticated, comprehensive, substantial, considerable, prominent, profound, intricate
- significant, essential, crucial, fundamental, inevitable, remarkable
- substantial, predominant, comprehensive, considerable

**Formal Connectors (NEVER)**: 
- furthermore, moreover, nevertheless, consequently, hence, whereas, thereby, notwithstanding
- accordingly, thus, henceforth, thereafter, whereby

**C1/C2 Words (NEVER)**: 
- contemporary, predominantly, subsequently, ambiguous, endeavor, implications, stakeholders
- adolescent (use "young people"), numerous (use "many"), acquire (use "get/learn")
- proficiency (use "skill"), multilingual (use "speak many languages")
- diminutive (use "small"), physiological (use "body"), ocular (use "eye")
- disproportionate (use "too much"), precludes (use "stops/prevents")

**Common Traps to Avoid**:
- Don't use: "individuals" → Use: "people"
- Don't use: "purchase" → Use: "buy"
- Don't use: "commence" → Use: "start/begin"
- Don't use: "terminate" → Use: "end/stop"
- Don't use: "assist" → Use: "help"
- Don't use: "obtain" → Use: "get"
- Don't use: "require" → Use: "need"
- Don't use: "sufficient" → Use: "enough"

## ✅ GOOD EXAMPLE (92% vocabulary score - THIS IS YOUR TARGET QUALITY)

${LONG_READING_FEW_SHOT_EXAMPLES.good}

**Why this works**:
${LONG_READING_FEW_SHOT_EXAMPLES.good_analysis}

## ❌ BAD EXAMPLE (69% vocabulary score - THIS WILL BE REJECTED - DO NOT IMITATE)

${LONG_READING_FEW_SHOT_EXAMPLES.bad}

**Problems identified**:
${LONG_READING_FEW_SHOT_EXAMPLES.bad_problems.map(p => `- ${p}`).join('\n')}

## 📝 WRITING STRATEGY FOR LONG PASSAGES (Phase 3 Enhanced)

**CRITICAL**: Every word counts in a 200-300 word passage. One difficult word can drop your score by 0.3-0.5%.

1. **Use short sentences** (10-15 words maximum for long passages)
   - Bad: "Contemporary adolescents demonstrate substantial engagement with mobile technology."
   - Good: "Many young people today spend a lot of time using smartphones."

2. **Repeat key words**: Don't avoid repetition - clarity is MORE important than variety
   - It's OK to repeat "people", "important", "use" multiple times
   - NEVER replace simple words with complex synonyms

3. **Choose simple words FIRST** (A1-A2 level):
   - Daily verbs: go, come, use, make, help, want, need, like, know, think, feel, see, hear
   - Common nouns: people, time, day, way, thing, place, home, work, school, friend, family
   - Basic adjectives: good, bad, new, old, big, small, important, difficult, easy, happy, sad

4. **Break paragraphs clearly**: One main idea per paragraph (4-5 sentences each)

5. **Simple transitions ONLY**: First, Second, Also, But, However, So, Then
   - NEVER: Nevertheless, Furthermore, Moreover, Consequently, Thus

6. **Self-check after EVERY sentence**: "Would a ${blueprint.grade} student know ALL these words?"
   - If you have ANY doubt, use a simpler word!

## 📖 VOCABULARY NOTES REQUIREMENT (Phase 4A Enhanced)

**CRITICAL**: Vocabulary notes allow you to use richer vocabulary while maintaining accessibility!

**Strategy**: You can now use up to 5-8 slightly higher-level words (B2) IF you provide notes
- This makes your passage more natural and authentic
- Students learn these words in context (highest learning effectiveness)
- Matches real Eiken exam format (語注付き)

**Guidelines**:
1. **Use mostly A2-B1 vocabulary** (80-85% of words)
2. **Add 5-8 B2 words WITH notes** (allows richer expression)
3. **Focus on content words**: important nouns, key verbs, essential adjectives
4. **Provide clear Japanese definitions**

**Example - Good vocabulary selection with notes**:
Passage: "Many young people today are concerned about climate change. They worry about the environment..."

Vocabulary Notes:
• "concerned" (B2) → 心配している、関心がある
• "climate change" (B2) → 気候変動
• "environment" (B2) → 環境

**DON'T select**:
❌ Function words (the, is, and, but)
❌ Words students already know (go, come, big, small)
❌ Words that are TOO difficult even with notes (C1/C2 words)

**Format**:
• "word/phrase" → 日本語での定義

## 📖 VOCABULARY NOTES REQUIREMENT

**IMPORTANT**: You MUST provide vocabulary notes for 5-8 key terms from your passage.
- Select words that are important for understanding the passage
- Choose words that appear in the passage and might be slightly challenging
- Provide clear, simple Japanese definitions
- Focus on content words (nouns, verbs, adjectives) rather than grammar words

**Example vocabulary notes format**:
• "smartphone" → スマートフォン、携帯電話
• "worried" → 心配している
• "outdoor" → 屋外の、外の

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

## ✓ FINAL SELF-CHECK (Phase 3 Enhanced - MANDATORY before responding)

**⚠️ CRITICAL**: Your passage MUST score 85%+ or it will be REJECTED. Check EVERY word!

□ Are 90%+ of my words at ${guidelines.vocabulary_level} level? (Target: 85% minimum)
□ Did I avoid ALL forbidden words listed above? (Zero tolerance)
□ Did I use short, clear sentences (10-15 words)? (Every sentence counts)
□ Is each paragraph focused on one main idea? (4-5 sentences each)
□ Did I follow the GOOD example style (92%), not the BAD example (69%)?
□ Did I check EVERY adjective, verb, and noun for complexity?
□ Did I avoid ALL academic/formal vocabulary?
□ Would a ${blueprint.grade} student understand EVERY word without a dictionary?

**IF YOU ANSWERED "NO" OR "MAYBE" TO ANY QUESTION ABOVE, REWRITE THE PASSAGE!**

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
      "explanation": "なぜAが正解か（日本語で詳しく説明）。他の選択肢が不正解である理由も日本語で説明すること。"
    }
  ],
  "vocabulary_meanings": [
    {"term": "example term", "definition": "日本語での定義"},
    {"term": "another term", "definition": "別の定義"}
  ],
  "vocabulary_self_check": "Confirm: I used only ${guidelines.vocabulary_level} vocabulary (yes/no)"
}

## Important Notes (Phase 3 Critical Requirements)

- Passage should have clear structure (intro, body, conclusion)
- Questions test different skills (main idea, details, inference)
- All information needed to answer must be in the passage
- Topic: ${topic.topic_label_en}
- **CRITICAL**: explanation field MUST be in JAPANESE (日本語) using APPROPRIATE GRADE-LEVEL TERMS
- For each question, explanation MUST cover why the correct answer is right AND why each wrong choice is incorrect
- **MUST include 5-8 vocabulary notes** for key terms that appear in the passage

${getExplanationTerminologyGuide(blueprint.grade)}

**IMPORTANT for explanations**:
- Use age-appropriate language as specified in the guide above
- Avoid overly complex grammatical terminology
- Focus on "what it means" and "when to use it" rather than abstract definitions

## 🚨 FINAL WARNING (Phase 3)

**Previous attempts scored 76.3% - THIS IS TOO LOW!**

Your passage will be AUTOMATICALLY REJECTED if:
- Vocabulary score is below 85%
- You use ANY word from the forbidden list
- You use academic/formal language
- Sentences are too long (>15 words)

**SUCCESS FORMULA**:
- Simple words (A1-A2) + Short sentences (10-15 words) + Clear structure = PASS
- Complex words + Long sentences + Formal tone = FAIL

**REMEMBER**: Writing simply for 200-300 words is HARD but ESSENTIAL. Complex vocabulary = REJECTED passage!`;
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

## 📖 VOCABULARY NOTES REQUIREMENT

**IMPORTANT**: You MUST provide vocabulary notes for 3-5 key terms that appear in your essay prompt or sample essay.
- Select words that are important for understanding the topic
- Choose words that are at or just slightly above ${guidelines.vocabulary_level} level
- Provide clear, simple Japanese definitions
- Include terms that students might struggle with, but are necessary for this topic

**Example vocabulary notes format**:
• "renewable energy" → 再生可能エネルギー
• "communicate" → コミュニケーションする、伝える
• "opinion" → 意見

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
  "vocabulary_meanings": [
    {"term": "example term", "definition": "日本語での定義"},
    {"term": "another term", "definition": "別の定義"}
  ],
  "vocabulary_self_check": "Confirm: I used only ${guidelines.vocabulary_level} vocabulary (yes/no)"
}

## Important Notes
- The prompt should be clear and focused
- Allow for different perspectives
- Appropriate difficulty for ${blueprint.grade} level
- Topic: ${topic.topic_label_en}
- **MUST include 3-5 vocabulary notes** for key terms in the essay prompt or sample essay
- **REMEMBER**: Simple vocabulary + clear structure = GOOD essay. Complex vocabulary = REJECTED essay

${getExplanationTerminologyGuide(blueprint.grade)}

**IMPORTANT for guidance and explanations**:
- Use age-appropriate language as specified in the guide above
- Explain writing strategies in simple terms
- Avoid overly technical grammatical terminology in outline_guidance
- Focus on "what to write" and "how to structure" rather than abstract writing theory`;
}

/**
 * Blueprint に基づいて適切なプロンプトを選択
 * Phase 6 Part 3: Answer diversity tracking support
 */
export function buildPromptForBlueprint(
  blueprint: Blueprint,
  diversityGuidance?: string
): string {
  switch (blueprint.format) {
    case 'grammar_fill':
      return buildGrammarFillPrompt(blueprint, diversityGuidance);
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

/**
 * Phase 7.4: 解説スタイル別のプロンプト修飾子
 */
export type ExplanationStyle = 'simple' | 'standard' | 'detailed';

export function getExplanationStyleModifier(style: ExplanationStyle, grade: string): string {
  switch (style) {
    case 'simple':
      return `
🎓 EXPLANATION STYLE: SIMPLE (簡単な解説)

**TARGET AUDIENCE**: 初学者、文法が苦手な学習者
**TONE**: 優しく、親しみやすく
**REQUIREMENTS**:
- 中学生でも理解できる平易な言葉を使う
- 文法用語を最小限に抑える（必要な場合は括弧で説明を加える）
- 具体例を多く使う
- 1文を短く、シンプルに
- explanation_ja の各ブロックは簡潔に（各ブロック50-80字程度）

**EXAMPLE**:
＜着眼点＞
「yesterday（昨日）」という言葉があります。これは「過去のこと」を表します。

＜Point！＞
過去のことを聞く疑問文では、文の最初に「Did」を使います。

＜当てはめ＞
「昨日」のことなので、「Did」が正解です。

＜誤答の理由＞
Do/Does：今のことを聞く言葉なので×
Are：「〜です」という意味の言葉なので×
`;

    case 'detailed':
      return `
🎓 EXPLANATION STYLE: DETAILED (詳しい解説)

**TARGET AUDIENCE**: 文法を深く理解したい学習者、上級者
**TONE**: アカデミック、正確
**REQUIREMENTS**:
- 文法用語を正確に使用（例：助動詞、時制、品詞など）
- 文法規則の背景や例外も説明
- 類似表現との違いも解説
- 英語の例文を豊富に使用
- explanation_ja の各ブロックは詳細に（各ブロック100-150字程度）

**EXAMPLE**:
＜着眼点＞
時を表す副詞 "yesterday" が使用されており、過去時制を示唆しています。疑問文の構造を判断する必要があります。

＜鉄則！＞
一般動詞の過去時制の疑問文では、助動詞 "did" を文頭に配置し、動詞は原形を使用します。これは do/does の過去形である did が時制を担うためです。

＜当てはめ＞
"yesterday" により過去時制が確定し、主語が二人称 "you" であっても、一般動詞の疑問文では "Did" を使用します。動詞 "buy" は原形のままです。

＜誤答の理由＞
Do/Does：現在時制の助動詞であり、過去を表す "yesterday" とは時制が一致しない×
Are："be" 動詞の現在形であり、一般動詞 "buy" とは併用できない×
`;

    case 'standard':
    default:
      return `
🎓 EXPLANATION STYLE: STANDARD (標準の解説)

**TARGET AUDIENCE**: 一般的な学習者
**TONE**: 分かりやすく、バランスの取れた
**REQUIREMENTS**:
- 適度な文法用語の使用（基本的な用語は使う）
- 理解しやすい説明と適度な詳しさ
- 必要に応じて具体例を使用
- explanation_ja の各ブロックは標準的な長さ（各ブロック70-100字程度）

**EXAMPLE**:
＜着眼点＞
「yesterday（昨日）」という単語があるので、過去のことを聞く疑問文です。

＜${grade === '5' || grade === '4' ? 'Point！' : '鉄則！'}＞
過去のことを聞く疑問文では、文の最初に助動詞の "Did" を使います。動詞は原形になります。

＜当てはめ＞
「昨日」という過去の時を表す言葉があるので、"Did" が正解です。主語が "you" でも "Did" を使います。

＜誤答の理由＞
Do/Does：現在形の助動詞なので、過去の "yesterday" とは合わない×
Are：be動詞の現在形で、一般動詞の疑問文には使えない×
`;
  }
}
