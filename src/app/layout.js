import { Inter, Orbitron } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-orbitron",
});

export const metadata = {
  title: "JARVIS | Smart Room Automation",
  description: "AI-powered smart room automation and personal assistant.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05080F",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${orbitron.variable} h-full antialiased`}
    >
      <body className="min-h-dvh flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
