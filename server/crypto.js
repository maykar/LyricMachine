/**
 * AES-256-GCM encryption for sensitive data (Spotify tokens).
 *
 * Key is read from ENCRYPTION_KEY env var. If missing, a random key is
 * generated and appended to .env on first use.
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

let _key = null

/** Get or generate the encryption key (32 bytes for AES-256) */
function getKey() {
  if (_key) return _key

  if (process.env.ENCRYPTION_KEY) {
    _key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
    if (_key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
    }
    return _key
  }

  // Auto-generate and persist to .env
  _key = randomBytes(32)
  const hex = _key.toString('hex')

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const envPath = join(__dirname, '..', '.env')

  // Guard against duplicate entries from repeated restarts
  if (existsSync(envPath)) {
    const existing = readFileSync(envPath, 'utf8')
    if (!existing.includes('ENCRYPTION_KEY=')) {
      appendFileSync(envPath, `\n# Auto-generated encryption key for Spotify token storage\nENCRYPTION_KEY=${hex}\n`)
    }
  } else {
    appendFileSync(envPath, `# Auto-generated encryption key for Spotify token storage\nENCRYPTION_KEY=${hex}\n`)
  }

  // Also set in current process
  process.env.ENCRYPTION_KEY = hex
  console.log('Generated new encryption key and saved to .env')

  return _key
}

/**
 * Encrypt an object → base64 string containing iv + tag + ciphertext.
 * Returns the encrypted string, or the original value if null/undefined.
 */
export function encrypt(obj) {
  if (obj == null) return null

  const key = getKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)

  const plaintext = JSON.stringify(obj)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // Pack iv + tag + ciphertext into a single base64 string
  const packed = Buffer.concat([iv, tag, encrypted])
  return packed.toString('base64')
}

/**
 * Decrypt a base64 string → original object.
 * Returns null if decryption fails (invalid key, corrupted data, or plain-text legacy data).
 */
export function decrypt(ciphertext) {
  if (ciphertext == null) return null

  // Handle legacy plain-text JSON (migration: old tokens stored as objects)
  if (typeof ciphertext === 'object') return ciphertext

  try {
    const key = getKey()
    const packed = Buffer.from(ciphertext, 'base64')

    if (packed.length < IV_LEN + TAG_LEN) return null

    const iv = packed.subarray(0, IV_LEN)
    const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const encrypted = packed.subarray(IV_LEN + TAG_LEN)

    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return JSON.parse(decrypted.toString('utf8'))
  } catch {
    // Decryption failed — could be legacy plain-text or corrupted data
    // Try parsing as plain JSON (legacy migration)
    if (typeof ciphertext === 'string') {
      try { return JSON.parse(ciphertext) } catch { /* not JSON either */ }
    }
    return null
  }
}
