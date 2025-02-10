import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'
import * as nodeFetch from 'node-fetch'

// Mock TextEncoder/TextDecoder as they're not available in jsdom
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as typeof global.TextDecoder

// Mock fetch globally
global.fetch = jest.fn()

// Polyfill for Web APIs
Object.defineProperty(global, 'Headers', {
  value: nodeFetch.Headers,
  writable: true
})

Object.defineProperty(global, 'Request', {
  value: nodeFetch.Request,
  writable: true
})

Object.defineProperty(global, 'Response', {
  value: nodeFetch.Response,
  writable: true
})

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks()
}) 