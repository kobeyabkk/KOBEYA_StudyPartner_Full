/**
 * KOBEYA Study Partner - Base64 Utilities
 * Base64エンコーディング関連のユーティリティ
 */

/**
 * 画像の最大サイズ (5MB)
 */
export const MAX_IMAGE_SIZE = 5000000

/**
 * ArrayBufferをBase64文字列に変換する
 * Cloudflare Workers環境対応版
 * 
 * @param arrayBuffer - 変換するArrayBuffer
 * @returns Base64エンコードされた文字列
 * @throws エラーが発生した場合
 */
export function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(arrayBuffer)
  
  // サイズチェック
  if (uint8Array.length > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large: ${uint8Array.length} bytes (max: ${MAX_IMAGE_SIZE})`)
  }
  
  // Cloudflare Workers環境でのBase64エンコーディング
  let binary = ''
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i])
  }
  
  return btoa(binary)
}

/**
 * FileオブジェクトをBase64データURLに変換する
 * 
 * @param file - 変換するFileオブジェクト
 * @returns データURL形式の文字列 (data:image/png;base64,...)
 * @throws エラーが発生した場合
 */
export async function fileToDataUrl(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const base64String = arrayBufferToBase64(arrayBuffer)
  return `data:${file.type};base64,${base64String}`
}

/**
 * Base64文字列が有効かチェックする
 * 
 * @param base64String - チェックするBase64文字列
 * @returns 有効な場合true
 */
export function isValidBase64(base64String: string): boolean {
  if (!base64String || base64String.length === 0) {
    return false
  }
  
  // Base64の有効な文字のみで構成されているかチェック
  return /^[A-Za-z0-9+/=]*$/.test(base64String)
}

/**
 * データURLからBase64部分を抽出する
 * 
 * @param dataUrl - データURL (data:image/png;base64,...)
 * @returns Base64文字列、または空文字列
 */
export function extractBase64FromDataUrl(dataUrl: string): string {
  const parts = dataUrl.split(',')
  if (parts.length !== 2) {
    return ''
  }
  
  return parts[1] || ''
}
