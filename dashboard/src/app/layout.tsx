import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";
import { Providers } from "./providers";
import { LoginButton } from "@/components/LoginButton";

export const metadata: Metadata = {
    title: "Conduit",
    description: "Atomic cross-chain B2B settlement on Arc",
};

// All routes consume Privy + wagmi context which only exists at runtime.
// Skip static prerender across the board (Next 14 App Router pattern).
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="font-sans min-h-screen flex flex-col">
                <Providers>
                    <header className="border-b border-border bg-paper">
                        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
                            <Link href="/" className="font-mono text-sm">conduit/</Link>
                            <nav className="flex items-center gap-6 text-sm">
                                <Link href="/sender" className="hover:text-signal">Sender</Link>
                                <Link href="/operator" className="hover:text-signal">Operator</Link>
                                <Link href="/recipient" className="hover:text-signal">Recipient</Link>
                                <LoginButton />
                            </nav>
                        </div>
                    </header>
                    <main className="flex-1">
                        <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
                    </main>
                    <footer className="border-t border-border text-xs text-ink-soft/70">
                        <div className="mx-auto max-w-6xl px-6 py-4 flex justify-between">
                            <span>Arc Testnet · chain id 5042002</span>
                            <a className="hover:text-signal" href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">arcscan</a>
                        </div>
                    </footer>
                </Providers>
            </body>
        </html>
    );
}
