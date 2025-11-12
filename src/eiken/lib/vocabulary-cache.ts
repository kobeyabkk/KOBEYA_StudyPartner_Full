/**
 * 語彙検索のKVキャッシュレイヤー
 * 
 * 目的: 頻出語彙の検索結果をKVにキャッシュして高速化
 */

import type { VocabularyEntry, VocabularyCache } from '../types/vocabulary';

// ====================
// 定数
// ====================

const CACHE_PREFIX = 'vocab:';
const DEFAULT_TTL = 86400; // 24時間（秒）
const MAX_CACHE_SIZE = 1000; // メモリキャッシュの最大サイズ

// ====================
// インメモリキャッシュ（Workers実行中のみ有効）
// ====================

const memoryCache = new Map<string, VocabularyCache>();

/**
 * メモリキャッシュをクリーンアップ
 */
function cleanupMemoryCache(): void {
  const now = Date.now() / 1000;
  
  for (const [key, cache] of memoryCache.entries()) {
    if (now - cache.timestamp > cache.ttl) {
      memoryCache.delete(key);
    }
  }
  
  // サイズ制限を超えた場合、古いものから削除
  if (memoryCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(memoryCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toDelete = entries.slice(0, memoryCache.size - MAX_CACHE_SIZE);
    for (const [key] of toDelete) {
      memoryCache.delete(key);
    }
  }
}

// ====================
// KVキャッシュ関数
// ====================

/**
 * KVキャッシュキーを生成
 */
function getCacheKey(word: string): string {
  return `${CACHE_PREFIX}${word.toLowerCase()}`;
}

/**
 * KVからキャッシュを取得
 */
export async function getCachedWord(
  word: string,
  kv: KVNamespace | undefined
): Promise<VocabularyEntry | null | undefined> {
  const normalized = word.toLowerCase();
  
  // 1. メモリキャッシュをチェック
  const memoryCached = memoryCache.get(normalized);
  if (memoryCached) {
    const now = Date.now() / 1000;
    if (now - memoryCached.timestamp <= memoryCached.ttl) {
      return memoryCached.entry;
    }
    // 期限切れの場合は削除
    memoryCache.delete(normalized);
  }
  
  // 2. KVをチェック（KVが利用可能な場合のみ）
  if (!kv) {
    return undefined; // KV未設定の場合はキャッシュなし
  }
  
  const cacheKey = getCacheKey(normalized);
  const cached = await kv.get<VocabularyEntry>(cacheKey, 'json');
  
  if (cached !== null) {
    // メモリキャッシュにも保存
    memoryCache.set(normalized, {
      word: normalized,
      entry: cached,
      timestamp: Date.now() / 1000,
      ttl: DEFAULT_TTL,
    });
    
    return cached;
  }
  
  return undefined; // キャッシュなし
}

/**
 * KVにキャッシュを保存
 */
export async function setCachedWord(
  word: string,
  entry: VocabularyEntry | null,
  kv: KVNamespace | undefined,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  const normalized = word.toLowerCase();
  const cacheKey = getCacheKey(normalized);
  
  // KVに保存（KVが利用可能な場合のみ）
  if (kv) {
    await kv.put(cacheKey, JSON.stringify(entry), {
      expirationTtl: ttl,
    });
  }
  
  // メモリキャッシュにも保存
  memoryCache.set(normalized, {
    word: normalized,
    entry,
    timestamp: Date.now() / 1000,
    ttl,
  });
  
  // 定期的にメモリキャッシュをクリーンアップ
  if (Math.random() < 0.01) { // 1%の確率で実行
    cleanupMemoryCache();
  }
}

/**
 * 複数の単語のキャッシュを一括取得
 */
export async function getCachedWords(
  words: string[],
  kv: KVNamespace | undefined
): Promise<Map<string, VocabularyEntry | null>> {
  const result = new Map<string, VocabularyEntry | null>();
  const uncached: string[] = [];
  
  for (const word of words) {
    const normalized = word.toLowerCase();
    
    // メモリキャッシュをチェック
    const memoryCached = memoryCache.get(normalized);
    if (memoryCached) {
      const now = Date.now() / 1000;
      if (now - memoryCached.timestamp <= memoryCached.ttl) {
        result.set(normalized, memoryCached.entry);
        continue;
      }
      memoryCache.delete(normalized);
    }
    
    uncached.push(normalized);
  }
  
  // KVから一括取得（KVが利用可能な場合のみ）
  if (uncached.length > 0 && kv) {
    // KVは一括取得APIがないため、並列で取得
    const promises = uncached.map(async (word) => {
      const cacheKey = getCacheKey(word);
      const cached = await kv.get<VocabularyEntry>(cacheKey, 'json');
      return { word, entry: cached };
    });
    
    const kvResults = await Promise.all(promises);
    
    for (const { word, entry } of kvResults) {
      if (entry !== null) {
        result.set(word, entry);
        // メモリキャッシュにも保存
        memoryCache.set(word, {
          word,
          entry,
          timestamp: Date.now() / 1000,
          ttl: DEFAULT_TTL,
        });
      }
    }
  }
  
  return result;
}

/**
 * KVキャッシュを無効化
 */
export async function invalidateCache(
  word: string,
  kv: KVNamespace | undefined
): Promise<void> {
  const normalized = word.toLowerCase();
  const cacheKey = getCacheKey(normalized);
  
  if (kv) {
    await kv.delete(cacheKey);
  }
  memoryCache.delete(normalized);
}

/**
 * 全KVキャッシュをクリア（開発/テスト用）
 */
export async function clearAllCache(kv: KVNamespace | undefined): Promise<void> {
  if (kv) {
    // KVの全キーをリスト
    const list = await kv.list({ prefix: CACHE_PREFIX });
    
    // 全て削除
    const promises = list.keys.map(key => kv.delete(key.name));
    await Promise.all(promises);
  }
  
  // メモリキャッシュもクリア
  memoryCache.clear();
}

/**
 * キャッシュ統計を取得
 */
export function getCacheStats(): {
  memory_cache_size: number;
  memory_cache_entries: string[];
} {
  return {
    memory_cache_size: memoryCache.size,
    memory_cache_entries: Array.from(memoryCache.keys()),
  };
}

// ====================
// 統合ルックアップ関数（キャッシュ付き）
// ====================

/**
 * キャッシュを利用した語彙検索
 */
export async function lookupWordWithCache(
  word: string,
  db: D1Database,
  kv: KVNamespace | undefined
): Promise<VocabularyEntry | null> {
  const normalized = word.toLowerCase();
  
  // 1. キャッシュをチェック
  const cached = await getCachedWord(normalized, kv);
  if (cached !== undefined) {
    return cached; // null も含む（語彙に存在しない）
  }
  
  // 2. D1から検索（すべてのエントリを取得）
  const stmt = db.prepare(
    'SELECT * FROM eiken_vocabulary_lexicon WHERE word_lemma = ?'
  ).bind(normalized);
  
  const results = await stmt.all<VocabularyEntry>();
  
  let entry: VocabularyEntry | null = null;
  
  if (results.results && results.results.length > 0) {
    // Select the entry with the lowest CEFR level
    const levelOrder: Record<string, number> = {
      'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6
    };
    
    const sorted = results.results.sort((a, b) => {
      const orderA = levelOrder[a.cefr_level] || 999;
      const orderB = levelOrder[b.cefr_level] || 999;
      return orderA - orderB;
    });
    
    entry = sorted[0];
  }
  
  // 3. キャッシュに保存
  await setCachedWord(normalized, entry, kv);
  
  return entry;
}

/**
 * 複数の単語を一括検索（キャッシュ付き）
 */
export async function lookupWordsWithCache(
  words: string[],
  db: D1Database,
  kv: KVNamespace
): Promise<Map<string, VocabularyEntry | null>> {
  const normalized = words.map(w => w.toLowerCase());
  const unique = Array.from(new Set(normalized));
  
  // 1. キャッシュから取得
  const cached = await getCachedWords(unique, kv);
  
  // 2. キャッシュにない単語を特定
  const uncached = unique.filter(word => !cached.has(word));
  
  if (uncached.length === 0) {
    return cached;
  }
  
  // 3. D1から検索
  const placeholders = uncached.map(() => '?').join(',');
  const query = `SELECT * FROM eiken_vocabulary_lexicon WHERE word_lemma IN (${placeholders})`;
  
  const stmt = db.prepare(query).bind(...uncached);
  const result = await stmt.all<VocabularyEntry>();
  
  // 4. 結果をマージしてキャッシュに保存
  const dbResults = new Map<string, VocabularyEntry>();
  if (result.results) {
    for (const entry of result.results) {
      dbResults.set(entry.word_lemma, entry);
    }
  }
  
  // キャッシュに保存（Promise.allで並列化）
  const cachePromises = uncached.map(word => {
    const entry = dbResults.get(word) || null;
    cached.set(word, entry);
    return setCachedWord(word, entry, kv);
  });
  
  await Promise.all(cachePromises);
  
  return cached;
}
