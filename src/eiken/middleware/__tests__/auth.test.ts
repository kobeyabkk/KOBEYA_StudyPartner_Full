import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken } from '../auth';

// モック環境
const mockEnv = {
  JWT_SECRET: 'test-secret-key-for-testing-only'
} as any;

describe('JWT Authentication', () => {
  it('should generate and verify valid token', async () => {
    const token = await generateToken('student-123', 'test@example.com', '2', mockEnv);
    
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    
    const payload = await verifyToken(token, mockEnv);
    
    expect(payload).toBeTruthy();
    expect(payload?.sub).toBe('student-123');
    expect(payload?.email).toBe('test@example.com');
    expect(payload?.grade).toBe('2');
  });

  it('should reject invalid token', async () => {
    const payload = await verifyToken('invalid-token', mockEnv);
    expect(payload).toBeNull();
  });

  it('should reject token with wrong secret', async () => {
    const token = await generateToken('student-123', 'test@example.com', '2', mockEnv);
    
    const wrongEnv = { JWT_SECRET: 'wrong-secret' } as any;
    const payload = await verifyToken(token, wrongEnv);
    
    expect(payload).toBeNull();
  });
});
