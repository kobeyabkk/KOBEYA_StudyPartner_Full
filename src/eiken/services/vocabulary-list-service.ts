/**
 * Vocabulary List Service
 * CEFR-J Wordlistからの語彙取得サービス
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface VocabularyWord {
  word_lemma: string;
  pos: string;
  cefr_level: string;
  confidence: number;
}

export interface VocabularyListOptions {
  level: string;  // CEFR level: A1, A2, B1, B2
  pos?: string;   // Part of speech filter (optional)
  limit?: number; // Number of words to retrieve
  random?: boolean; // Random selection
}

/**
 * Vocabulary List Service
 * 
 * Essay生成プロンプト用の語彙リストを提供
 */
export class VocabularyListService {
  constructor(private db: D1Database) {}

  /**
   * 指定レベルの語彙リストを取得（頻出語優先）
   * 
   * @param options - 検索オプション
   * @returns 語彙リスト
   */
  async getVocabularyList(options: VocabularyListOptions): Promise<VocabularyWord[]> {
    const { level, pos, limit = 200, random = false } = options;
    
    // SQLクエリを構築
    let sql = `
      SELECT 
        word_lemma,
        pos,
        cefr_level,
        confidence
      FROM eiken_vocabulary_lexicon
      WHERE cefr_level = ?
    `;
    
    const params: any[] = [level.toUpperCase()];
    
    // 品詞フィルタ
    if (pos) {
      sql += ' AND pos = ?';
      params.push(pos);
    }
    
    // 高信頼度のみ
    sql += ' AND confidence >= 0.9';
    
    // ランダムまたはアルファベット順
    if (random) {
      sql += ' ORDER BY RANDOM()';
    } else {
      sql += ' ORDER BY word_lemma ASC';
    }
    
    sql += ' LIMIT ?';
    params.push(limit);
    
    try {
      const result = await this.db.prepare(sql).bind(...params).all();
      
      if (!result.success) {
        console.error('[VocabularyListService] Query failed');
        return [];
      }
      
      return result.results as VocabularyWord[];
    } catch (error) {
      console.error('[VocabularyListService] Error:', error);
      return [];
    }
  }

  /**
   * Essay生成用の語彙リストを取得（コア語彙200語）
   * 
   * 各品詞から適切な割合で抽出：
   * - 名詞: 40% (80語)
   * - 動詞: 30% (60語)
   * - 形容詞: 20% (40語)
   * - 副詞: 10% (20語)
   * 
   * @param level - CEFRレベル
   * @returns 品詞別語彙リスト
   */
  async getCoreVocabularyForEssay(level: string): Promise<{
    nouns: string[];
    verbs: string[];
    adjectives: string[];
    adverbs: string[];
    all: string[];
  }> {
    try {
      // 名詞（80語）
      const nouns = await this.getVocabularyList({ 
        level, 
        pos: 'noun', 
        limit: 80,
        random: false  // アルファベット順で頻出語を取得
      });
      
      // 動詞（60語）
      const verbs = await this.getVocabularyList({ 
        level, 
        pos: 'verb', 
        limit: 60,
        random: false
      });
      
      // 形容詞（40語）
      const adjectives = await this.getVocabularyList({ 
        level, 
        pos: 'adjective', 
        limit: 40,
        random: false
      });
      
      // 副詞（20語）
      const adverbs = await this.getVocabularyList({ 
        level, 
        pos: 'adverb', 
        limit: 20,
        random: false
      });
      
      // 全ての単語を統合
      const all = [
        ...nouns.map(w => w.word_lemma),
        ...verbs.map(w => w.word_lemma),
        ...adjectives.map(w => w.word_lemma),
        ...adverbs.map(w => w.word_lemma)
      ];
      
      return {
        nouns: nouns.map(w => w.word_lemma),
        verbs: verbs.map(w => w.word_lemma),
        adjectives: adjectives.map(w => w.word_lemma),
        adverbs: adverbs.map(w => w.word_lemma),
        all
      };
    } catch (error) {
      console.error('[VocabularyListService] Error in getCoreVocabularyForEssay:', error);
      // エラー時は空の配列を返す
      return {
        nouns: [],
        verbs: [],
        adjectives: [],
        adverbs: [],
        all: []
      };
    }
  }

  /**
   * プロンプト用の語彙リスト文字列を生成
   * 
   * @param level - CEFRレベル
   * @param format - 'inline' | 'categorized'
   * @returns プロンプトに埋め込む文字列
   */
  async getVocabularyPromptString(
    level: string, 
    format: 'inline' | 'categorized' = 'inline'
  ): Promise<string> {
    const vocab = await this.getCoreVocabularyForEssay(level);
    
    if (vocab.all.length === 0) {
      return `(Vocabulary list unavailable - use standard ${level} words)`;
    }
    
    if (format === 'inline') {
      // カンマ区切りの1行形式
      return vocab.all.slice(0, 200).join(', ');
    } else {
      // 品詞別カテゴリ形式
      return `
**Nouns (80)**: ${vocab.nouns.slice(0, 80).join(', ')}

**Verbs (60)**: ${vocab.verbs.slice(0, 60).join(', ')}

**Adjectives (40)**: ${vocab.adjectives.slice(0, 40).join(', ')}

**Adverbs (20)**: ${vocab.adverbs.slice(0, 20).join(', ')}
      `.trim();
    }
  }

