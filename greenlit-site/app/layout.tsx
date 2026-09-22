import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
// The PM's demo stylesheet, scoped to `.zht`. See the header in that file.
import "./zht.css";

// Self-hosted through next/font: no external request, no render-blocking
// stylesheet chain, and the exact weights v3 uses.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Project Greenlit — Control Tower",
  description:
    "A maritime transportation control tower with browser-local arrival-notice intake and linked job, container, trip, chassis, readiness, and free-time management.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-SG" suppressHydrationWarning>
      <head>
        {/*
          The theme is decided before anything paints.
          
          Applied from React instead, the first frame renders in the default
          and corrects itself — a white flash, which on a warehouse floor at
          6am is the difference between usable and not. The stored choice wins
          over the system setting, because a person who pressed the button
          meant it.
        */}
        <script
          dangerouslySetInnerHTML={{ __html: `(function(){try{
            var s=localStorage.getItem('gl-theme');
            var d=s||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
            document.documentElement.dataset.theme=d;
          }catch(e){}})();` }}
        />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
