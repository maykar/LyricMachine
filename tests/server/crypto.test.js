// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We test encrypt/decrypt by setting ENCRYPTION_KEY in env before importing
const TEST_KEY = 'a'.repeat(64) // 32 bytes of 0xaa

describe('crypto', () => {
  let encrypt, decrypt

  beforeEach(async () => {
    // Set env before each import to avoid auto-generation
    process.env.ENCRYPTION_KEY = TEST_KEY
    // Dynamic import to get fresh module with env set
    const mod = await import('../../server/crypto.js')
    encrypt = mod.encrypt
    decrypt = mod.decrypt
  })

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY
    // Clear module cache for fresh imports
    vi.resetModules()
  })

  describe('round-trip', () => {
    it('encrypts and decrypts an object', () => {
      const original = { access_token: 'abc123', refresh_token: 'def456', expires_at: 1234567890 }
      const encrypted = encrypt(original)

      // Encrypted value should be a base64 string, not the original object
      expect(typeof encrypted).toBe('string')
      expect(encrypted).not.toContain('abc123')

      const decrypted = decrypt(encrypted)
      expect(decrypted).toEqual(original)
    })

    it('produces different ciphertext each time (random IV)', () => {
      const obj = { token: 'test' }
      const a = encrypt(obj)
      const b = encrypt(obj)
      expect(a).not.toBe(b) // Different IVs → different output
    })

    it('handles null values', () => {
      expect(encrypt(null)).toBeNull()
      expect(decrypt(null)).toBeNull()
      expect(encrypt(undefined)).toBeNull()
      expect(decrypt(undefined)).toBeNull()
    })
  })

  describe('legacy migration', () => {
    it('passes through a plain object (legacy unencrypted tokens)', () => {
      const legacy = { access_token: 'old_token', refresh_token: 'old_refresh', expires_at: 999 }
      // Legacy data stored as an object by db.getSetting (already parsed from JSON)
      const result = decrypt(legacy)
      expect(result).toEqual(legacy)
    })
  })

  describe('error handling', () => {
    it('returns null for corrupted data', () => {
      const result = decrypt('not-valid-base64-data!!!')
      expect(result).toBeNull()
    })

    it('returns null for truncated ciphertext', () => {
      const encrypted = encrypt({ token: 'test' })
      // Truncate to less than IV + tag length
      const truncated = encrypted.slice(0, 10)
      const result = decrypt(truncated)
      expect(result).toBeNull()
    })

    it('returns null for data encrypted with a different key', () => {
      const encrypted = encrypt({ token: 'secret' })

      // Change the key
      process.env.ENCRYPTION_KEY = 'b'.repeat(64)
      // Reset the cached key by reimporting
      vi.resetModules()

      // Re-import with different key — but decrypt from this module instance has old key cached
      // So test with a fresh import
      return import('../../server/crypto.js').then(mod2 => {
        const result = mod2.decrypt(encrypted)
        expect(result).toBeNull()
      })
    })
  })
})
