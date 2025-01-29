import { SYSTEM_MESSAGES } from './messages'

export interface Command {
  command: string
  description: string
  expectedInput: string
  validation: (input: string) => boolean
}

export const REQUIRED_COMMANDS: Command[] = [
  {
    command: 'INIT_SEQUENCE',
    description: 'Initialize system sequence',
    expectedInput: 'INIT',
    validation: (input: string) => input.trim().toUpperCase() === 'INIT'
  },
  {
    command: 'VERIFY_CLEARANCE',
    description: 'Verify security clearance level',
    expectedInput: 'LEVEL_3',
    validation: (input: string) => input.trim().toUpperCase() === 'LEVEL_3'
  },
  {
    command: 'ENABLE_SUBSYSTEMS',
    description: 'Enable all required subsystems',
    expectedInput: 'ENABLE_ALL',
    validation: (input: string) => input.trim().toUpperCase() === 'ENABLE_ALL'
  },
  {
    command: 'CONFIRM_PROTOCOL',
    description: 'Confirm adherence to system protocols',
    expectedInput: 'ACKNOWLEDGED',
    validation: (input: string) => input.trim().toUpperCase() === 'ACKNOWLEDGED'
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