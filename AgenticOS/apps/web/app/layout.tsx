import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The PVTLST",
  description: "Private intelligence. Infinite action.",
  themeColor: "#050505",
  other: {
    "apple-mobile-web-app-title": "The PVTLST",
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <html lang="en" className="dark">
      <body>
        {hasClerkKey ? (
          <ClerkProvider>
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
