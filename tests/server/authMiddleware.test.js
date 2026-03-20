// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fs/crypto for authMiddleware
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'API_TOKEN=test-secret-token\n'),
  appendFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
}))

// Set API_TOKEN env before importing
process.env.API_TOKEN = 'test-secret-token'

const { authMiddleware, getApiToken } = await import('../../server/authMiddleware.js')

function mockReq(overrides = {}) {
  return {
    url: '/api/songs',
    method: 'GET',
    headers: {
      authorization: `Bearer ${getApiToken()}`,
      host: 'localhost:5555',
    },
    ...overrides,
  }
}

function mockRes() {
  const res = {
    _status: null,
    _body: null,
    _headers: {},
    writeHead(status, headers) { res._status = status; res._headers = headers },
    end(body) { res._body = body },
  }
  return res
}

describe('authMiddleware', () => {
  it('passes through non-API routes', () => {
    const next = vi.fn()
    authMiddleware(mockReq({ url: '/index.html' }), mockRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('passes through /api/spotify/callback', () => {
    const next = vi.fn()
    authMiddleware(mockReq({ url: '/api/spotify/callback?code=abc' }), mockRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('passes through /api/auth/token', () => {
    const next = vi.fn()
    authMiddleware(mockReq({ url: '/api/auth/token' }), mockRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 401 when Authorization header is missing', () => {
    const next = vi.fn()
    const res = mockRes()
    authMiddleware(mockReq({ headers: { host: 'localhost:5555' } }), res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res._status).toBe(401)
  })

  it('returns 401 when token is invalid', () => {
    const next = vi.fn()
    const res = mockRes()
    authMiddleware(mockReq({ headers: { authorization: 'Bearer wrong-token', host: 'localhost:5555' } }), res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res._status).toBe(401)
  })

  it('allows valid Bearer token', () => {
    const next = vi.fn()
    authMiddleware(mockReq(), mockRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('checks CSRF Origin on mutating requests', () => {
    const next = vi.fn()
    const res = mockRes()
    authMiddleware(mockReq({
      method: 'POST',
      headers: {
        authorization: `Bearer ${getApiToken()}`,
        host: 'localhost:5555',
        origin: 'https://evil.com',
      },
    }), res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res._status).toBe(403)
  })

  it('allows same-origin mutating requests', () => {
    const next = vi.fn()
    authMiddleware(mockReq({
      method: 'POST',
      headers: {
        authorization: `Bearer ${getApiToken()}`,
        host: 'localhost:5555',
        origin: 'http://localhost:5555',
      },
    }), mockRes(), next)
    expect(next).toHaveBeenCalled()
  })
})
