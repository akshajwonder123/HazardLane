import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "StormRoute",
  description: "Check weather-related road hazard risk before you drive.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-body" suppressHydrationWarning>{children}</body>
    </html>
  );
}
