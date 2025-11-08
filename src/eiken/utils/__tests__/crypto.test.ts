/**
 * 英検対策システム - Cryptoユーティリティのテスト
 */

import { describe, it, expect } from 'vitest';
import { hashText, generateUUID, generateRequestId } from '../crypto';

describe('Crypto Utilities', () => {
  it('should generate consistent SHA-256 hashes', async () => {
    const text = 'Hello, EIKEN!';
    const hash1 = await hashText(text);
    const hash2 = await hashText(text);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
  });

  it('should generate different hashes for different texts', async () => {
    const hash1 = await hashText('text1');
    const hash2 = await hashText('text2');
    
    expect(hash1).not.toBe(hash2);
  });

  it('should generate valid UUIDs', () => {
    const uuid1 = generateUUID();
    const uuid2 = generateUUID();
    
    expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(uuid2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(uuid1).not.toBe(uuid2);
  });

  it('should generate valid request IDs', () => {
    const reqId1 = generateRequestId();
    const reqId2 = generateRequestId();
    
    expect(reqId1).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
    expect(reqId2).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
    expect(reqId1).not.toBe(reqId2);
  });
});
