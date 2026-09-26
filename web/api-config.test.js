import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_API_BASE, resolveApiBase } from './api-config.js'

test('defaults to the backend and normalizes configured URLs', () => {
  assert.equal(resolveApiBase(), DEFAULT_API_BASE)
  assert.equal(resolveApiBase(' https://api.example.com/ '), 'https://api.example.com')
})
test('rejects keys and relative paths before publishing a broken bundle', () => {
  for (const value of ['sk_test_not-a-real-key', '/api', 'javascript:alert(1)', 'https://user:password@example.com', 'https://example.com?key=private']) {
    assert.throws(() => resolveApiBase(value), /SAGE_API_BASE_URL/)
  }
})
