// Validate Solana address format (base58-encoded string of 32-44 characters)
export function isValidSolanaAddress(address: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
  return base58Regex.test(address)
}

// Generate a random Solana-like address for examples
export function generateExampleSolanaAddress(): string {
  const charset = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const length = Math.floor(Math.random() * (44 - 32 + 1)) + 32 // Random length between 32-44
  let result = ''
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return result
}

// Extract Solana address from command input
export function extractSolanaAddress(input: string): string | null {
  const parts = input.trim().split(/\s+/)
  return parts.length === 2 ? parts[1] : null
} 