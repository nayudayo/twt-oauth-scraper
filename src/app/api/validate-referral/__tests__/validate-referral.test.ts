import { POST } from '../route'
import { initDB, validateReferralCode, trackReferralUse } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { Database } from 'sqlite'
import { Session } from 'next-auth'

// Mock next-auth
jest.mock('next-auth')
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn().mockImplementation((body, init) => ({
      status: init?.status || 200,
      json: async () => body
    }))
  }
}))

// Mock database functions
jest.mock('@/lib/db', () => ({
  initDB: jest.fn(),
  validateReferralCode: jest.fn(),
  trackReferralUse: jest.fn()
}))

interface MockDatabase extends Partial<Database> {
  run: jest.Mock;
  get: jest.Mock;
  exec: jest.Mock;
}

describe('Validate Referral API', () => {
  let mockDb: MockDatabase

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock authenticated session
    mockGetServerSession.mockResolvedValue({
      user: { name: 'testuser' }
    } as Session)

    // Setup mock database
    mockDb = {
      run: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      exec: jest.fn()
    }
    ;(initDB as jest.Mock).mockResolvedValue(mockDb)
    ;(validateReferralCode as jest.Mock).mockResolvedValue(true)
  })

  it('should validate and track a valid referral code', async () => {
    const userId = 'existing_user_id'
    const referralCode = 'PUSH-TEST-1234'

    // Mock database responses
    mockDb.get
      // First call - check if user exists
      .mockResolvedValueOnce({ id: userId })
      // Second call - referral code details
      .mockResolvedValueOnce({
        code: referralCode,
        owner_user_id: 'referrer_id',
        owner_username: 'referrer'
      })
      // Third call - check existing usage (no previous usage)
      .mockResolvedValueOnce(null)

    ;(validateReferralCode as jest.Mock).mockResolvedValueOnce(true)
    ;(trackReferralUse as jest.Mock).mockImplementation(async (db, code, usedByUserId) => {
      await db.run('UPDATE referral_codes SET usage_count = usage_count + 1 WHERE code = ?', code)
      await db.run('INSERT INTO referral_usage_log (referral_code, used_by_user_id) VALUES (?, ?)', code, usedByUserId)
      await db.run('INSERT INTO referral_tracking (referral_code, referrer_user_id, referred_user_id) VALUES (?, ?, ?)', 
        code, 'referrer_id', usedByUserId)
      return true
    })

    const request = new Request('http://localhost/api/validate-referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'testuser', referralCode })
    })

    const response = await POST(request)
    const data = await response.json()

    // Verify response
    expect(response.status).toBe(200)
    expect(data).toEqual({ success: true })

    // Verify database operations
    expect(mockDb.run).toHaveBeenCalledWith('BEGIN TRANSACTION')
    expect(mockDb.run).toHaveBeenCalledWith(
      'UPDATE referral_codes SET usage_count = usage_count + 1 WHERE code = ?',
      referralCode
    )
    expect(mockDb.run).toHaveBeenCalledWith(
      'INSERT INTO referral_usage_log (referral_code, used_by_user_id) VALUES (?, ?)',
      referralCode,
      userId
    )
    expect(mockDb.run).toHaveBeenCalledWith(
      'INSERT INTO referral_tracking (referral_code, referrer_user_id, referred_user_id) VALUES (?, ?, ?)',
      referralCode,
      'referrer_id',
      userId
    )
    expect(mockDb.run).toHaveBeenCalledWith('COMMIT')
  })

  it('should create new user if not exists and track referral', async () => {
    const referralCode = 'PUSH-TEST-1234'

    // Mock database responses
    mockDb.get
      // First call - check if user exists (not found)
      .mockResolvedValueOnce(null)
      // Second call - referral code details
      .mockResolvedValueOnce({
        code: referralCode,
        owner_user_id: 'referrer_id',
        owner_username: 'referrer'
      })
      // Third call - check existing usage
      .mockResolvedValueOnce(null)

    ;(validateReferralCode as jest.Mock).mockResolvedValueOnce(true)
    ;(trackReferralUse as jest.Mock).mockImplementation(async (db, code, usedByUserId) => {
      await db.run('UPDATE referral_codes SET usage_count = usage_count + 1 WHERE code = ?', code)
      await db.run('INSERT INTO referral_usage_log (referral_code, used_by_user_id) VALUES (?, ?)', code, usedByUserId)
      await db.run('INSERT INTO referral_tracking (referral_code, referrer_user_id, referred_user_id) VALUES (?, ?, ?)', 
        code, 'referrer_id', usedByUserId)
      return true
    })

    const request = new Request('http://localhost/api/validate-referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'testuser', referralCode })
    })

    const response = await POST(request)
    const data = await response.json()

    // Verify response
    expect(response.status).toBe(200)
    expect(data).toEqual({ success: true })

    // Verify user creation and tracking
    const userIdCall = mockDb.run.mock.calls.find(call => 
      call[0].includes('INSERT INTO users')
    )
    expect(userIdCall).toBeTruthy()
    const newUserId = userIdCall[1]

    expect(mockDb.run).toHaveBeenCalledWith(
      'UPDATE referral_codes SET usage_count = usage_count + 1 WHERE code = ?',
      referralCode
    )
    expect(mockDb.run).toHaveBeenCalledWith(
      'INSERT INTO referral_usage_log (referral_code, used_by_user_id) VALUES (?, ?)',
      referralCode,
      newUserId
    )
  })

  it('should accept "NO" as valid referral code', async () => {
    const request = new Request('http://localhost/api/validate-referral', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 'testuser',
        referralCode: 'NO'
      })
    })

    const response = await POST(request)
    const data = await response.json()

    // Verify response
    expect(response.status).toBe(200)
    expect(data).toEqual({ success: true })

    // Verify no database operations were performed
    expect(mockDb.run).not.toHaveBeenCalled()
  })

  it('should reject invalid referral code format', async () => {
    const request = new Request('http://localhost/api/validate-referral', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 'testuser',
        referralCode: 'INVALID-CODE'
      })
    })

    const response = await POST(request)
    const data = await response.json()

    // Verify response
    expect(response.status).toBe(400)
    expect(data).toEqual({
      error: 'Invalid referral code format',
      details: 'Code must be in format PUSH-XXXX-YYYY or NO'
    })

    // Verify no database operations were performed
    expect(mockDb.run).not.toHaveBeenCalled()
  })

  it('should prevent duplicate referral code usage', async () => {
    // Mock database responses
    mockDb.get
      // First call - check if user exists
      .mockResolvedValueOnce({ id: 'existing_user_id' })
      // Second call - referral code details
      .mockResolvedValueOnce({
        code: 'PUSH-TEST-1234',
        owner_user_id: 'referrer_id',
        owner_username: 'referrer'
      })
      // Third call - check existing usage (already used)
      .mockResolvedValueOnce({
        referral_code: 'PUSH-OTHER-CODE',
        used_at: new Date().toISOString()
      })

    ;(validateReferralCode as jest.Mock).mockResolvedValueOnce(true)
    ;(trackReferralUse as jest.Mock).mockImplementation(async () => {
      throw new Error('User has already used a referral code')
    })

    const request = new Request('http://localhost/api/validate-referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'testuser',
        referralCode: 'PUSH-TEST-1234'
      })
    })

    const response = await POST(request)
    const data = await response.json()

    // Verify response
    expect(response.status).toBe(500)
    expect(data).toEqual({
      error: 'Internal server error',
      details: 'User has already used a referral code'
    })

    // Verify transaction was rolled back
    expect(mockDb.run).toHaveBeenCalledWith('ROLLBACK')
  })

  it('should handle database errors gracefully', async () => {
    // Mock database error
    mockDb.get.mockRejectedValueOnce(new Error('Database connection failed'))

    const request = new Request('http://localhost/api/validate-referral', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 'testuser',
        referralCode: 'PUSH-TEST-1234'
      })
    })

    const response = await POST(request)
    const data = await response.json()

    // Verify response
    expect(response.status).toBe(500)
    expect(data).toEqual({
      error: 'Internal server error',
      details: 'Database connection failed'
    })

    // Verify transaction was rolled back
    expect(mockDb.run).toHaveBeenCalledWith('ROLLBACK')
  })
}) 