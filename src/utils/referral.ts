// Validate referral code format: PUSH-XXXX-YYYY where XXXX is username and YYYY is wallet
export function isValidReferralCode(code: string): boolean {
  // Convert to uppercase before validation
  const upperCode = code.toUpperCase()
  // Only allow uppercase letters and numbers in the parts after PUSH-
  const referralRegex = /^PUSH-[A-Z0-9]{4}-[1-9A-HJ-NP-Z]{4}$/
  return upperCode === 'NO' || referralRegex.test(upperCode)
}

// Generate a referral code from username and wallet
export function generateReferralCode(username: string, wallet: string): string {
  const cleanUsername = username.replace(/[^A-Za-z0-9]/g, '') // Remove special characters
  const userPart = cleanUsername.slice(0, 4).toUpperCase() // Take first 4 chars
  const walletPart = wallet.slice(0, 4).toUpperCase() // Take first 4 chars of wallet and convert to uppercase
  return `PUSH-${userPart}-${walletPart}`
}

// Extract referral response from command input and convert to uppercase
export function extractReferralResponse(input: string): string | null {
  const parts = input.trim().split(/\s+/)
  return parts.length === 2 ? parts[1].toUpperCase() : null
}

// Generate example referral code for error messages
export function generateExampleReferralCode(): string {
  return 'PUSH-USER-CODE1'
} 