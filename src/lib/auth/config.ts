import { AuthOptions } from "next-auth"
import TwitterProvider from "next-auth/providers/twitter"

interface TwitterProfile {
  data: {
    id: string
    username: string
    name: string
    profile_image_url: string
  }
}

declare module "next-auth" {
  interface Session {
    accessToken?: string
    username?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string
    username?: string
  }
}

export const authOptions: AuthOptions = {
  providers: [
    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      version: "2.0",
      authorization: {
        url: "https://twitter.com/i/oauth2/authorize",
        params: {
          scope: "users.read tweet.read tweet.write offline.access",
        },
      },
      profile(profile: TwitterProfile) {
        return {
          id: profile.data.id,
          name: profile.data.username, // Use username as the main identifier
          email: null,
          image: profile.data.profile_image_url,
        }
      }
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account && user?.name) {
        // Save the access token and username from user object
        token.accessToken = account.access_token
        token.username = user.name // This will be the Twitter username since we set it in profile()
      }
      return token
    },
    async session({ session, token }) {
      // Pass the access token and username to the client
      session.accessToken = token.accessToken
      session.username = token.username
      return session
    },
  },
  events: {
    async signOut({ token }) {
      // Clear any server-side session data if needed
      if (token?.accessToken) {
        try {
          await fetch('https://api.twitter.com/2/oauth2/revoke', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')}`
            },
            body: `token=${token.accessToken}&token_type_hint=access_token`
          })
        } catch (error) {
          console.error('Failed to revoke token during signOut event:', error)
        }
      }
    }
  },
  // Set short session lifetime
  session: {
    maxAge: 24 * 60 * 60, // 24 hours
    updateAge: 60 * 60, // Update session every hour
  },
  debug: true,
} 