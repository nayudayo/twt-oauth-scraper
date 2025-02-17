import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Routes that require access code verification
const PROTECTED_ROUTES = [
  '/api/chat',  // Protect chat since it uses the personality
  '/api/tweets/save',  // Only protect tweet saving
  '/api/conversations/new',  // Only protect conversation creation
  '/api/conversations/delete'  // Only protect conversation deletion
]

// Routes that only require authentication
const AUTH_ONLY_ROUTES = [
  '/api/analyze',  // Allow analysis after sign in
  '/api/tweets/[username]/all',  // Allow tweet fetching after sign in
  '/api/conversations',  // Allow listing conversations
  '/api/conversations/[id]/messages',  // Allow fetching messages
  '/api/scrape'  // Allow scraping after sign in
]

// Cache TTL in seconds
const CACHE_TTL = 300 // 5 minutes

export async function middleware(request: NextRequest) {
  // 1. Check if this is a protected route
  const isProtectedRoute = PROTECTED_ROUTES.some(route => 
    request.nextUrl.pathname.startsWith(route)
  )
  
  const isAuthOnlyRoute = AUTH_ONLY_ROUTES.some(route =>
    request.nextUrl.pathname.includes(route.replace('[username]', ''))
  )
  
  // Allow unprotected routes
  if (!isProtectedRoute && !isAuthOnlyRoute) {
    return NextResponse.next()
  }

  // Allow internal requests from worker
  const isInternalRequest = request.headers.get('x-internal-request') === process.env.INTERNAL_REQUEST_TOKEN
  if (isInternalRequest) {
    return NextResponse.next()
  }

  try {
    // 2. Verify authentication token
    const token = await getToken({ 
      req: request, 
      secret: process.env.NEXTAUTH_SECRET 
    })

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // For auth-only routes, proceed after token verification
    if (isAuthOnlyRoute) {
      return NextResponse.next()
    }

    // 3. For protected routes, check access code verification
    const cache = request.headers.get('x-middleware-cache')
    
    // Check cache first
    if (cache) {
      try {
        const { status, timestamp } = JSON.parse(cache)
        const age = (Date.now() - timestamp) / 1000
        
        if (age < CACHE_TTL) {
          // Use cached result
          if (!status) {
            return NextResponse.json(
              { error: 'Access code required' },
              { status: 403 }
            )
          }
          return NextResponse.next()
        }
      } catch (e) {
        // Invalid cache, ignore and proceed with verification
        console.warn('Invalid cache data:', e)
      }
    }

    // Verify access status
    const verifyResponse = await fetch(`${request.nextUrl.origin}/api/access-code/status`, {
      headers: {
        'Cookie': request.headers.get('cookie') || '',
        'Authorization': `Bearer ${token}`
      }
    })

    const data = await verifyResponse.json()
    
    // Cache the result
    const response = data.success && data.isVerified
      ? NextResponse.next()
      : NextResponse.json(
          { error: 'Access code required' },
          { status: 403 }
        )

    // Add cache headers
    response.headers.set(
      'x-middleware-cache',
      JSON.stringify({
        status: data.success && data.isVerified,
        timestamp: Date.now()
      })
    )

    return response
  } catch (error) {
    console.error('Middleware error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Configure which routes use this middleware
export const config = {
  matcher: [
    '/((?!api/access-code)api/chat)/:path*',
    '/((?!api/access-code)api/analyze)/:path*',
    '/((?!api/access-code)api/tweets)/:path*',
    '/((?!api/access-code)api/conversations)/:path*',
    '/((?!api/access-code)api/scrape)/:path*'
  ]
} 