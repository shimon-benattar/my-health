import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import AboutMenu from "@/components/AboutMenu";
import ProfileMenu from "@/components/ProfileMenu";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "my-health",
  description: "Personal health dashboard — Apple Health CSV ingestion and tracking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="text-sm font-semibold tracking-wide text-slate-900 hover:text-blue-700">
              my-health
            </Link>
            <div className="flex items-center gap-2">
              <ProfileMenu />
              <AboutMenu />
            </div>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
