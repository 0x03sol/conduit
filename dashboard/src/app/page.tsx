import Link from "next/link";

export default function Home() {
    return (
        <div className="space-y-12">
            <section className="space-y-3">
                <p className="font-mono text-xs text-ink-soft/70">Conduit</p>
                <h1 className="text-3xl font-medium leading-tight">
                    Atomic cross-chain B2B settlement on Arc.
                </h1>
                <p className="text-base text-ink-soft max-w-xl">
                    One USDC burn on any CCTP-supported chain settles atomically as multi-recipient
                    payments in regional stablecoins on Arc — in under one second.
                </p>
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
                <Card
                    href="/sender"
                    title="Sender"
                    body="Upload a CSV. Register a batch. Burn USDC on Sepolia and watch it settle on Arc."
                />
                <Card
                    href="/operator"
                    title="Operator"
                    body="Live feed of every settled batch on Arc, with on-chain proof links."
                />
                <Card
                    href="/recipient"
                    title="Recipient"
                    body="Look up incoming payments by wallet."
                />
            </section>
        </div>
    );
}

function Card({ href, title, body }: { href: string; title: string; body: string }) {
    return (
        <Link
            href={href}
            className="block rounded-md border border-border bg-paper-soft px-5 py-4 hover:border-signal transition-colors"
        >
            <p className="font-medium">{title}</p>
            <p className="text-sm text-ink-soft mt-1">{body}</p>
        </Link>
    );
}
