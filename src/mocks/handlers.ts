import { http, HttpResponse } from 'msw'

interface CommandProgressBody {
  userId: string
  currentIndex: number
  completedCommands: string[]
}

export const handlers = [
  // Mock GET /api/command-progress
  http.get('/api/command-progress', ({ request }) => {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    
    if (!userId) {
      return HttpResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      )
    }

    return HttpResponse.json({
      progress: {
        current_command_index: 0,
        completed_commands: []
      },
      completion: null
    })
  }),

  // Mock POST /api/command-progress
  http.post('/api/command-progress', async ({ request }) => {
    const body = await request.json() as CommandProgressBody
    const { userId, currentIndex, completedCommands } = body

    if (!userId || typeof currentIndex !== 'number' || !Array.isArray(completedCommands)) {
      return HttpResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    return HttpResponse.json({ success: true })
  })
] 