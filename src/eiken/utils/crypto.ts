/**
 * 英検対策システム - Web Crypto APIユーティリティ
 * Cloudflare Workers環境対応
 */

/**
 * テキストのSHA-256ハッシュを生成
 * Workers環境のWeb Crypto APIを使用
 */
export async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * JSONオブジェクトのハッシュを生成
 * 安定したJSON文字列化を使用
 */
export async function hashJSON(obj: unknown): Promise<string> {
  // 安定したJSON文字列化（キーをソート）
  const sortedJSON = JSON.stringify(obj, Object.keys(obj as object).sort());
  return hashText(sortedJSON);
}

/**
 * プロンプトテンプレートのハッシュを生成
 */
export async function hashPromptTemplate(template: string): Promise<string> {
  // 空白を正規化してからハッシュ化
  const normalized = template.trim().replace(/\s+/g, ' ');
  return hashText(normalized);
}

/**
 * UUIDv4を生成（Workers環境対応）
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * リクエストIDを生成（タイムスタンプ + ランダム）
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `req_${timestamp}_${random}`;
}

/**
 * Embeddingテキストのハッシュを生成
 * キャッシュキーとして使用
 */
export async function hashEmbeddingText(text: string): Promise<string> {
  // 小文字化して空白を正規化
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return hashText(normalized);
}
