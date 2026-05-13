import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Music Blockchain — Chain your favourite songs',
  description: 'A collaborative music tree where every song must connect to the last. Share songs that share a title word, artist, genre, or release year.',
  openGraph: {
    title: 'Music Blockchain',
    description: 'Build a living tree of connected songs.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
