import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TerminalModal } from '../TerminalModal'
import { useSession } from 'next-auth/react'
import { REQUIRED_COMMANDS } from '@/constants/commands'
import { SYSTEM_MESSAGES } from '@/constants/messages'

// Mock next-auth
jest.mock('next-auth/react')

describe('TerminalModal', () => {
  const mockSession = {
    user: { name: 'testuser' },
    expires: new Date(Date.now() + 2 * 86400).toISOString(),
  }

  const mockOnComplete = jest.fn()

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()
    // Mock session for each test
    ;(useSession as jest.Mock).mockReturnValue({
      data: mockSession,
      status: 'authenticated'
    })
    // Reset fetch mock
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('renders initial boot message', () => {
    render(<TerminalModal onComplete={mockOnComplete} />)
    // Look for a unique part of the boot message instead of the whole thing
    expect(screen.getByText(/TERMINAL INTERFACE/)).toBeInTheDocument()
    expect(screen.getByText(/INITIALIZING SYSTEM/)).toBeInTheDocument()
  })

  it('shows help message when help command is entered', async () => {
    render(<TerminalModal onComplete={mockOnComplete} />)
    
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'help{enter}')
    
    const helpMessages = screen.getAllByText(/Available Commands/i)
    expect(helpMessages.length).toBeGreaterThan(0)
  })

  it('clears terminal when clear command is entered', async () => {
    render(<TerminalModal onComplete={mockOnComplete} />)
    
    // Get initial number of pre elements (boot message)
    const initialPres = document.querySelectorAll('pre').length
    
    // Add help content
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'help{enter}')
    
    // Verify help adds more pre elements
    await waitFor(() => {
      const afterHelpPres = document.querySelectorAll('pre').length
      expect(afterHelpPres).toBeGreaterThan(initialPres)
    })
    
    // Clear the terminal
    await userEvent.type(input, 'clear{enter}')
    
    // Verify we're back to initial number of pre elements
    await waitFor(() => {
      const afterClearPres = document.querySelectorAll('pre').length
      expect(afterClearPres).toBe(initialPres)
    })
  })

  it('shows error for invalid command', async () => {
    render(<TerminalModal onComplete={mockOnComplete} />)
    
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'invalid_command{enter}')
    
    // Look for the specific error message
    await waitFor(() => {
      const errorMessages = screen.getAllByText(/ERROR:|Invalid/i)
      expect(errorMessages.some(el => el.textContent?.includes('Invalid input'))).toBe(true)
    })
  })

  it('processes valid command and shows success message', async () => {
    // Mock successful API response
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })
    )

    render(<TerminalModal onComplete={mockOnComplete} />)
    
    const input = screen.getByRole('textbox')
    const firstCommand = REQUIRED_COMMANDS[0]
    await userEvent.type(input, `${firstCommand.expectedInput}{enter}`)
    
    // Updated to match new success message format
    await waitFor(() => {
      expect(screen.getByText(`[SUCCESS] Command accepted: ${firstCommand.description}`)).toBeInTheDocument()
    })
  })

  it('shows next command after successful command', async () => {
    // Mock successful API response
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })
    )

    render(<TerminalModal onComplete={mockOnComplete} />)
    
    const firstCommand = REQUIRED_COMMANDS[0]
    const secondCommand = REQUIRED_COMMANDS[1]
    const input = screen.getByRole('textbox')
    await userEvent.type(input, `${firstCommand.expectedInput}{enter}`)
    
    expect(screen.getByText(new RegExp(secondCommand.command))).toBeInTheDocument()
  })

  it('completes sequence and calls onComplete after all commands', async () => {
    // Mock successful API responses
    REQUIRED_COMMANDS.forEach(() => {
      ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      )
    })

    render(<TerminalModal onComplete={mockOnComplete} />)
    
    // Complete all commands
    const input = screen.getByRole('textbox')
    const commandInputs = [
      'join_telegram',
      'verify_telegram',
      'sol_wallet F7AniHYnsdX6uGnntoSGfUmouZg4fnWp5ea',
      'refer',
      'submit_referral NO',
      'generate_referral',
      'share'
    ]

    for (let i = 0; i < commandInputs.length; i++) {
      await userEvent.type(input, `${commandInputs[i]}{enter}`)
      
      // Check for next command message except for the last command
      if (i < commandInputs.length - 1) {
        const nextCommand = REQUIRED_COMMANDS[i + 1]
        await waitFor(() => {
          expect(screen.getByText(`[SYSTEM] Next required command: ${nextCommand.command}`)).toBeInTheDocument()
        }, { timeout: 10000 })
      }
    }

    // Look for completion indicators
    await waitFor(() => {
      expect(screen.getByText(/\[SUCCESS\] All security protocols verified/)).toBeInTheDocument()
      expect(screen.getByText(/\[SYSTEM\] Neural interface synchronized/)).toBeInTheDocument()
      expect(screen.getByText(/\[SYSTEM\] Quantum encryption enabled/)).toBeInTheDocument()
      expect(screen.getByText(/\[SYSTEM\] Initializing main interface/)).toBeInTheDocument()
    }, { timeout: 10000 })

    // Wait for onComplete to be called
    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalled()
    }, { timeout: 10000 })
  }, 30000)

  it('loads and restores previous progress', async () => {
    const firstCommand = REQUIRED_COMMANDS[0]
    const secondCommand = REQUIRED_COMMANDS[1]

    // Mock API response for existing progress
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          progress: {
            current_command_index: 1,
            completed_commands: [firstCommand.command],
            command_responses: {
              [firstCommand.command]: firstCommand.expectedInput
            }
          }
        })
      })
    )

    render(<TerminalModal onComplete={mockOnComplete} />)
    
    // Wait for the first command's success indicators
    await waitFor(() => {
      // Check for command input
      const commandInput = screen.getByText(`> ${firstCommand.expectedInput}`)
      expect(commandInput).toBeInTheDocument()
      
      // Check for success message
      const successMessage = screen.getByText(/It works!/i)
      expect(successMessage).toBeInTheDocument()
      
      // Check for command description
      const commandDesc = screen.getByText(new RegExp(firstCommand.description, 'i'))
      expect(commandDesc).toBeInTheDocument()
    })

    // Type the second command to verify it's ready for input
    const input = screen.getByRole('textbox')
    await userEvent.type(input, `${secondCommand.expectedInput}`)
    
    // Verify the input is accepted (no error message)
    await waitFor(() => {
      const errorMessages = screen.queryAllByText(/ERROR:|Invalid/i)
      expect(errorMessages.length).toBe(0)
    })
  })

  it('skips to main content if funnel is already completed', async () => {
    // Mock API response for completed funnel
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          completion: {
            completed_at: new Date().toISOString(),
            completion_data: {}
          }
        })
      })
    )

    render(<TerminalModal onComplete={mockOnComplete} />)
    
    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalled()
    })
  })

  it('handles API error when loading progress', async () => {
    // Mock API error response
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('API Error'))
    )

    render(<TerminalModal onComplete={mockOnComplete} />)
    
    // Should still render and not crash
    expect(screen.getByText(/TERMINAL INTERFACE/)).toBeInTheDocument()
  })

  it('handles API error when saving progress', async () => {
    // Mock first API call success (load progress)
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ progress: null, completion: null })
      })
    )
    
    // Mock second API call failure (save progress)
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('API Error'))
    )

    render(<TerminalModal onComplete={mockOnComplete} />)
    
    const input = screen.getByRole('textbox')
    await userEvent.type(input, `${REQUIRED_COMMANDS[0].expectedInput}{enter}`)
    
    // Updated to check for command acceptance despite API error
    await waitFor(() => {
      expect(screen.getByText(`[SUCCESS] Command accepted: ${REQUIRED_COMMANDS[0].description}`)).toBeInTheDocument()
    })
  })

  it('handles API error when marking funnel completion', async () => {
    // Mock successful progress load
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ progress: null, completion: null })
      })
    )
    
    // Mock successful progress saves
    REQUIRED_COMMANDS.forEach(() => {
      ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      )
    })
    
    // Mock funnel completion API error
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('API Error'))
    )

    render(<TerminalModal onComplete={mockOnComplete} />)
    
    // Complete all commands
    const input = screen.getByRole('textbox')
    const commandInputs = [
      'join_telegram',
      'verify_telegram',
      'sol_wallet F7AniHYnsdX6uGnntoSGfUmouZg4fnWp5ea',
      'refer',
      'submit_referral NO',
      'generate_referral',
      'share'
    ]

    for (let i = 0; i < commandInputs.length; i++) {
      await userEvent.type(input, `${commandInputs[i]}{enter}`)
      
      // Check for next command message except for the last command
      if (i < commandInputs.length - 1) {
        const nextCommand = REQUIRED_COMMANDS[i + 1]
        await waitFor(() => {
          expect(screen.getByText(`[SYSTEM] Next required command: ${nextCommand.command}`)).toBeInTheDocument()
        }, { timeout: 10000 })
      }
    }
    
    // Should still complete despite API error
    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalled()
    }, { timeout: 10000 })
  }, 30000)

  it('handles empty session', () => {
    // Mock empty session
    ;(useSession as jest.Mock).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })

    render(<TerminalModal onComplete={mockOnComplete} />)
    
    // Should still render boot message
    expect(screen.getByText(/TERMINAL INTERFACE/)).toBeInTheDocument()
  })

  it('handles command with partial match', async () => {
    render(<TerminalModal onComplete={mockOnComplete} />)
    
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'sol_wallet 123{enter}')
    
    // Updated error message check
    await waitFor(() => {
      expect(screen.getByText(/Invalid input\. Expected format: join_telegram/)).toBeInTheDocument()
    }, { timeout: 10000 })
  }, 15000)

  it('maintains command history after clear', async () => {
    // Mock successful API response
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })
    )

    render(<TerminalModal onComplete={mockOnComplete} />)
    
    const input = screen.getByRole('textbox')
    
    // Get initial number of pre elements
    const initialPres = document.querySelectorAll('pre').length
    
    // Complete first command
    await userEvent.type(input, `${REQUIRED_COMMANDS[0].expectedInput}{enter}`)
    
    // Wait for command output to appear
    await waitFor(() => {
      const commandOutputs = document.querySelectorAll('pre')
      expect(commandOutputs.length).toBeGreaterThan(initialPres)
    })
    
    // Clear terminal
    await userEvent.type(input, 'clear{enter}')
    
    // Wait for clear to process
    await waitFor(() => {
      const afterClearPres = document.querySelectorAll('pre')
      expect(afterClearPres.length).toBe(initialPres)
    })
    
    // Type help to verify terminal is responsive
    await userEvent.type(input, 'help{enter}')
    
    // Verify help text appears
    await waitFor(() => {
      const helpMessages = screen.getAllByText(/Available Commands/i)
      expect(helpMessages.length).toBeGreaterThan(0)
    })
  })

  it('handles invalid command format', async () => {
    render(<TerminalModal onComplete={mockOnComplete} />)
    
    const input = screen.getByRole('textbox')
    
    // Type empty command
    await userEvent.type(input, '   {enter}')
    
    // Wait for error message
    await waitFor(() => {
      const errorMessage = screen.getByText(SYSTEM_MESSAGES.ERROR.UNKNOWN_COMMAND)
      expect(errorMessage).toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('handles rapid command inputs', async () => {
    render(<TerminalModal onComplete={mockOnComplete} />)
    
    const input = screen.getByRole('textbox')
    
    // Type multiple commands quickly
    await userEvent.type(input, 'help{enter}')
    await userEvent.type(input, 'clear{enter}')
    await userEvent.type(input, 'help{enter}')
    
    // Should process all commands
    const helpMessages = screen.getAllByText(/Available Commands/i)
    expect(helpMessages.length).toBeGreaterThan(0)
  })

  it('shows loading state during funnel completion', async () => {
    // Mock successful API responses
    REQUIRED_COMMANDS.forEach(() => {
      ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      )
    })

    render(<TerminalModal onComplete={mockOnComplete} />)
    
    // Complete all commands
    const input = screen.getByRole('textbox')
    const commandInputs = [
      'join_telegram',
      'verify_telegram',
      'sol_wallet F7AniHYnsdX6uGnntoSGfUmouZg4fnWp5ea',
      'refer',
      'submit_referral NO',
      'generate_referral',
      'share'
    ]

    for (let i = 0; i < commandInputs.length; i++) {
      await userEvent.type(input, `${commandInputs[i]}{enter}`)
      
      // Check for next command message except for the last command
      if (i < commandInputs.length - 1) {
        const nextCommand = REQUIRED_COMMANDS[i + 1]
        await waitFor(() => {
          expect(screen.getByText(`[SYSTEM] Next required command: ${nextCommand.command}`)).toBeInTheDocument()
        }, { timeout: 10000 })
      }
    }
    
    // Should show loading state
    await waitFor(() => {
      const loadingElement = document.querySelector('.animate-spin')
      expect(loadingElement).toBeInTheDocument()
    }, { timeout: 10000 })
  }, 30000)

  it('shows correct error message for wrong command sequence', async () => {
    render(<TerminalModal onComplete={mockOnComplete} />)
    
    // Try second command before first command
    const input = screen.getByRole('textbox')
    await userEvent.type(input, `${REQUIRED_COMMANDS[1].expectedInput}{enter}`)
    
    // Should show error message
    await waitFor(() => {
      const errorMessage = screen.getByText(new RegExp(
        SYSTEM_MESSAGES.ERROR.INVALID_INPUT(
          REQUIRED_COMMANDS[0].command,
          REQUIRED_COMMANDS[0].expectedInput
        ).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special characters
      ))
      expect(errorMessage).toBeInTheDocument()
    }, { timeout: 10000 })
  }, 15000) // Increase test timeout

  it('preserves command case sensitivity in responses', async () => {
    render(<TerminalModal onComplete={mockOnComplete} />)
    
    const input = screen.getByRole('textbox')
    await userEvent.type(input, `JOIN_TELEGRAM{enter}`)  // Uppercase command
    
    // Should show the exact command in response
    await waitFor(() => {
      const commandResponse = screen.getByText(/> JOIN_TELEGRAM/)
      expect(commandResponse).toBeInTheDocument()
    })
  })

  it('restores multiple completed commands with correct next command message', async () => {
    // Mock API response with multiple completed commands
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          progress: {
            current_command_index: 2,
            completed_commands: [REQUIRED_COMMANDS[0].command, REQUIRED_COMMANDS[1].command],
            command_responses: {
              [REQUIRED_COMMANDS[0].command]: 'test_response_1',
              [REQUIRED_COMMANDS[1].command]: 'test_response_2'
            }
          },
          completion: null
        })
      })
    )

    render(<TerminalModal onComplete={mockOnComplete} />)

    // Wait for progress to be restored
    await waitFor(() => {
      // Check for both completed commands
      expect(screen.getByText(`> test_response_1`)).toBeInTheDocument()
      expect(screen.getByText(`> test_response_2`)).toBeInTheDocument()
      // Check for next command message - should be SOL_WALLET since we completed JOIN_TELEGRAM and VERIFY_TELEGRAM
      expect(screen.getByText((content) => 
        content.includes(`[SYSTEM] Next required command: ${REQUIRED_COMMANDS[2].command}`)
      )).toBeInTheDocument()
    })
  })

  it('handles commands after all required commands are completed', async () => {
    // Mock successful progress load with all commands completed
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          progress: {
            current_command_index: REQUIRED_COMMANDS.length,
            completed_commands: REQUIRED_COMMANDS.map(cmd => cmd.command),
            command_responses: Object.fromEntries(
              REQUIRED_COMMANDS.map(cmd => [cmd.command, 'test_response'])
            )
          },
          completion: null
        })
      })
    )

    render(<TerminalModal onComplete={mockOnComplete} />)

    // Try entering an additional command after all are completed
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'extra_command{enter}')

    // Should show unknown command error
    await waitFor(() => {
      expect(screen.getByText(SYSTEM_MESSAGES.ERROR.UNKNOWN_COMMAND)).toBeInTheDocument()
    })
  })
})

