import './globals.css';

export const metadata = {
  title: 'FlightOwl • Daylight Overlap',
  description: 'Compare daylight hours between airports',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
