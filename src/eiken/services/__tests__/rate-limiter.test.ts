import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../rate-limiter';

describe('RateLimiter', () => {
  it('should allow requests under limit', async () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 10 });
    
    const result = await limiter.execute(async () => 'success');
    expect(result).toBe('success');
  });

  it('should track request count', async () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 10 });
    
    await limiter.execute(async () => 'test');
    await limiter.execute(async () => 'test');
    
    const stats = limiter.getStats();
    expect(stats.current_requests).toBe(2);
  });
});
