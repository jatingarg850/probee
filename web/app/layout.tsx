import { AppShell } from '@/components/AppShell'
import { NextAuthSessionProvider } from '@/components/NextAuthSessionProvider'
import { AuthProvider } from '@/contexts/AuthContext'
import { OrgProvider } from '@/contexts/OrgContext'
import type { Metadata, Viewport } from 'next'
import { Instrument_Sans } from 'next/font/google'
import '@/index.css'

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument-sans',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: 'PROBE : Your AI Job Helper',
  description:
    'Practice live interviews with an AI panel, then upload your resume for a Gemini-powered fit analysis and role recommendations.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png' }],
    other: [
      {
        url: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${instrumentSans.variable} h-full`} suppressHydrationWarning>
      <body className="flex h-full min-h-screen flex-col bg-background text-foreground" suppressHydrationWarning>
        <NextAuthSessionProvider>
          <AuthProvider>
            {/* Inside AuthProvider: the organisation list is per-user and is
                fetched with the signed-in user's token. */}
            <OrgProvider>
              <AppShell>{children}</AppShell>
            </OrgProvider>
          </AuthProvider>
        </NextAuthSessionProvider>
      </body>
    </html>
  )
}
