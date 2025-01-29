export const ASCII_LOGO = `
███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗    ███████╗
████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝    ╚════██║
██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗        ██╔╝
██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║       ██╔╝ 
██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║       ██║  
╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝       ╚═╝  
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
    UNKNOWN_COMMAND: 'ERROR: Unknown command sequence. Type "help" for command list.',
    INVALID_INPUT: (command: string, expected: string) => 
      `ERROR: Invalid input for ${command}. Expected: ${expected}`,
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
[SYSTEM] Initializing main interface...`
  }
} 