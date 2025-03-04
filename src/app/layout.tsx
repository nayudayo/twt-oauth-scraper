import type { Metadata } from 'next';
import './globals.css'
import { Inter } from 'next/font/google'
import { Providers } from './providers'
import { Header } from '@/components/Header'

const inter = Inter({ subsets: ['latin'] })

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={inter.className}>
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
      </body>
    </html>
  )
}
