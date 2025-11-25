/**
 * Vocabulary Definition Generator Service
 * 
 * Generates Japanese and English definitions for vocabulary words using LLM
 * Strategy: Generate definitions on-demand and cache in database
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface VocabularyDefinition {
  word: string;
  pos: string;
  definition_en: string;
  definition_ja: string;
  cefr_level: string;
  example_sentence_en?: string;
  example_sentence_ja?: string;
}

export class VocabularyDefinitionGenerator {
  private db: D1Database;
  private openaiApiKey: string;

  constructor(db: D1Database, openaiApiKey: string) {
    this.db = db;
    this.openaiApiKey = openaiApiKey;
  }

  /**
   * Generate definition for a single word
   */
  async generateDefinition(
    word: string,
    pos: string,
    cefrLevel: string
  ): Promise<VocabularyDefinition> {
    const prompt = this.buildPrompt(word, pos, cefrLevel);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful English-Japanese dictionary assistant for Japanese middle school students (中学生) preparing for the Eiken exam. Your definitions must use SIMPLE, EASY-TO-UNDERSTAND Japanese that 12-15 year old students can comprehend. Avoid difficult vocabulary, complex kanji, or academic terms. Write as if explaining to a younger sibling using everyday words.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No content in OpenAI response');
      }

      // Parse the JSON response
      const definition = JSON.parse(content);

      return {
        word,
        pos,
        definition_en: definition.definition_en,
        definition_ja: definition.definition_ja,
        cefr_level: cefrLevel,
        example_sentence_en: definition.example_en,
        example_sentence_ja: definition.example_ja,
      };
    } catch (error) {
      console.error(`Failed to generate definition for ${word}:`, error);
      throw error;
    }
  }

  /**
   * Generate definitions for multiple words in batch
   */
  async generateBatch(
    words: Array<{ word: string; pos: string; cefrLevel: string }>
  ): Promise<VocabularyDefinition[]> {
    const results: VocabularyDefinition[] = [];

    // Process in smaller batches to avoid rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < words.length; i += BATCH_SIZE) {
      const batch = words.slice(i, i + BATCH_SIZE);
      const promises = batch.map((w) =>
        this.generateDefinition(w.word, w.pos, w.cefrLevel)
      );

      try {
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
      } catch (error) {
        console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error);
      }

      // Small delay between batches to respect rate limits
      if (i + BATCH_SIZE < words.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Save generated definition to database
   */
  async saveDefinition(definition: VocabularyDefinition): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `UPDATE eiken_vocabulary_lexicon 
         SET definition_en = ?,
             definition_ja = ?,
             definition_source = 'llm_generated',
             last_definition_update = ?
         WHERE LOWER(word_lemma) = LOWER(?) AND pos = ?`
      )
      .bind(
        definition.definition_en,
        definition.definition_ja,
        now,
        definition.word,
        definition.pos
      )
      .run();

    console.log(`✅ Saved definition for: ${definition.word} (${definition.pos})`);
  }

  /**
   * Get or generate definition for a word
   */
  async getOrGenerateDefinition(
    word: string,
    pos: string,
    cefrLevel: string
  ): Promise<VocabularyDefinition> {
    // First, check if definition exists in database
    const existing = await this.db
      .prepare(
        `SELECT word_lemma as word, pos, definition_en, definition_ja, cefr_level
         FROM eiken_vocabulary_lexicon
         WHERE LOWER(word_lemma) = LOWER(?) AND pos = ?`
      )
      .bind(word, pos)
      .first<VocabularyDefinition>();

    if (existing && existing.definition_en && existing.definition_ja) {
      console.log(`📖 Using cached definition for: ${word}`);
      return existing;
    }

    // Generate new definition
    console.log(`🔄 Generating new definition for: ${word}`);
    const definition = await this.generateDefinition(word, pos, cefrLevel);

    // Save to database
    await this.saveDefinition(definition);

    return definition;
  }

  /**
   * Build prompt for LLM
   */
  private buildPrompt(word: string, pos: string, cefrLevel: string): string {
    return `Generate a dictionary definition for the English word "${word}" (part of speech: ${pos}, CEFR level: ${cefrLevel}).

TARGET AUDIENCE: Japanese middle school students (中学生)
LANGUAGE LEVEL: Use simple, easy-to-understand Japanese that middle school students can understand

Please provide the response in the following JSON format:
{
  "definition_en": "Clear, concise English definition (1-2 sentences)",
  "definition_ja": "中学生でも分かる簡単な日本語での定義（1-2文、やさしい言葉で）",
  "example_en": "A natural example sentence using the word",
  "example_ja": "例文の日本語訳（やさしい日本語で）"
}

IMPORTANT GUIDELINES for Japanese definitions:
- Use SIMPLE Japanese vocabulary that middle school students (12-15 years old) can understand
- Avoid difficult kanji or academic terms
- Use everyday words and expressions
- Keep sentences short and clear
- Example: Instead of "身体的な損傷" use "体のけが"
- Example: Instead of "否定的な影響" use "悪い影響"
- Example: Instead of "継続中である" use "まだ続いている"
- Write as if explaining to a younger sibling

Technical guidelines:
- Keep definitions simple and appropriate for ${cefrLevel} level learners
- Example sentences should be practical and relevant to daily life or Eiken exam contexts
- Focus on the most common usage of the word

Respond with ONLY the JSON object, no additional text.`;
  }
}
