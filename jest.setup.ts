import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

// Mock TextEncoder/TextDecoder as they're not available in jsdom
global.TextEncoder = TextEncoder
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.TextDecoder = TextDecoder as any

// Mock fetch globally
global.fetch = jest.fn()

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks()
}) 