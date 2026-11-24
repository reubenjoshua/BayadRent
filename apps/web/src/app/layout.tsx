import type { Metadata } from 'next';
import { IBM_Plex_Mono, Source_Sans_3, Source_Serif_4 } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const sans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-sans',
});

const display = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-display',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'BayadRent',
  description: 'Landlord and renter rent tracking with role-based access',
  icons: {
    icon: '/bayadrent-mark.jpg',
    apple: '/bayadrent-mark.jpg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${mono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
