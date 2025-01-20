import NextAuth from "next-auth"
import TwitterProvider from "next-auth/providers/twitter"
import { JWT } from "next-auth/jwt"
import { Account, Profile } from "next-auth"

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

interface TwitterProfile extends Profile {
  data?: {
    username?: string
  }
}

const handler = NextAuth({
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
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }: { token: JWT, account: Account | null, profile?: TwitterProfile }) {
      if (account) {
        // Save the access token and username
        token.accessToken = account.access_token
        token.username = profile?.data?.username
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
  debug: true,
})

export { handler as GET, handler as POST } 