/**
 * Phase 4A: Vocabulary Service
 * 
 * Database service layer for vocabulary CRUD operations
 * Handles vocabulary_master table interactions
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  VocabularyMaster,
  VocabularyDifficultyInput,
  VocabularySearchResponse,
  CEFRLevel,
  EikenGrade,
  PartOfSpeech,
  ContextDependency,
  ExampleSentence
} from '../types/vocabulary';
import { vocabularyDifficultyScorer } from './vocabulary-difficulty';

export class VocabularyService {
  constructor(private db: D1Database) {}
  
  /**
   * Get vocabulary word by ID
   */
  async getById(wordId: number): Promise<VocabularyMaster | null> {
    const result = await this.db
      .prepare('SELECT * FROM vocabulary_master WHERE id = ?')
      .bind(wordId)
      .first();
    
    if (!result) return null;
    return this.mapToVocabularyMaster(result);
  }
  
  /**
   * Get vocabulary word by word string
   */
  async getByWord(word: string): Promise<VocabularyMaster | null> {
    const result = await this.db
      .prepare('SELECT * FROM vocabulary_master WHERE LOWER(word) = LOWER(?)')
      .bind(word)
      .first();
    
    if (!result) return null;
    return this.mapToVocabularyMaster(result);
  }
  
  /**
   * Search vocabulary words
   */
  async search(
    query: string,
    filters?: {
      cefrLevel?: CEFRLevel;
      eikenGrade?: EikenGrade;
      minDifficulty?: number;
      maxDifficulty?: number;
    },
    page: number = 1,
    pageSize: number = 20
  ): Promise<VocabularySearchResponse> {
    
    const offset = (page - 1) * pageSize;
    
    let sql = `
      SELECT * FROM vocabulary_master
      WHERE (LOWER(word) LIKE LOWER(?) OR LOWER(definition_ja) LIKE LOWER(?))
    `;
    const params: any[] = [`%${query}%`, `%${query}%`];
    
    // Apply filters
    if (filters?.cefrLevel) {
      sql += ' AND cefr_level = ?';
      params.push(filters.cefrLevel);
    }
    
    if (filters?.eikenGrade) {
      sql += ' AND eiken_grade = ?';
      params.push(filters.eikenGrade);
    }
    
    if (filters?.minDifficulty !== undefined) {
      sql += ' AND final_difficulty_score >= ?';
      params.push(filters.minDifficulty);
    }
    
    if (filters?.maxDifficulty !== undefined) {
      sql += ' AND final_difficulty_score <= ?';
      params.push(filters.maxDifficulty);
    }
    
    sql += ' ORDER BY final_difficulty_score DESC, word ASC LIMIT ? OFFSET ?';
    params.push(pageSize, offset);
    
    // Get results
    const results = await this.db
      .prepare(sql)
      .bind(...params)
      .all();
    
    // Get total count
    let countSql = `
      SELECT COUNT(*) as total FROM vocabulary_master
      WHERE (LOWER(word) LIKE LOWER(?) OR LOWER(definition_ja) LIKE LOWER(?))
    `;
    const countParams: any[] = [`%${query}%`, `%${query}%`];
    
    if (filters?.cefrLevel) {
      countSql += ' AND cefr_level = ?';
      countParams.push(filters.cefrLevel);
    }
    if (filters?.eikenGrade) {
      countSql += ' AND eiken_grade = ?';
      countParams.push(filters.eikenGrade);
    }
    if (filters?.minDifficulty !== undefined) {
      countSql += ' AND final_difficulty_score >= ?';
      countParams.push(filters.minDifficulty);
    }
    if (filters?.maxDifficulty !== undefined) {
      countSql += ' AND final_difficulty_score <= ?';
      countParams.push(filters.maxDifficulty);
    }
    
    const countResult = await this.db
      .prepare(countSql)
      .bind(...countParams)
      .first<{ total: number }>();
    
    const total = countResult?.total || 0;
    
    return {
      results: results.results.map(r => this.mapToVocabularyMaster(r)),
      total,
      page,
      pageSize
    };
  }
  
  /**
   * Create new vocabulary entry
   */
  async create(input: {
    word: string;
    pos: PartOfSpeech;
    definitionEn: string;
    definitionJa: string;
    cefrLevel?: CEFRLevel;
    frequencyRank?: number;
    eikenGrade?: EikenGrade;
    eikenFrequency?: number;
    polysemyCount?: number;
    isKatakanaWord?: boolean;
    isFalseCognate?: boolean;
    falseCognateNote?: string;
    l1InterferenceRisk?: boolean;
    l1InterferenceNote?: string;
    ipaPronunciation?: string;
    katakanaPronunciation?: string;
    audioUrl?: string;
    exampleSentences?: ExampleSentence[];
    collocations?: string[];
  }): Promise<number> {
    
    // Calculate difficulty score
    const difficultyInput: VocabularyDifficultyInput = {
      word: input.word,
      cefrLevel: input.cefrLevel,
      frequencyRank: input.frequencyRank,
      eikenGrade: input.eikenGrade,
      eikenFrequency: input.eikenFrequency,
      polysemyCount: input.polysemyCount || 1,
      isKatakanaWord: input.isKatakanaWord || false,
      isFalseCognate: input.isFalseCognate || false,
      l1InterferenceRisk: input.l1InterferenceRisk || false
    };
    
    const difficultyScore = vocabularyDifficultyScorer.calculateDifficulty(difficultyInput);
    
    const result = await this.db
      .prepare(`
        INSERT INTO vocabulary_master (
          word, pos, definition_en, definition_ja,
          cefr_level, cefr_score, frequency_rank, eiken_frequency, eiken_grade,
          japanese_learner_difficulty, polysemy_count,
          final_difficulty_score, should_annotate,
          is_katakana_word, is_false_cognate, false_cognate_note,
          l1_interference_risk, l1_interference_note,
          ipa_pronunciation, katakana_pronunciation, audio_url,
          example_sentences, collocations
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.word,
        input.pos,
        input.definitionEn,
        input.definitionJa,
        input.cefrLevel || null,
        difficultyScore.cefrScore,
        input.frequencyRank || null,
        input.eikenFrequency || 0,
        input.eikenGrade || null,
        difficultyScore.japaneseLearnerScore,
        input.polysemyCount || 1,
        difficultyScore.finalScore,
        difficultyScore.shouldAnnotate ? 1 : 0,
        input.isKatakanaWord ? 1 : 0,
        input.isFalseCognate ? 1 : 0,
        input.falseCognateNote || null,
        input.l1InterferenceRisk ? 1 : 0,
        input.l1InterferenceNote || null,
        input.ipaPronunciation || null,
        input.katakanaPronunciation || null,
        input.audioUrl || null,
        input.exampleSentences ? JSON.stringify(input.exampleSentences) : null,
        input.collocations ? JSON.stringify(input.collocations) : null
      )
      .run();
    
    return result.meta.last_row_id;
  }
  
  /**
   * Update vocabulary entry
   */
  async update(wordId: number, updates: Partial<{
    definitionJa: string;
    definitionEn: string;
    ipaPronunciation: string;
    katakanaPronunciation: string;
    audioUrl: string;
    exampleSentences: ExampleSentence[];
    collocations: string[];
    falseCognateNote: string;
    l1InterferenceNote: string;
  }>): Promise<void> {
    const setClauses: string[] = [];
    const params: any[] = [];
    
    if (updates.definitionJa !== undefined) {
      setClauses.push('definition_ja = ?');
      params.push(updates.definitionJa);
    }
    if (updates.definitionEn !== undefined) {
      setClauses.push('definition_en = ?');
      params.push(updates.definitionEn);
    }
    if (updates.ipaPronunciation !== undefined) {
      setClauses.push('ipa_pronunciation = ?');
      params.push(updates.ipaPronunciation);
    }
    if (updates.katakanaPronunciation !== undefined) {
      setClauses.push('katakana_pronunciation = ?');
      params.push(updates.katakanaPronunciation);
    }
    if (updates.audioUrl !== undefined) {
      setClauses.push('audio_url = ?');
      params.push(updates.audioUrl);
    }
    if (updates.exampleSentences !== undefined) {
      setClauses.push('example_sentences = ?');
      params.push(JSON.stringify(updates.exampleSentences));
    }
    if (updates.collocations !== undefined) {
      setClauses.push('collocations = ?');
      params.push(JSON.stringify(updates.collocations));
    }
    if (updates.falseCognateNote !== undefined) {
      setClauses.push('false_cognate_note = ?');
      params.push(updates.falseCognateNote);
    }
    if (updates.l1InterferenceNote !== undefined) {
      setClauses.push('l1_interference_note = ?');
      params.push(updates.l1InterferenceNote);
    }
    
    if (setClauses.length === 0) return;
    
    params.push(wordId);
    
    await this.db
      .prepare(`UPDATE vocabulary_master SET ${setClauses.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run();
  }
  
  /**
   * Get words by CEFR level
   */
  async getBycefrLevel(cefrLevel: CEFRLevel, limit: number = 50): Promise<VocabularyMaster[]> {
    const results = await this.db
      .prepare('SELECT * FROM vocabulary_master WHERE cefr_level = ? ORDER BY word LIMIT ?')
      .bind(cefrLevel, limit)
      .all();
    
    return results.results.map(r => this.mapToVocabularyMaster(r));
  }
  
  /**
   * Get words by Eiken grade
   */
  async getByEikenGrade(eikenGrade: EikenGrade, limit: number = 50): Promise<VocabularyMaster[]> {
    const results = await this.db
      .prepare('SELECT * FROM vocabulary_master WHERE eiken_grade = ? ORDER BY eiken_frequency DESC, word LIMIT ?')
      .bind(eikenGrade, limit)
      .all();
    
    return results.results.map(r => this.mapToVocabularyMaster(r));
  }
  
  /**
   * Get false cognate words (和製英語)
   */
  async getFalseCognates(): Promise<VocabularyMaster[]> {
    const results = await this.db
      .prepare('SELECT * FROM vocabulary_master WHERE is_false_cognate = 1 ORDER BY word')
      .all();
    
    return results.results.map(r => this.mapToVocabularyMaster(r));
  }
  
  /**
   * Batch get words by IDs
   */
  async getByIds(wordIds: number[]): Promise<VocabularyMaster[]> {
    if (wordIds.length === 0) return [];
    
    const placeholders = wordIds.map(() => '?').join(',');
    const results = await this.db
      .prepare(`SELECT * FROM vocabulary_master WHERE id IN (${placeholders})`)
      .bind(...wordIds)
      .all();
    
    return results.results.map(r => this.mapToVocabularyMaster(r));
  }
  
  /**
   * Map database row to VocabularyMaster type
   */
  private mapToVocabularyMaster(row: any): VocabularyMaster {
    return {
      id: row.id,
      word: row.word,
      pos: row.pos as PartOfSpeech,
      definitionEn: row.definition_en,
      definitionJa: row.definition_ja,
      cefrLevel: row.cefr_level as CEFRLevel | undefined,
      cefrScore: row.cefr_score,
      frequencyRank: row.frequency_rank,
      zipfScore: row.zipf_score,
      eikenFrequency: row.eiken_frequency,
      eikenGrade: row.eiken_grade as EikenGrade | undefined,
      eikenImportance: row.eiken_importance,
      japaneseLearnerDifficulty: row.japanese_learner_difficulty,
      polysemyCount: row.polysemy_count,
      contextDependency: (row.context_dependency || 'low') as ContextDependency,
      finalDifficultyScore: row.final_difficulty_score,
      shouldAnnotate: Boolean(row.should_annotate),
      isKatakanaWord: Boolean(row.is_katakana_word),
      isFalseCognate: Boolean(row.is_false_cognate),
      falseCognateNote: row.false_cognate_note || undefined,
      l1InterferenceRisk: Boolean(row.l1_interference_risk),
      l1InterferenceNote: row.l1_interference_note || undefined,
      ipaPronunciation: row.ipa_pronunciation || undefined,
      katakanaPronunciation: row.katakana_pronunciation || undefined,
      audioUrl: row.audio_url || undefined,
      exampleSentences: row.example_sentences ? JSON.parse(row.example_sentences) : undefined,
      collocations: row.collocations ? JSON.parse(row.collocations) : undefined,
      etymology: row.etymology || undefined,
      relatedWords: row.related_words ? JSON.parse(row.related_words) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
