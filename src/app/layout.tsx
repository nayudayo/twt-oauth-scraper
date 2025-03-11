import type { Metadata } from 'next';
import './globals.css'
import { Inter } from 'next/font/google'
import { Press_Start_2P } from 'next/font/google'
import { Providers } from './providers'
import { Header } from '@/components/Header'
import { SessionProvider } from '@/components/SessionProvider'

const inter = Inter({ subsets: ['latin'] })
const pressStart2P = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-press-start-2p',
})

export const metadata: Metadata = {
  title: 'PTB Terminal | Askance',
  description: 'who are we?',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={pressStart2P.variable}>
      <body className={inter.className}>
        <SessionProvider>
          <Providers>
            <div className="min-h-screen bg-black text-red-500/90">
              <Header />
              <main className="pt-12">
                {children}
              </main>
              <div className="scanline" />
              <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.05),transparent_100%)]" />
            </div>
          </Providers>
        </SessionProvider>
      </body>
    </html>
  )
}
