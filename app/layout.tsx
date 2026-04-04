import React from 'react';
import { Inter } from 'next/font/google';
import AlertProvider from '../components/AlertProvider';
import QueryProvider from '../components/QueryProvider';
import '../styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'SHT 예약 확인',
  description: 'Stay Halong - 예약 확인 시스템',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-white text-gray-900 antialiased flex flex-col min-h-screen`}>
        <QueryProvider>
          <AlertProvider>
            <main className="flex-1 w-full">
              {children}
            </main>
          </AlertProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
