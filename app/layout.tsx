import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ausmed Engagement Survey',
  description: 'Staff engagement survey platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
