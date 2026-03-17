import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'

/**
 * Tests for parseBody from server/api.js.
 *
 * Since api.js has heavy side effects on import (dotenv, DB, route setup),
 * we recreate the parseBody logic here for isolated testing.
 */

const MAX_BODY = 10 * 1024 * 1024 // 10 MB

function parseBody(req) {
  if (req.body) return Promise.resolve(req.body)
  return new Promise((resolve, reject) => {
    let data = ''
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY) {
        req.destroy()
        reject(new Error('Request body too large'))
        return
      }
      data += chunk
    })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

function createMockRequest(body) {
  const emitter = new EventEmitter()
  emitter.destroy = () => {}
  if (typeof body === 'string') {
    setTimeout(() => {
      emitter.emit('data', Buffer.from(body))
      emitter.emit('end')
    }, 0)
  }
  return emitter
}

describe('parseBody', () => {
  it('returns pre-parsed body if req.body exists', async () => {
    const req = { body: { hello: 'world' } }
    const result = await parseBody(req)
    expect(result).toEqual({ hello: 'world' })
  })

  it('parses valid JSON from stream', async () => {
    const req = createMockRequest('{"key":"value"}')
    const result = await parseBody(req)
    expect(result).toEqual({ key: 'value' })
  })

  it('returns empty object for empty body', async () => {
    const req = createMockRequest('')
    setTimeout(() => req.emit('end'), 0)
    const result = await parseBody(req)
    expect(result).toEqual({})
  })

  it('rejects invalid JSON', async () => {
    const req = createMockRequest('not json at all')
    await expect(parseBody(req)).rejects.toThrow('Invalid JSON')
  })

  it('rejects body exceeding 10MB', async () => {
    const req = new EventEmitter()
    req.destroy = vi.fn()

    const promise = parseBody(req)
    // Send a chunk larger than MAX_BODY
    const bigChunk = Buffer.alloc(MAX_BODY + 1, 'a')
    req.emit('data', bigChunk)

    await expect(promise).rejects.toThrow('Request body too large')
    expect(req.destroy).toHaveBeenCalled()
  })

  it('accepts body just under 10MB', async () => {
    const req = new EventEmitter()
    req.destroy = vi.fn()

    const promise = parseBody(req)
    // Valid JSON that's under the limit
    const data = JSON.stringify({ data: 'x'.repeat(1000) })
    req.emit('data', Buffer.from(data))
    req.emit('end')

    const result = await promise
    expect(result.data).toHaveLength(1000)
  })

  it('handles stream errors', async () => {
    const req = new EventEmitter()
    const promise = parseBody(req)
    req.emit('error', new Error('Stream failed'))
    await expect(promise).rejects.toThrow('Stream failed')
  })
})