describe('TerminalModal Command Tests', () => {
  // Mock function for onComplete callback
  const mockOnComplete = jest.fn()

  // Reset mock before each test
  beforeEach(() => {
    mockOnComplete.mockReset()
    // Mock successful progress load with completed previous commands
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          progress: {
            current_command_index: 2, // Start at SOL_WALLET
            completed_commands: ['JOIN_TELEGRAM', 'VERIFY_TELEGRAM'],
            command_responses: {
              'JOIN_TELEGRAM': 'join_telegram',
              'VERIFY_TELEGRAM': 'verify_telegram'
            }
          },
          completion: null
        })
      })
    )
  })

  describe('SOL_WALLET command', () => {
    it('accepts valid Solana wallet address', async () => {
      // Mock API for saving progress
      ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      )

      render(<TerminalModal onComplete={mockOnComplete} />)
      
      // Wait for progress to be restored
      await waitFor(() => {
        expect(screen.getByText(/Next required command: SOL_WALLET/)).toBeInTheDocument()
      })

      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'sol_wallet acJHdMxJ6hkik1GgEqL1V1biUT2PCPjtpYLtaWbuSjc{enter}')
      
      // Verify the sequence of messages
      await waitFor(() => {
        // 1. Command echo
        expect(screen.getByText('> sol_wallet acJHdMxJ6hkik1GgEqL1V1biUT2PCPjtpYLtaWbuSjc')).toBeInTheDocument()
        // 2. Success message
        expect(screen.getByText('[SUCCESS] Wallet address verified and stored successfully')).toBeInTheDocument()
        // 3. Next command prompt
        expect(screen.getByText(/Next required command: REFER/)).toBeInTheDocument()
      })

      // Verify API was called to save progress
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/command-progress',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      )
    })

    it('rejects invalid Solana wallet address', async () => {
      render(<TerminalModal onComplete={mockOnComplete} />)
      
      // Wait for progress to be restored
      await waitFor(() => {
        expect(screen.getByText(/Next required command: SOL_WALLET/)).toBeInTheDocument()
      })

      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'sol_wallet abc123{enter}')
      
      await waitFor(() => {
        expect(screen.getByText(/Invalid Solana wallet address/)).toBeInTheDocument()
      })
    })
  })

  describe('REFER command', () => {
    beforeEach(() => {
      // Mock progress with SOL_WALLET completed
      ;(global.fetch as jest.Mock).mockReset()
      ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            progress: {
              current_command_index: 3, // REFER
              completed_commands: ['JOIN_TELEGRAM', 'VERIFY_TELEGRAM', 'SOL_WALLET'],
              command_responses: {
                'JOIN_TELEGRAM': 'join_telegram',
                'VERIFY_TELEGRAM': 'verify_telegram',
                'SOL_WALLET': 'sol_wallet acJHdMxJ6hkik1GgEqL1V1biUT2PCPjtpYLtaWbuSjc'
              }
            },
            completion: null
          })
        })
      )
    })

    it('shows referral program information', async () => {
      render(<TerminalModal onComplete={mockOnComplete} />)
      
      // Wait for progress to be restored
      await waitFor(() => {
        expect(screen.getByText(/Next required command: REFER/)).toBeInTheDocument()
      })

      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'refer{enter}')
      
      await waitFor(() => {
        expect(screen.getByText(/REFERRAL PROGRAM INFORMATION/)).toBeInTheDocument()
        expect(screen.getByText(/Join our exclusive referral program/)).toBeInTheDocument()
        expect(screen.getByText(/Next required command: SUBMIT_REFERRAL/)).toBeInTheDocument()
      })
    })
  })

  describe('SUBMIT_REFERRAL command', () => {
    beforeEach(() => {
      // Mock progress with REFER completed
      ;(global.fetch as jest.Mock).mockReset()
      ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            progress: {
              current_command_index: 4, // SUBMIT_REFERRAL
              completed_commands: ['JOIN_TELEGRAM', 'VERIFY_TELEGRAM', 'SOL_WALLET', 'REFER'],
              command_responses: {
                'JOIN_TELEGRAM': 'join_telegram',
                'VERIFY_TELEGRAM': 'verify_telegram',
                'SOL_WALLET': 'sol_wallet acJHdMxJ6hkik1GgEqL1V1biUT2PCPjtpYLtaWbuSjc',
                'REFER': 'refer'
              }
            },
            completion: null
          })
        })
      )
    })

    it('accepts valid referral code', async () => {
      // Mock API to validate referral code
      ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      )

      render(<TerminalModal onComplete={mockOnComplete} />)
      
      // Wait for progress to be restored
      await waitFor(() => {
        expect(screen.getByText(/Next required command: SUBMIT_REFERRAL/)).toBeInTheDocument()
      })

      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'submit_referral PUSH-USER-1234{enter}')
      
      await waitFor(() => {
        expect(screen.getByText(/Command accepted: Submit a referral code/)).toBeInTheDocument()
      })
    })

    it('accepts NO as valid input', async () => {
      render(<TerminalModal onComplete={mockOnComplete} />)
      
      // Wait for progress to be restored
      await waitFor(() => {
        expect(screen.getByText(/Next required command: SUBMIT_REFERRAL/)).toBeInTheDocument()
      })

      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'submit_referral NO{enter}')
      
      await waitFor(() => {
        expect(screen.getByText(/Command accepted: Submit a referral code/)).toBeInTheDocument()
      })
    })

    it('rejects invalid referral code format', async () => {
      render(<TerminalModal onComplete={mockOnComplete} />)
      
      // Wait for progress to be restored
      await waitFor(() => {
        expect(screen.getByText(/Next required command: SUBMIT_REFERRAL/)).toBeInTheDocument()
      })

      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'submit_referral INVALID-CODE{enter}')
      
      await waitFor(() => {
        expect(screen.getByText(/Invalid input/)).toBeInTheDocument()
        expect(screen.getByText(/Please enter a valid referral code or type "NO"/)).toBeInTheDocument()
      })
    })
  })

  describe('GENERATE_REFERRAL command', () => {
    beforeEach(() => {
      // Mock progress with SUBMIT_REFERRAL completed
      ;(global.fetch as jest.Mock).mockReset()
      ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            progress: {
              current_command_index: 5, // GENERATE_REFERRAL
              completed_commands: ['JOIN_TELEGRAM', 'VERIFY_TELEGRAM', 'SOL_WALLET', 'REFER', 'SUBMIT_REFERRAL'],
              command_responses: {
                'JOIN_TELEGRAM': 'join_telegram',
                'VERIFY_TELEGRAM': 'verify_telegram',
                'SOL_WALLET': 'sol_wallet acJHdMxJ6hkik1GgEqL1V1biUT2PCPjtpYLtaWbuSjc',
                'REFER': 'refer',
                'SUBMIT_REFERRAL': 'submit_referral NO'
              }
            },
            completion: null
          })
        })
      )
    })

    it('generates referral code based on username and wallet', async () => {
      render(<TerminalModal onComplete={mockOnComplete} />)
      
      // Wait for progress to be restored
      await waitFor(() => {
        expect(screen.getByText(/Next required command: GENERATE_REFERRAL/)).toBeInTheDocument()
      })

      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'generate_referral{enter}')
      
      // Updated success message checks
      await waitFor(() => {
        expect(screen.getByText(/Your unique referral code has been generated/)).toBeInTheDocument()
        expect(screen.getByText(/PUSH-TEST-/)).toBeInTheDocument()
        expect(screen.getByText(/Share this code with others to earn rewards!/)).toBeInTheDocument()
        expect(screen.getByText(/Next required command: SHARE/)).toBeInTheDocument()
      })
    })

    it('stores generated code in database', async () => {
      // Mock API for saving referral code
      ;(global.fetch as jest.Mock)
        .mockImplementationOnce(() => // Save progress
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
          })
        )

      render(<TerminalModal onComplete={mockOnComplete} />)
      
      // Wait for progress to be restored
      await waitFor(() => {
        expect(screen.getByText(/Next required command: GENERATE_REFERRAL/)).toBeInTheDocument()
      })

      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'generate_referral{enter}')
      
      // Verify API was called to save progress
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json'
            })
          })
        )
      })
    })
  })
}) 