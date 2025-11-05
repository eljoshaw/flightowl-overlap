export const metadata = {
  title: 'FlightOwl • Daylight Overlap',
  description: 'Compare daylight hours between airports',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'sans-serif', margin: '2rem' }}>
        {children}
      </body>
    </html>
  )
}
