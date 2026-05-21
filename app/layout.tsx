import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import { Footer } from "@/components/layout/Footer";
import { I18nClient } from "@/components/I18nClient";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Arena — LLM Arena",
  description: "LLM Chatbot contest platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background">
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            <div className="flex-1 flex flex-col">{children}</div>
            <Footer
              copyright={process.env.FOOTER_COPYRIGHT}
              icp={process.env.FOOTER_ICP}
            />
          </div>
          <I18nClient />
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