  /**
   * 単語のCEFRレベルを検証
   * 
   * @param word - 検証する単語
   * @returns CEFRレベル（見つからない場合はnull）
   */
  async checkWordLevel(word: string): Promise<string | null> {
    try {
      const result = await this.db.prepare(`
        SELECT cefr_level
        FROM eiken_vocabulary_lexicon
        WHERE LOWER(word_lemma) = LOWER(?)
        LIMIT 1
      `).bind(word.trim()).first<{ cefr_level: string }>();
      
      return result?.cefr_level || null;
    } catch (error) {
      console.error('[VocabularyListService] Error in checkWordLevel:', error);
      return null;
    }
  }

  /**
   * 複数の単語のCEFRレベルを一括検証（バッチ処理）
   * 
   * @param words - 検証する単語の配列
   * @returns 単語とそのCEFRレベルのマップ
   */
  async checkWordLevelsBatch(words: string[]): Promise<Map<string, string | null>> {
    if (words.length === 0) {
      return new Map();
    }
    
    try {
      // IN句で一括クエリ（最大100語ずつ）
      const resultMap = new Map<string, string | null>();
      const chunkSize = 100;
      
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => '?').join(',');
        
        const result = await this.db.prepare(`
          SELECT LOWER(word_lemma) as word, cefr_level
          FROM eiken_vocabulary_lexicon
          WHERE LOWER(word_lemma) IN (${placeholders})
        `).bind(...chunk.map(w => w.toLowerCase())).all();
        
        if (result.success && result.results) {
          for (const row of result.results as any[]) {
            resultMap.set(row.word, row.cefr_level);
          }
        }
      }
      
      // クエリ結果にない単語はnullとして追加
      for (const word of words) {
        if (!resultMap.has(word.toLowerCase())) {
          resultMap.set(word.toLowerCase(), null);
        }
      }
      
      return resultMap;
    } catch (error) {
      console.error('[VocabularyListService] Error in checkWordLevelsBatch:', error);
      // エラー時は全てnullを返す
      const resultMap = new Map<string, string | null>();
      for (const word of words) {
        resultMap.set(word.toLowerCase(), null);
      }
      return resultMap;
    }
  }

  /**
   * テキスト中の語彙レベルを分析（バッチ処理版）
   * 
   * @param text - 分析するテキスト
   * @param targetLevel - 目標CEFRレベル
   * @returns 語彙レベル分析結果
   */
  async analyzeVocabularyLevel(
    text: string,
    targetLevel: string
  ): Promise<{
    totalWords: number;
    withinLevel: number;
    aboveLevel: number;
    unknownWords: string[];
    score: number;  // 0-100の適合率
  }> {
    // 単語を抽出（英単語のみ）
    const words = text
      .toLowerCase()
      .match(/\b[a-z]+\b/g) || [];
    
    const uniqueWords = Array.from(new Set(words));
    const totalWords = uniqueWords.length;
    
    if (totalWords === 0) {
      return {
        totalWords: 0,
        withinLevel: 0,
        aboveLevel: 0,
        unknownWords: [],
        score: 0
      };
    }
    
    let withinLevel = 0;
    let aboveLevel = 0;
    const unknownWords: string[] = [];
    
    // レベル順序
    const levelOrder = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const targetLevelIndex = levelOrder.indexOf(targetLevel.toUpperCase());
    
    // 3文字以上の単語のみをバッチ処理
    const wordsToCheck = uniqueWords.filter(w => w.length >= 3);
    const shortWords = uniqueWords.filter(w => w.length < 3);
    
    // 短い単語は自動的に合格とカウント
    withinLevel += shortWords.length;
    
    // バッチでCEFRレベルを取得
    const wordLevelMap = await this.checkWordLevelsBatch(wordsToCheck);
    
    // 各単語のレベルを判定
    for (const word of wordsToCheck) {
      const wordLevel = wordLevelMap.get(word.toLowerCase());
      
      if (wordLevel === null) {
        unknownWords.push(word);
      } else {
        const wordLevelIndex = levelOrder.indexOf(wordLevel);
        
        if (wordLevelIndex <= targetLevelIndex) {
          withinLevel++;
        } else {
          aboveLevel++;
        }
      }
    }
    
    // スコア計算（目標レベル内の語彙 / 総語彙数）
    const score = Math.round((withinLevel / totalWords) * 100);
    
    return {
      totalWords,
      withinLevel,
      aboveLevel,
      unknownWords,
      score
    };
  }
}
