/**
 * 英検対策システム - RateLimiterサービス
 * V3設計書: バースト対策、リトライ機能、統計監視
 */

import type { EikenEnv } from '../types';

interface RateLimitConfig {
  maxRequestsPerMinute: number;
  burstSize?: number;
}

interface RequestRecord {
  timestamp: number;
}

export class RateLimiter {
  private queue: RequestRecord[] = [];
  private readonly config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      maxRequestsPerMinute: config.maxRequestsPerMinute,
      burstSize: config.burstSize || config.maxRequestsPerMinute
    };
  }

  /**
   * レート制限チェック＆実行
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitIfNeeded();
    this.recordRequest();
    return await fn();
  }

  /**
   * 必要に応じて待機
   */
  private async waitIfNeeded(): Promise<void> {
    this.cleanup();
    
    if (this.queue.length >= this.config.burstSize) {
      const oldestRequest = this.queue[0];
      const elapsed = Date.now() - oldestRequest.timestamp;
      const waitTime = 60000 - elapsed;
      
      if (waitTime > 0) {
        console.log(`⏳ Rate limit: waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.cleanup();
      }
    }
  }

  /**
   * リクエストを記録
   */
  private recordRequest(): void {
    this.queue.push({ timestamp: Date.now() });
  }

  /**
   * 古いリクエストをクリーンアップ
   */
  private cleanup(): void {
    const oneMinuteAgo = Date.now() - 60000;
    this.queue = this.queue.filter(req => req.timestamp > oneMinuteAgo);
  }

  /**
   * 統計情報
   */
  getStats() {
    this.cleanup();
    return {
      current_requests: this.queue.length,
      limit: this.config.maxRequestsPerMinute,
      burst_size: this.config.burstSize
    };
  }
}

/**
 * OpenAI Chat用レート制限（450 RPM）
 */
export const ChatRateLimiter = new RateLimiter({
  maxRequestsPerMinute: 450,
  burstSize: 50
});

/**
 * OpenAI Embeddings用レート制限（2800 RPM）
 */
export const EmbeddingRateLimiter = new RateLimiter({
  maxRequestsPerMinute: 2800,
  burstSize: 100
});
