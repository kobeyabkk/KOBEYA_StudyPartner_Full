/**
 * 英検対策システム - EmbeddingCacheサービス
 * V3設計書に基づくWorkers環境対応実装
 * 
 * V3修正点:
 * - setInterval()を使わない（Workers環境非推奨）
 * - リクエストベースのクリーンアップ
 * - 3層キャッシュ: メモリ → KV → D1 → OpenAI API
 */

import type { EikenEnv, CachedEmbedding } from '../types';
import { hashEmbeddingText } from '../utils/crypto';

interface MemoryCacheEntry {
  embedding: number[];
  timestamp: number;
}

export class EmbeddingCache {
  private memoryCache: Map<string, MemoryCacheEntry> = new Map();
  private readonly maxMemoryCacheSize = 100;
  private lastCleanup: number = Date.now();
  private readonly cleanupInterval = 5 * 60 * 1000; // 5分

  /**
   * Embeddingを取得（3層キャッシュ + API）
   */
  async getEmbedding(text: string, env: EikenEnv): Promise<number[]> {
    // ✅ V3修正: リクエストベースのクリーンアップ
    this.maybeCleanup();

    const textHash = await hashEmbeddingText(text);

    // Level 1: メモリキャッシュ
    const memoryHit = this.memoryCache.get(textHash);
    if (memoryHit) {
      console.log('✅ Embedding cache hit (memory)');
      return memoryHit.embedding;
    }

    // Level 2: KV（高速）
    const kvKey = `eiken:embedding:${textHash}`;
    const kvCached = await env.KV.get(kvKey, 'json');
    if (kvCached && Array.isArray(kvCached)) {
      console.log('✅ Embedding cache hit (KV)');
      this.updateMemoryCache(textHash, kvCached as number[]);
      return kvCached as number[];
    }

    // Level 3: D1（永続）
    const d1Cached = await env.DB.prepare(`
      SELECT embedding_json, last_used_at FROM eiken_embedding_cache 
      WHERE text_hash = ?
    `).bind(textHash).first<{ embedding_json: string; last_used_at: string }>();

    if (d1Cached) {
      console.log('✅ Embedding cache hit (D1)');
      const embedding = JSON.parse(d1Cached.embedding_json);
      
      // KVとメモリに昇格
      await env.KV.put(kvKey, JSON.stringify(embedding), { expirationTtl: 3600 });
      this.updateMemoryCache(textHash, embedding);

      // ✅ V3修正: アプリケーション層で明示的にupdated_atを更新
      await env.DB.prepare(`
        UPDATE eiken_embedding_cache 
        SET last_used_at = CURRENT_TIMESTAMP, 
            use_count = use_count + 1 
        WHERE text_hash = ?
      `).bind(textHash).run();

      return embedding;
    }

    // Level 4: OpenAI API呼び出し
    console.log('❌ Embedding cache miss - calling OpenAI API');
    const embedding = await this.fetchEmbeddingFromAPI(text, env);

    // 全レベルにキャッシュ
    await this.cacheEmbedding(textHash, embedding, env);

    return embedding;
  }

  /**
   * OpenAI Embeddings APIを呼び出し
   */
  private async fetchEmbeddingFromAPI(text: string, env: EikenEnv): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Embeddings API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }

  /**
   * Embeddingを全レベルにキャッシュ
   */
  private async cacheEmbedding(textHash: string, embedding: number[], env: EikenEnv): Promise<void> {
    // メモリキャッシュ
    this.updateMemoryCache(textHash, embedding);

    // KV（1時間）
    const kvKey = `eiken:embedding:${textHash}`;
    await env.KV.put(kvKey, JSON.stringify(embedding), { expirationTtl: 3600 });

    // D1（永続）
    try {
      await env.DB.prepare(`
        INSERT INTO eiken_embedding_cache (text_hash, model, embedding_json)
        VALUES (?, 'text-embedding-3-small', ?)
        ON CONFLICT(text_hash) DO UPDATE SET
          last_used_at = CURRENT_TIMESTAMP,
          use_count = use_count + 1
      `).bind(textHash, JSON.stringify(embedding)).run();
    } catch (error) {
      console.error('Failed to cache embedding in D1:', error);
      // D1エラーでもAPIレスポンスは返す
    }
  }

  /**
   * ✅ V3新規: リクエストベースのクリーンアップ
   * setIntervalを使わず、リクエストごとにチェック
   */
  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup > this.cleanupInterval) {
      this.cleanupMemoryCache();
      this.lastCleanup = now;
      console.log(`🧹 Memory cache cleaned: ${this.memoryCache.size} entries remaining`);
    }
  }

  /**
   * LRU方式でメモリキャッシュをクリーンアップ
   */
  private cleanupMemoryCache(): void {
    if (this.memoryCache.size <= this.maxMemoryCacheSize) {
      return;
    }

    // エントリを古い順にソート
    const entries = Array.from(this.memoryCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    // 古いエントリから削除
    const entriesToRemove = this.memoryCache.size - this.maxMemoryCacheSize;
    for (let i = 0; i < entriesToRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
  }

  /**
   * メモリキャッシュを更新
   */
  private updateMemoryCache(textHash: string, embedding: number[]): void {
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      // 最も古いエントリを削除
      const oldestKey = Array.from(this.memoryCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.memoryCache.delete(oldestKey);
    }

    this.memoryCache.set(textHash, {
      embedding,
      timestamp: Date.now()
    });
  }

  /**
   * キャッシュ統計を取得
   */
  async getCacheStats(env: EikenEnv): Promise<{
    memory_size: number;
    d1_total: number;
    d1_most_used: Array<{ text_hash: string; use_count: number }>;
  }> {
    const d1Stats = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM eiken_embedding_cache
    `).first<{ total: number }>();

    const mostUsed = await env.DB.prepare(`
      SELECT text_hash, use_count 
      FROM eiken_embedding_cache 
      ORDER BY use_count DESC 
      LIMIT 10
    `).all<{ text_hash: string; use_count: number }>();

    return {
      memory_size: this.memoryCache.size,
      d1_total: d1Stats?.total || 0,
      d1_most_used: mostUsed.results
    };
  }
}

/**
 * コサイン類似度を計算
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dotProduct / (magA * magB);
}
