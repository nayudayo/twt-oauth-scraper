import { SYSTEM_MESSAGES } from './messages'
import { isValidSolanaAddress, generateExampleSolanaAddress, extractSolanaAddress } from '@/utils/solana'
import { isValidReferralCode, generateExampleReferralCode, extractReferralResponse } from '@/utils/referral'

export interface Command {
  command: string
  description: string
  expectedInput: string
  validation: (input: string) => boolean
}

export const REQUIRED_COMMANDS: Command[] = [
  {
    command: 'JOIN_TELEGRAM',
    description: 'Join the official Telegram group',
    expectedInput: 'join_telegram',
    validation: (input: string) => input.trim().toLowerCase() === 'join_telegram'
  },
  {
    command: 'SOL_WALLET <add wallet address>',
    description: 'Connect or update your Solana wallet',
    expectedInput: `sol_wallet ${generateExampleSolanaAddress()}`,
    validation: (input: string) => {
      const address = extractSolanaAddress(input)
      return address !== null && isValidSolanaAddress(address)
    }
  },
  {
    command: 'REFER',
    description: 'Get information about the referral program',
    expectedInput: 'refer',
    validation: (input: string) => input.trim().toLowerCase() === 'refer'
  },
  {
    command: 'SUBMIT_REFERRAL',
    description: 'Submit a referral code or type "submit_referral no" if you don\'t have one',
    expectedInput: `submit_referral ${generateExampleReferralCode()}`,
    validation: (input: string) => {
      const response = extractReferralResponse(input)
      return response !== null && isValidReferralCode(response)
    }
  },
  {
    command: 'SHARE',
    description: 'Share your referral link on social media',
    expectedInput: 'share',
    validation: (input: string) => input.trim().toLowerCase() === 'share'
  },
  {
    command: 'CLOSE',
    description: 'Close the terminal and complete the funnel',
    expectedInput: 'CLOSE',
    validation: (input: string) => input.trim().toUpperCase() === 'CLOSE'
  }
]

export const WELCOME_MESSAGE = `
NEXUS-7 TERMINAL INTERFACE v1.0.3
--------------------------------
SECURITY PROTOCOL: Clearance verification required.
Enter commands in sequence to proceed.
Type 'help' for command list.
`

export const HELP_MESSAGE = `${SYSTEM_MESSAGES.COMMAND_RESPONSES.HELP_HEADER}
help            : Display this help message
clear           : Clear terminal screen
${REQUIRED_COMMANDS.map(cmd => `${cmd.command.toLowerCase()}     : ${cmd.description}`).join('\n')}
`