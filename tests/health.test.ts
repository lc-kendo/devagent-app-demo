import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';

describe('Health Check', () => {
  it('GET /health returns 200 with status ok', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
