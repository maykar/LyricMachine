import { describe, it, expect, vi } from 'vitest'
import { generateApiKey } from '../../server/ugApi.js'

describe('ugApi', () => {
  it('generates the correct MD5 API key', () => {
    // Known test case:
    // Device ID: "1234567890abcdef"
    // Date: 2026-04-20 18:00 UTC (hour 18)
    // Payload: "1234567890abcdef2026-04-20:18createLog()"
    // MD5 of that payload should be generated consistently
    const mockDate = new Date(Date.UTC(2026, 3, 20, 18, 5, 0)) // Note: month is 0-indexed in Date.UTC (3 = April)
    
    const deviceId = '1234567890abcdef'
    const apiKey = generateApiKey(deviceId, mockDate)
    
    // We can pre-calculate the md5 in node:
    // crypto.createHash('md5').update('1234567890abcdef2026-04-20:18createLog()').digest('hex')
    // = "55db593e193084630fa835b57f4663f1"
    
    expect(apiKey).toBe('55db593e193084630fa835b57f4663f1')
  })
})
