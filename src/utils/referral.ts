// Normalize referral code format
export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase()
}

// Validate referral code format: PUSH-XXXX-YYYY where XXXX is username and YYYY is wallet
export function isValidReferralCode(code: string): boolean {
  // Special case for "NO"
  if (code.toUpperCase() === 'NO') return true
  
  // Convert to uppercase before validation
  const upperCode = normalizeReferralCode(code)
  
  // Allow more flexible format with 3-6 chars for each part
  const referralRegex = /^PUSH-[A-Z0-9]{3,6}-[A-Z0-9]{3,6}$/
  return referralRegex.test(upperCode)
}

// Generate a referral code from username and wallet
export function generateReferralCode(username: string, wallet: string): string {
  const cleanUsername = username.replace(/[^A-Za-z0-9]/g, '') // Remove special characters
  const userPart = cleanUsername.slice(0, 4).toUpperCase() // Take first 4 chars
  const walletPart = wallet.slice(0, 4).toUpperCase() // Take first 4 chars of wallet
  return `PUSH-${userPart}-${walletPart}`
}

// Extract referral response from command input
export function extractReferralResponse(input: string): string | null {
  const parts = input.trim().split(/\s+/)
  if (parts.length !== 2) return null
  
  const code = parts[1].trim().toUpperCase()
  
  // Special case for "NO"
  if (code === 'NO') return code
  
  // For regular referral codes
  const normalizedCode = normalizeReferralCode(code)
  return isValidReferralCode(normalizedCode) ? normalizedCode : null
}

// Generate example referral code for error messages
export function generateExampleReferralCode(): string {
  return 'PUSH-USER-CODE1'
} 