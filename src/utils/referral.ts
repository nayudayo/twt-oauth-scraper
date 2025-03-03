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
  
  // Updated regex to match new format with optional random suffix
  const referralRegex = /^PUSH-[A-Z0-9]{3,6}-[A-Z0-9]{3,9}$/
  return referralRegex.test(upperCode)
}

// Generate a referral code from username and wallet
export function generateReferralCode(username: string, wallet: string, attempt = 0): string {
  const cleanUsername = username.replace(/[^A-Za-z0-9]/g, '') // Remove special characters
  const userPart = cleanUsername.slice(0, 4).toUpperCase() // Take first 4 chars
  
  // Different strategies based on attempt number
  let walletPart: string;
  switch (attempt) {
    case 0:
      // First try: First 4 chars
      walletPart = wallet.slice(0, 4).toUpperCase();
      break;
    case 1:
      // Second try: Last 4 chars
      walletPart = wallet.slice(-4).toUpperCase();
      break;
    case 2:
      // Third try: Middle 4 chars
      const mid = Math.floor(wallet.length / 2);
      walletPart = wallet.slice(mid - 2, mid + 2).toUpperCase();
      break;
    case 3:
      // Fourth try: First 2 + Last 2
      walletPart = (wallet.slice(0, 2) + wallet.slice(-2)).toUpperCase();
      break;
    default:
      // Final tries: Random 4 chars from wallet
      const chars = wallet.replace(/[^A-Za-z0-9]/g, '').split('');
      const randomChars = Array.from({ length: 4 }, () => {
        const randomIndex = Math.floor(Math.random() * chars.length);
        return chars[randomIndex];
      });
      walletPart = randomChars.join('').toUpperCase();
  }
  
  return `PUSH-${userPart}-${walletPart}`;
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