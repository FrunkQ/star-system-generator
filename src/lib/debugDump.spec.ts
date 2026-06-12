import { describe, it, expect } from 'vitest';
import { redactSecrets } from './debugDump';

describe('debugDump redactSecrets', () => {
  it('redacts api keys at any depth without touching other data', () => {
    const input = {
      aiSettings: {
        apiKey: 'sk-or-v1-supersecret',
        selectedModel: 'mistralai/mistral-7b-instruct',
        apiEndpoint: 'https://openrouter.ai/api/v1'
      },
      starmap: { name: 'My Map', systems: [{ id: 's1', authToken: 'abc' }] },
      count: 3
    };
    const out = redactSecrets(input);
    expect(out.aiSettings.apiKey).toBe('[REDACTED]');
    expect(out.starmap.systems[0].authToken).toBe('[REDACTED]');
    expect(out.aiSettings.selectedModel).toBe('mistralai/mistral-7b-instruct');
    expect(out.starmap.name).toBe('My Map');
    expect(out.count).toBe(3);
    // original untouched
    expect(input.aiSettings.apiKey).toBe('sk-or-v1-supersecret');
  });

  it('leaves empty secrets and non-string values alone', () => {
    const out = redactSecrets({ apiKey: '', tokenCount: 42, password: null });
    expect(out.apiKey).toBe('');
    expect(out.tokenCount).toBe(42);
    expect(out.password).toBeNull();
  });

  it('passes primitives and arrays through', () => {
    expect(redactSecrets('hello')).toBe('hello');
    expect(redactSecrets([1, 2, 3])).toEqual([1, 2, 3]);
    expect(redactSecrets(null)).toBeNull();
  });
});
