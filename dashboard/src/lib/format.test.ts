/**
 * Run with: pnpm exec tsx src/lib/format.test.ts
 *
 * Lightweight node:test runner; no test framework dependency required.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { formatAmount, shortenHex, timeAgo } from "./format";

test("formatAmount preserves trailing zeros (regression: '1' → '1.00')", () => {
    // 1 USDC = 1_000_000 base units at 6 decimals.
    assert.equal(formatAmount(1_000_000n, 6, "USDC"), "1.00 USDC");
});

test("formatAmount keeps two decimal places by default", () => {
    assert.equal(formatAmount(1_500_000n, 6), "1.50");
    assert.equal(formatAmount(500_000n, 6, "USDC"), "0.50 USDC");
    assert.equal(formatAmount(0n, 6, "USDC"), "0.00 USDC");
});

test("formatAmount caps at 6 decimals for dust amounts", () => {
    // 0.000001 USDC
    assert.equal(formatAmount(1n, 6), "0.000001");
});

test("formatAmount adds thousands separators for large amounts", () => {
    // 1,234.56 USDC
    assert.equal(formatAmount(1_234_560_000n, 6, "USDC"), "1,234.56 USDC");
});

test("formatAmount accepts string input (typical from indexer JSON)", () => {
    assert.equal(formatAmount("2500000", 6, "USDC"), "2.50 USDC");
});

test("shortenHex truncates long hex", () => {
    assert.equal(
        shortenHex("0x27f8c09a134037380a0164797e54f9B32B9fC6e2"),
        "0x27f8c0…C6e2",
    );
});

test("shortenHex leaves short values alone", () => {
    assert.equal(shortenHex("0xabc"), "0xabc");
});

test("timeAgo gives human-friendly buckets", () => {
    const now = Math.floor(Date.now() / 1000);
    assert.equal(timeAgo(now), "0s ago");
    assert.equal(timeAgo(now - 30), "30s ago");
    assert.equal(timeAgo(now - 120), "2m ago");
    assert.equal(timeAgo(now - 7200), "2h ago");
});
