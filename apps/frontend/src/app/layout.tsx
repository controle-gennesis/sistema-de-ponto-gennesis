'use client';

import { Inter } from 'next/font/google';
import Head from 'next/head';
import './globals.css';
import { Providers } from '@/components/providers/Providers';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <Head>
        <title>Gennesis Engenharia</title>
        <meta name="description" content="Sistema completo para controle de frequência de colaboradores" />
        <meta name="keywords" content="ponto, frequência, engenharia, controle, horas" />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" href="/logo3.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#22c55e',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
