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
              content: 'You are a helpful English-Japanese dictionary assistant for Japanese learners preparing for the Eiken exam. Provide clear, concise definitions suitable for the learner\'s level.',
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

Please provide the response in the following JSON format:
{
  "definition_en": "Clear, concise English definition (1-2 sentences)",
  "definition_ja": "日本語の定義（1-2文、学習者に分かりやすく）",
  "example_en": "A natural example sentence using the word",
  "example_ja": "例文の日本語訳"
}

Guidelines:
- Keep definitions simple and appropriate for ${cefrLevel} level learners
- Japanese definition should be clear and use appropriate kanji with furigana where helpful
- Example sentences should be practical and relevant to Eiken exam contexts
- Focus on the most common usage of the word

Respond with ONLY the JSON object, no additional text.`;
  }
}
