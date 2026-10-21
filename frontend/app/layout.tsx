import type { Metadata } from "next";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "HazardLane",
  description: "HazardLane helps you check weather-related road hazard risk before you drive.",
  openGraph: {
    title: "HazardLane",
    description: "Check weather-related road hazard risk before you drive.",
    siteName: "HazardLane",
    type: "website",
  },
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
