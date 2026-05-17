import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Music Blockchain — Chain your favourite songs',
  description: 'A collaborative music tree where every song must connect to the last via a title word, artist, genre, or release year.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'Music Blockchain',
    description: 'Build a living chain of connected songs. Longest chain wins.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body>{children}</body>
    </html>
  );
}
