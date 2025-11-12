/**
 * Auto-Rewrite Prompts for Vocabulary Violation Correction
 * 
 * 目的: 語彙違反を検出した問題を、A1語彙に自動修正するプロンプトを生成
 */

import { getVocabularyConstraints } from './vocabulary-constraints';

export interface RewriteRequest {
  originalQuestion: string;
  originalChoices: string[];
  violatedWords: string[];
  targetLevel: string;
  grammarPoint?: string;
  correctAnswerIndex?: number;
}

export interface RewriteResult {
  rewrittenQuestion: string;
  rewrittenChoices: string[];
  correctAnswerIndex: number;
  replacements: Array<{
    original: string;
    replacement: string;
    reason: string;
  }>;
  confidence: number; // 0.0-1.0
}

/**
 * Build rewrite prompt for GPT-4o
 */
export function buildRewritePrompt(request: RewriteRequest): string {
  const constraints = getVocabularyConstraints(request.targetLevel);
  
  // Top 30 verbs, nouns, adjectives for reference
  const topVerbs = constraints.allowedVocabulary.verbs.slice(0, 30);
  const topNouns = constraints.allowedVocabulary.nouns.slice(0, 40);
  const topAdj = constraints.allowedVocabulary.adjectives.slice(0, 20);
  
  return `You are an expert at simplifying English test questions for beginners.

🎯 TASK: Rewrite this question to use ONLY A1 (beginner) level vocabulary.

📝 ORIGINAL QUESTION:
"${request.originalQuestion}"

CHOICES:
${request.originalChoices.map((c, i) => `${i + 1}. ${c}`).join('\n')}
${request.correctAnswerIndex !== undefined ? `\nCORRECT ANSWER: Choice ${request.correctAnswerIndex + 1}` : ''}

❌ VIOLATED WORDS (MUST be replaced with A1 vocabulary):
${request.violatedWords.map(w => `- "${w}"`).join('\n')}

✅ ALLOWED A1 VOCABULARY (use ONLY these):

Verbs (top 30): ${topVerbs.join(', ')}
Nouns (top 40): ${topNouns.join(', ')}
Adjectives (top 20): ${topAdj.join(', ')}

📋 REQUIREMENTS:
1. ✅ Replace ALL violated words with A1 vocabulary equivalents
2. ✅ Keep the same grammar structure and testing point
3. ✅ Preserve the meaning as much as possible
4. ✅ Maintain naturalness and clarity
5. ✅ Keep all 4 choices parallel in structure
6. ✅ Ensure only ONE correct answer (same position as original if possible)
7. ✅ Use simple, everyday contexts familiar to beginners

💡 EXAMPLES:

Example 1:
❌ ORIGINAL: "She was delighted to receive the promotion at work."
✅ REWRITTEN: "She was happy to get the good news at work."
Replacements:
  - delighted (B2) → happy (A1): simpler adjective
  - receive (B1) → get (A1): basic A1 verb
  - promotion (B1) → good news (A1): simpler phrase

Example 2:
❌ ORIGINAL: "The conference will commence next month."
✅ REWRITTEN: "The party will start next month."
Replacements:
  - conference (B1) → party (A1): familiar social event
  - commence (C1) → start (A1): basic A1 verb

Example 3:
❌ ORIGINAL: "He demonstrated exceptional leadership abilities."
✅ REWRITTEN: "He showed very good leading skills."
Replacements:
  - demonstrated (B1) → showed (A1): basic A1 verb
  - exceptional (B2) → very good (A1): A1 intensifier + adjective
  - leadership (B1) → leading (A1): A1 gerund
  - abilities (B1) → skills (A1): common A1 noun

🎯 RETURN FORMAT (JSON):
{
  "rewritten_question": "Complete rewritten sentence here",
  "rewritten_choices": ["choice1", "choice2", "choice3", "choice4"],
  "correct_answer_index": 0-3,
  "replacements": [
    {
      "original": "violated_word",
      "replacement": "a1_word",
      "reason": "brief explanation"
    }
  ],
  "confidence": 0.0-1.0 (how confident you are that this rewrite is natural and correct)
}

⚠️ CRITICAL RULES:
- Use ONLY words from the allowed vocabulary list above
- Keep the sentence structure and grammar as similar as possible
- Make sure the rewritten question is natural and clear
- Ensure choices are parallel and only one is correct
- Rate your confidence honestly (0.9+ for excellent, 0.7-0.9 for good, <0.7 for uncertain)

${request.grammarPoint ? `\n🎓 GRAMMAR POINT TO TEST: ${request.grammarPoint}\nMake sure the rewritten question still tests this grammar point!` : ''}

Now rewrite the question following all requirements above.`;
}

