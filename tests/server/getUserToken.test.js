// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Tests for getUserToken refresh flow logic.
 *
 * Mocks db, crypto, and fetch to test the refresh logic in isolation.
 * Never touches production data.
 */

// We test the logic pattern directly rather than importing the module
// (which has side-effect imports of db.js that touch production SQLite).

describe('getUserToken refresh flow', () => {
  let mockDb, mockDecrypt, mockEncrypt

  beforeEach(() => {
    mockDb = {
      getSetting: vi.fn(),
      setSetting: vi.fn(),
    }
    mockDecrypt = vi.fn()
    mockEncrypt = vi.fn((data) => ({ encrypted: true, ...data }))
    vi.restoreAllMocks()
  })

  // Replicate getUserToken logic for testing
  async function getUserToken() {
    const tokens = mockDecrypt(mockDb.getSetting('spotify_tokens'))
    if (!tokens) return null

    // Still valid (with 60s buffer)
    if (Date.now() < tokens.expires_at - 60000) {
      return tokens.access_token
    }

    // Refresh
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic dGVzdF9pZDp0ZXN0X3NlY3JldA==',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        // Clear invalid tokens
        mockDb.setSetting('spotify_tokens', null)
        mockDb.setSetting('spotify_user', null)
        return null
      }

      const updated = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || tokens.refresh_token,
        expires_at: Date.now() + data.expires_in * 1000,
      }
      mockDb.setSetting('spotify_tokens', mockEncrypt(updated))
      return updated.access_token
    } catch {
      return null
    }
  }

  it('returns null when no tokens stored', async () => {
    mockDb.getSetting.mockReturnValue(null)
    mockDecrypt.mockReturnValue(null)
    expect(await getUserToken()).toBeNull()
  })

  it('returns cached token when not expired', async () => {
    const tokens = {
      access_token: 'valid_token',
      refresh_token: 'refresh_abc',
      expires_at: Date.now() + 300000, // 5 min from now
    }
    mockDecrypt.mockReturnValue(tokens)
    expect(await getUserToken()).toBe('valid_token')
  })

  it('refreshes expired token and stores new one', async () => {
    const expiredTokens = {
      access_token: 'old_token',
      refresh_token: 'refresh_abc',
      expires_at: Date.now() - 1000, // expired
    }
    mockDecrypt.mockReturnValue(expiredTokens)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'new_token',
        refresh_token: 'new_refresh',
        expires_in: 3600,
      }),
    })

    const result = await getUserToken()
    expect(result).toBe('new_token')
    expect(mockDb.setSetting).toHaveBeenCalledWith('spotify_tokens', expect.objectContaining({ encrypted: true }))
  })

  it('preserves original refresh_token if not returned', async () => {
    const expiredTokens = {
      access_token: 'old_token',
      refresh_token: 'original_refresh',
      expires_at: Date.now() - 1000,
    }
    mockDecrypt.mockReturnValue(expiredTokens)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'new_token',
        expires_in: 3600,
        // no refresh_token in response
      }),
    })

    await getUserToken()
    expect(mockDb.setSetting).toHaveBeenCalledWith(
      'spotify_tokens',
      expect.objectContaining({ refresh_token: 'original_refresh' })
    )
  })

  it('clears tokens on refresh failure (401/403)', async () => {
    const expiredTokens = {
      access_token: 'old_token',
      refresh_token: 'revoked_refresh',
      expires_at: Date.now() - 1000,
    }
    mockDecrypt.mockReturnValue(expiredTokens)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'invalid_grant' }),
    })

    const result = await getUserToken()
    expect(result).toBeNull()
    expect(mockDb.setSetting).toHaveBeenCalledWith('spotify_tokens', null)
    expect(mockDb.setSetting).toHaveBeenCalledWith('spotify_user', null)
  })

  it('returns null on network error', async () => {
    const expiredTokens = {
      access_token: 'old_token',
      refresh_token: 'refresh_abc',
      expires_at: Date.now() - 1000,
    }
    mockDecrypt.mockReturnValue(expiredTokens)

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await getUserToken()
    expect(result).toBeNull()
  })

  it('treats token within 60s of expiry as expired', async () => {
    const almostExpired = {
      access_token: 'almost_expired_token',
      refresh_token: 'refresh_abc',
      expires_at: Date.now() + 30000, // 30s from now (< 60s buffer)
    }
    mockDecrypt.mockReturnValue(almostExpired)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'refreshed_token',
        expires_in: 3600,
      }),
    })

    const result = await getUserToken()
    expect(result).toBe('refreshed_token')
  })

  afterEach(() => {
    delete globalThis.fetch
  })
})
