/**
 * 英検対策システム - JWT認証ミドルウェア
 * Cloudflare Workers環境対応（joseライブラリ使用）
 */

import { jwtVerify, SignJWT } from 'jose';
import type { EikenEnv } from '../types';

export interface JWTPayload {
  sub: string;        // student_id
  email: string;
  grade: string;
  iat: number;
  exp: number;
}

/**
 * JWTトークンを生成
 */
export async function generateToken(
  studentId: string,
  email: string,
  grade: string,
  env: EikenEnv
): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  
  const token = await new SignJWT({
    sub: studentId,
    email,
    grade
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
  
  return token;
}

/**
 * JWTトークンを検証
 */
export async function verifyToken(
  token: string,
  env: EikenEnv
): Promise<JWTPayload | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    
    return payload as JWTPayload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

/**
 * リクエストから認証情報を取得
 */
export async function authenticateRequest(
  request: Request,
  env: EikenEnv
): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const payload = await verifyToken(token, env);
  
  if (!payload) {
    return null;
  }
  
  // 学生プロフィールが存在し、アクティブか確認
  const profile = await env.DB.prepare(`
    SELECT id, account_status FROM eiken_student_profiles WHERE id = ?
  `).bind(payload.sub).first<{ id: string; account_status: string }>();
  
  if (!profile || profile.account_status !== 'active') {
    return null;
  }
  
  // 最終ログイン時刻を更新
  await env.DB.prepare(`
    UPDATE eiken_student_profiles 
    SET last_login = CURRENT_TIMESTAMP, 
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).bind(payload.sub).run();
  
  return payload.sub;
}

/**
 * 監査ログを記録
 */
export async function logAudit(
  studentId: string,
  action: string,
  resourceType: string | null,
  resourceId: string | null,
  request: Request,
  env: EikenEnv
): Promise<void> {
  const ipAddress = request.headers.get('CF-Connecting-IP') || 'unknown';
  const userAgent = request.headers.get('User-Agent') || 'unknown';
  
  try {
    await env.DB.prepare(`
      INSERT INTO eiken_audit_logs (
        student_id, action_type, resource_type, resource_id,
        ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(studentId, action, resourceType, resourceId, ipAddress, userAgent).run();
  } catch (error) {
    console.error('Failed to log audit:', error);
    // 監査ログ失敗でもリクエストは続行
  }
}
