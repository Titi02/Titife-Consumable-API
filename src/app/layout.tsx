import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Titife Transport Explorer — Intercity Bus API Client",
  description: "Live consumer proof application calling the Titife Consumable REST API for Nigerian intercity bus transport operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="app-header">
          <div className="header-inner">
            <div className="brand-title">
              <span>🚍 Titife Transport Explorer</span>
              <span className="api-badge" id="api-status-badge">v1.0.0</span>
            </div>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
