import { formatUnits } from "viem";

export function shortenHex(value: string, head = 6, tail = 4): string {
    if (!value || value.length <= head + tail + 2) return value;
    return `${value.slice(0, head + 2)}…${value.slice(-tail)}`;
}

/**
 * Format a base-units amount given decimals (default 6 for USDC/EURC).
 *
 * - Always shows at least `minDecimals` (default 2) decimal places — viem's
 *   `formatUnits` strips trailing zeros, which makes "1.00 USDC" render as
 *   "1 USDC". Stablecoin balances should always look like money.
 * - Caps at `maxDecimals` (default 6) so dust amounts still read cleanly.
 * - Uses Intl number formatting for thousands separators on large amounts.
 */
export function formatAmount(
    raw: bigint | string,
    decimals = 6,
    symbol?: string,
    opts: { minDecimals?: number; maxDecimals?: number } = {},
): string {
    const minDecimals = opts.minDecimals ?? 2;
    const maxDecimals = opts.maxDecimals ?? Math.max(2, Math.min(decimals, 6));
    const n = typeof raw === "bigint" ? raw : BigInt(raw);
    const fixed = formatUnits(n, decimals);
    const num = Number(fixed);
    // For very small non-zero values that lose precision in Number, fall back
    // to the string representation but pad to minDecimals.
    if (!Number.isFinite(num)) {
        return symbol ? `${fixed} ${symbol}` : fixed;
    }
    const formatted = num.toLocaleString("en-US", {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
    });
    return symbol ? `${formatted} ${symbol}` : formatted;
}

export function arcScanTx(txHash: string): string {
    return `https://testnet.arcscan.app/tx/${txHash}`;
}

export function arcScanAddress(addr: string): string {
    return `https://testnet.arcscan.app/address/${addr}`;
}

export function timeAgo(unixSeconds: bigint | string | number): string {
    const t = Number(unixSeconds);
    const delta = Math.max(0, Math.floor(Date.now() / 1000) - t);
    if (delta < 60) return `${delta}s ago`;
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
    if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
    return `${Math.floor(delta / 86400)}d ago`;
}
