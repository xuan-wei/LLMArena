import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import { Footer } from "@/components/layout/Footer";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Arena — 大模型竞技场",
  description: "大模型 Chatbot 竞技场系统",
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
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