/**
 * Build compact rewrite prompt (for token efficiency)
 */
export function buildCompactRewritePrompt(request: RewriteRequest): string {
  const constraints = getVocabularyConstraints(request.targetLevel);
  const topWords = [
    ...constraints.allowedVocabulary.verbs.slice(0, 15),
    ...constraints.allowedVocabulary.nouns.slice(0, 20),
    ...constraints.allowedVocabulary.adjectives.slice(0, 10)
  ];
  
  return `Rewrite this English test question to use ONLY A1 beginner vocabulary.

ORIGINAL: "${request.originalQuestion}"
CHOICES: ${request.originalChoices.join(' | ')}

VIOLATED WORDS (replace these): ${request.violatedWords.join(', ')}

ALLOWED A1 WORDS: ${topWords.join(', ')}

RULES:
1. Replace violated words with A1 equivalents
2. Keep grammar structure
3. Maintain meaning
4. Stay natural

EXAMPLES:
"delighted to receive promotion" → "happy to get good news"
"conference will commence" → "party will start"

Return JSON:
{
  "rewritten_question": "...",
  "rewritten_choices": ["..."],
  "correct_answer_index": 0-3,
  "replacements": [{"original": "...", "replacement": "...", "reason": "..."}],
  "confidence": 0.0-1.0
}`;
}

/**
 * Build system prompt for rewrite operation
 */
export function buildRewriteSystemPrompt(): string {
  return `You are an expert English language teacher specializing in simplifying text for beginner-level learners.

Your task is to rewrite English test questions to use only A1 (beginner) level vocabulary while:
- Preserving the original grammar structure and testing point
- Maintaining the meaning as accurately as possible
- Ensuring the rewritten text is natural and clear
- Keeping all answer choices valid and parallel

You are highly skilled at finding simple, everyday equivalents for complex vocabulary.
You understand CEFR levels and can accurately identify A1-appropriate vocabulary.

Always return your response in the requested JSON format with high-quality replacements.`;
}

/**
 * Validate rewrite result quality
 */
export function validateRewriteResult(result: RewriteResult, originalChoicesCount: number): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check required fields
  if (!result.rewrittenQuestion || result.rewrittenQuestion.trim().length === 0) {
    errors.push('Rewritten question is empty');
  }
  
  if (!result.rewrittenChoices || result.rewrittenChoices.length !== originalChoicesCount) {
    errors.push(`Expected ${originalChoicesCount} choices, got ${result.rewrittenChoices?.length || 0}`);
  }
  
  if (result.correctAnswerIndex < 0 || result.correctAnswerIndex >= originalChoicesCount) {
    errors.push(`Invalid correct answer index: ${result.correctAnswerIndex}`);
  }
  
  if (!result.replacements || result.replacements.length === 0) {
    errors.push('No replacements provided');
  }
  
  if (result.confidence < 0 || result.confidence > 1) {
    errors.push(`Invalid confidence score: ${result.confidence}`);
  }
  
  // Check for blank in question (required for fill-in-blank questions)
  if (!result.rewrittenQuestion.includes('(') || !result.rewrittenQuestion.includes(')')) {
    errors.push('Rewritten question must contain ( ) blank');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Format replacement summary for logging
 */
export function formatReplacementSummary(replacements: RewriteResult['replacements']): string {
  return replacements
    .map(r => `${r.original} → ${r.replacement} (${r.reason})`)
    .join(', ');
}
