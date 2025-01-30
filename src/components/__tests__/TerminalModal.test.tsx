import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TerminalModal } from '../TerminalModal'
import { useSession } from 'next-auth/react'
import { REQUIRED_COMMANDS } from '@/constants/commands'

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
    
    const firstCommand = REQUIRED_COMMANDS[0]
    const input = screen.getByRole('textbox')
    await userEvent.type(input, `${firstCommand.expectedInput}{enter}`)
    
    expect(screen.getByText('It works!')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(firstCommand.description))).toBeInTheDocument()
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
    
    const input = screen.getByRole('textbox')
    
    // Complete all commands
    for (const command of REQUIRED_COMMANDS) {
      await userEvent.type(input, `${command.expectedInput}{enter}`)
      // Wait for success message after each command
      await waitFor(() => {
        const successMessages = screen.getAllByText(/It works!/i)
        expect(successMessages[successMessages.length - 1]).toBeInTheDocument()
      })
    }
    
    // Look for completion indicators
    await waitFor(() => {
      expect(screen.getByText(/ACCESS GRANTED/i)).toBeInTheDocument()
    })
    
    // Wait for loading and transition
    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalled()
    }, { timeout: 3000 })
  })

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
}) 