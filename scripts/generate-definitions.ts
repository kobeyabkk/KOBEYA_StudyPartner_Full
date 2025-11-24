/**
 * Phase 2: Generate Japanese definitions for vocabulary
 * 
 * Strategy: Batch process top N words (B2+ level) using LLM
 * Caches results in database for fast lookup
 */

import { OpenAI } from 'openai';

interface VocabularyWord {
  word_lemma: string;
  pos: string;
  cefr_level: string;
  final_difficulty_score: number;
}

interface GeneratedDefinition {
  word: string;
  pos: string;
  definition_ja: string;
  definition_en: string;
}

/**
 * Generate definitions for a batch of words using GPT-4
 */
async function generateDefinitionBatch(
  words: VocabularyWord[],
  openai: OpenAI
): Promise<GeneratedDefinition[]> {
  const prompt = `Generate concise Japanese definitions for the following English vocabulary words. Each definition should be 1-2 sentences, suitable for Japanese high school students studying for the Eiken exam.

Format your response as a JSON array with this structure:
[
  {
    "word": "word_lemma",
    "pos": "part_of_speech",
    "definition_ja": "日本語での定義",
    "definition_en": "English definition"
  }
]

Words to define:
${words.map(w => `- ${w.word_lemma} (${w.pos}) [CEFR: ${w.cefr_level}]`).join('\n')}

Requirements:
- Use natural Japanese that high school students can understand
- Include usage context when helpful
- Keep definitions concise (1-2 sentences)
- Focus on the most common meaning for Eiken exam context`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful vocabulary assistant specializing in creating clear definitions for Japanese students.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : parsed.definitions || [];
  } catch (error) {
    console.error('Error generating definitions:', error);
    return [];
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Starting Definition Generation');
  console.log('==================================\n');

  // Configuration
  const BATCH_SIZE = 10; // Process 10 words at a time
  const TARGET_COUNT = 1000; // Top 1000 B2+ words
  const MIN_CEFR_NUMERIC = 40; // B2 and above

  // Initialize OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: OPENAI_API_KEY environment variable not set');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });

  console.log(`📊 Configuration:`);
  console.log(`   - Target: ${TARGET_COUNT} words`);
  console.log(`   - Batch size: ${BATCH_SIZE}`);
  console.log(`   - Min CEFR: B2 (numeric: ${MIN_CEFR_NUMERIC})`);
  console.log('');

  // TODO: Database connection and query logic
  // This will be implemented with actual D1 database connection

  console.log('✅ Setup complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Connect to D1 database');
  console.log('  2. Query top 1000 B2+ words without definitions');
  console.log('  3. Batch process with LLM');
  console.log('  4. Update database with generated definitions');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { generateDefinitionBatch, type VocabularyWord, type GeneratedDefinition };
