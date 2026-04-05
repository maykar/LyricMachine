import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for utils.js — spotifyFetch and pickAlbumArt.
 *
 * spotifyFetch depends on getUserToken() from spotifyAuth.js,
 * so we mock the module to isolate the retry logic.
 */

// Mock spotifyAuth before importing utils
vi.mock('../../server/spotifyAuth.js', () => ({
  getUserToken: vi.fn(() => 'mock-token'),
  forceRefreshToken: vi.fn(() => 'refreshed-token'),
}))

const { spotifyFetch, pickAlbumArt } = await import('../../server/utils.js')

describe('pickAlbumArt', () => {
  it('returns null for empty/null images', () => {
    expect(pickAlbumArt(null)).toBeNull()
    expect(pickAlbumArt([])).toBeNull()
    expect(pickAlbumArt(undefined)).toBeNull()
  })

  it('returns the single image when only one exists', () => {
    expect(pickAlbumArt([{ url: 'http://img/big.jpg' }])).toBe('http://img/big.jpg')
  })

  it('prefers index 1 (medium) over index 0 (large)', () => {
    const images = [
      { url: 'http://img/large.jpg' },
      { url: 'http://img/medium.jpg' },
      { url: 'http://img/small.jpg' },
    ]
    expect(pickAlbumArt(images)).toBe('http://img/medium.jpg')
  })
})

describe('spotifyFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('returns response on success', async () => {
    const mockRes = { ok: true, status: 200, json: () => ({ data: 'ok' }) }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockRes)

    const res = await spotifyFetch('https://api.spotify.com/test')
    expect(res).toBe(mockRes)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('includes Authorization header', async () => {
    const mockRes = { ok: true, status: 200 }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockRes)

    await spotifyFetch('https://api.spotify.com/test')
    const [, opts] = fetch.mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer mock-token')
  })

  it('retries on 429 and succeeds', async () => {
    const headers429 = { get: () => '0' } // 0s retry to speed up test
    const response429 = { status: 429, headers: headers429 }
    const responseOk = { ok: true, status: 200 }

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response429)
      .mockResolvedValueOnce(responseOk)

    const res = await spotifyFetch('https://api.spotify.com/test', {}, { maxRetries: 3 })
    expect(res).toBe(responseOk)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws when all retries exhausted', async () => {
    const headers429 = { get: () => '0' }
    const response429 = { status: 429, headers: headers429 }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response429)

    await expect(
      spotifyFetch('https://api.spotify.com/test', {}, { maxRetries: 1 })
    ).rejects.toThrow('Spotify rate limit')
  })

  it('throws when no token available', async () => {
    const { getUserToken } = await import('../../server/spotifyAuth.js')
    getUserToken.mockReturnValueOnce(null)

    await expect(
      spotifyFetch('https://api.spotify.com/test')
    ).rejects.toThrow('Spotify not connected')
  })

  it('retries once on 401 and succeeds with refreshed token', async () => {
    const { forceRefreshToken } = await import('../../server/spotifyAuth.js')
    const response401 = { status: 401 }
    const responseOk = { ok: true, status: 200 }

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response401)
      .mockResolvedValueOnce(responseOk)

    const res = await spotifyFetch('https://api.spotify.com/test')
    expect(res).toBe(responseOk)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(forceRefreshToken).toHaveBeenCalledOnce()
    // Second call uses the refreshed token
    const [, secondOpts] = fetch.mock.calls[1]
    expect(secondOpts.headers.Authorization).toBe('Bearer refreshed-token')
  })

  it('does not retry a second 401 (returns response, no infinite loop)', async () => {
    const { forceRefreshToken } = await import('../../server/spotifyAuth.js')
    const response401 = { status: 401 }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response401)

    // Second 401 is returned as-is (caller decides how to handle it)
    const res = await spotifyFetch('https://api.spotify.com/test', {}, { maxRetries: 3 })
    expect(res).toBe(response401)
    // fetch called twice: once before refresh, once after
    expect(fetch).toHaveBeenCalledTimes(2)
    // forceRefreshToken called exactly once — no retry loop
    expect(forceRefreshToken).toHaveBeenCalledOnce()
  })
})
