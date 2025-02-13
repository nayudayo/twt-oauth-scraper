import { generateExampleSolanaAddress } from '@/utils/solana'

export const ASCII_LOGO = `
 ███████████  ███████████ ███████████ 
░░███░░░░░███░█░░░███░░░█░░███░░░░░███
 ░███    ░███░   ░███  ░  ░███    ░███
 ░██████████     ░███     ░██████████ 
 ░███░░░░░░      ░███     ░███░░░░░███
 ░███            ░███     ░███    ░███
 █████           █████    ███████████ 
░░░░░           ░░░░░    ░░░░░░░░░░░  
`

export const SYSTEM_MESSAGES = {
  BOOT: `
${ASCII_LOGO}
TERMINAL INTERFACE v1.0.3
------------------------
INITIALIZING SYSTEM...
[OK] Memory check complete
[OK] System integrity verified
[OK] Network protocols active
[!!] Security clearance required

SECURITY PROTOCOL: Access verification needed.
Enter commands in sequence to proceed.
Type 'help' for available commands.
`,

  ACCESS_GRANTED: `
ACCESS GRANTED
-------------
Clearance Level: 3
Security Protocol: Active
Encryption: Enabled
Neural Interface: Connected

Initializing main interface...
Please stand by...
`,

  ERROR: {
    UNKNOWN_COMMAND: '[ERROR] Unknown command. Type "help" for available commands.',
    INVALID_INPUT: (command: string, expectedInput: string) => {
      if (command === 'SOL_WALLET') {
        const exampleAddress = generateExampleSolanaAddress()
        return `[ERROR] Invalid Solana wallet address. Please provide a valid base58-encoded address.\nExample: sol_wallet ${exampleAddress}`
      }
      if (command === 'SUBMIT_REFERRAL') {
        return `[ERROR] Invalid input. Please enter a valid referral code or type "NO" if you weren't referred.\nExample: submit_referral PUSH-USER-CODE1\nOr: submit_referral NO`
      }
      return `[ERROR] Invalid input. Expected format: ${expectedInput}`
    },
    SYSTEM_FAILURE: 'CRITICAL ERROR: System security compromised. Terminating session...'
  },

  COMMAND_RESPONSES: {
    HELP_HEADER: `
Available Commands:
------------------`,
    COMMAND_ACCEPTED: (description: string) => 
      `[SUCCESS] Command accepted: ${description}`,
    NEXT_COMMAND: (command: string) => 
      `\n[SYSTEM] Next required command: ${command}`,
    SEQUENCE_COMPLETE: `
[SUCCESS] All security protocols verified.
[SYSTEM] Neural interface synchronized.
[SYSTEM] Quantum encryption enabled.
[SYSTEM] Initializing main interface...`,
    REFERRAL_INFO: `
[SYSTEM] REFERRAL PROGRAM INFORMATION
-----------------------------------
Join our exclusive referral program to earn rewards and help grow our community!

Benefits:
- Earn points for each successful referral
- Unlock special privileges and rewards
- Climb the leaderboard for additional bonuses
- Early access to new features

Next steps:
1. First, submit the referral code of who invited you (or type "NO" if none)
2. Later, you'll generate your own referral code to invite others

Use "submit_referral" command followed by the code or NO.
Example: submit_referral PUSH-USER-CODE1
Or: submit_referral NO
`
  }
} 