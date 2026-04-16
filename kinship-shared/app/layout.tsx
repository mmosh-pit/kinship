import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { StudioProvider } from '@/lib/studio-context'
import { AuthProvider } from '@/lib/auth-context'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Kinship Studio',
  description: 'Creator Studio for Kinship Intelligence Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="dark">
      <body className={`${inter.variable} ${inter.className} antialiased`}>
        <AuthProvider>
          <StudioProvider>{children}</StudioProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
