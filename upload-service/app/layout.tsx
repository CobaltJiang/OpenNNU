import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenNNU 资料投稿",
  description: "免登录课程资料上传与待审核文件服务",
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
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
