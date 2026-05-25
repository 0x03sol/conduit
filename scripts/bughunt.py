"""
Conduit dashboard bug-hunt — walks every route like a real user, captures:
  - console errors & warnings
  - page JS errors
  - failed network requests
  - missing DOM elements
  - UI interaction outcomes
  - desktop + mobile screenshots

Outputs:
  /tmp/conduit-bughunt/
    desktop_*.png, mobile_*.png  — screenshots
    report.md                    — human-readable findings
    raw.json                     — machine-readable logs
"""
from __future__ import annotations

import json
import os
import shutil
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

from playwright.sync_api import (
    sync_playwright,
    BrowserContext,
    Page,
    Request,
    Response,
    ConsoleMessage,
    Error as PWError,
)

OUT = Path("/tmp/conduit-bughunt")
if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True, exist_ok=True)

DASHBOARD_URL = "http://localhost:3001"
INDEXER_URL = "http://localhost:42069"

ROUTES = [
    ("home", "/"),
    ("sender", "/sender"),
    ("operator", "/operator"),
    ("recipient", "/recipient"),
]

VIEWPORTS = {
    "desktop": {"width": 1280, "height": 900},
    "mobile": {"width": 390, "height": 844},  # iPhone 13 Pro
}


@dataclass
class RouteFinding:
    route: str
    path: str
    viewport: str
    status_code: int | None = None
    load_time_ms: int | None = None
    console_errors: list[str] = field(default_factory=list)
    console_warnings: list[str] = field(default_factory=list)
    page_errors: list[str] = field(default_factory=list)
    failed_requests: list[dict[str, Any]] = field(default_factory=list)
    failed_responses: list[dict[str, Any]] = field(default_factory=list)
    screenshot: str = ""
    notes: list[str] = field(default_factory=list)
    interactions: list[dict[str, Any]] = field(default_factory=list)


def attach_listeners(page: Page, finding: RouteFinding) -> None:
    def on_console(msg: ConsoleMessage) -> None:
        text = f"[{msg.location.get('url', '')}:{msg.location.get('lineNumber','')}] {msg.text}"
        if msg.type == "error":
            finding.console_errors.append(text)
        elif msg.type == "warning":
            finding.console_warnings.append(text)

    def on_page_error(err: PWError) -> None:
        finding.page_errors.append(f"{err.name}: {err.message}\n{err.stack or ''}".strip())

    def on_request_failed(req: Request) -> None:
        finding.failed_requests.append({
            "url": req.url,
            "method": req.method,
            "failure": (req.failure or ""),
            "resource_type": req.resource_type,
        })

    def on_response(resp: Response) -> None:
        if resp.status >= 400:
            try:
                body_preview = resp.text()[:300]
            except Exception:
                body_preview = "<unreadable>"
            finding.failed_responses.append({
                "url": resp.url,
                "status": resp.status,
                "body_preview": body_preview,
            })

    page.on("console", on_console)
    page.on("pageerror", on_page_error)
    page.on("requestfailed", on_request_failed)
    page.on("response", on_response)


def visit(ctx: BrowserContext, route: str, path: str, viewport: str) -> RouteFinding:
    finding = RouteFinding(route=route, path=path, viewport=viewport)
    page = ctx.new_page()
    attach_listeners(page, finding)

    import time
    t0 = time.time()
    try:
        resp = page.goto(f"{DASHBOARD_URL}{path}", wait_until="networkidle", timeout=20_000)
        finding.status_code = resp.status if resp else None
    except Exception as e:
        finding.notes.append(f"navigation failed: {e}")

    finding.load_time_ms = int((time.time() - t0) * 1000)

    # Give SPA hydration a beat
    page.wait_for_timeout(800)

    screenshot_path = OUT / f"{viewport}_{route}.png"
    try:
        page.screenshot(path=str(screenshot_path), full_page=True)
        finding.screenshot = screenshot_path.name
    except Exception as e:
        finding.notes.append(f"screenshot failed: {e}")

    # --- per-route smoke checks (real-user-ish) ---
    try:
        if route == "home":
            for txt in ["Conduit", "Sender", "Operator", "Recipient", "Atomic cross-chain"]:
                count = page.get_by_text(txt, exact=False).count()
                if count == 0:
                    finding.notes.append(f"MISSING: text '{txt}' not on page")

        elif route == "sender":
            # Are the building blocks there?
            for sel, label in [
                ('input[type="file"]', "CSV upload input"),
                ('text=Sign in', "Sign-in CTA (since unauthenticated)"),
            ]:
                if page.locator(sel).count() == 0:
                    finding.notes.append(f"MISSING: {label} ({sel})")

            # Try uploading a tiny valid CSV
            csv_path = OUT / "sample.csv"
            csv_path.write_text(
                "wallet,amount,currency\n"
                "0x27f8c09a134037380a0164797e54f9B32B9fC6e2,1.50,USDC\n"
                "0x000000000000000000000000000000000000dEaD,0.50,USDC\n"
                "not-an-address,2.0,USDC\n"
                "0x27f8c09a134037380a0164797e54f9B32B9fC6e2,abc,USDC\n"
                "0x27f8c09a134037380a0164797e54f9B32B9fC6e2,1.0,XYZ\n"
            )
            try:
                page.locator('input[type="file"]').set_input_files(str(csv_path))
                page.wait_for_timeout(500)
                finding.interactions.append({"upload_csv": "ok"})
                # We expect 5 rows in the table — 2 OK, 3 with errors
                ok_cells = page.locator("td:has-text('OK')").count()
                err_cells = (
                    page.locator("td:has-text('invalid address')").count()
                    + page.locator("td:has-text('invalid amount')").count()
                    + page.locator("td:has-text('unsupported currency')").count()
                )
                finding.interactions.append({"valid_rows_marked_OK": ok_cells, "rows_with_error_label": err_cells})
                if ok_cells != 2:
                    finding.notes.append(f"BUG?: expected 2 OK rows, saw {ok_cells}")
                if err_cells != 3:
                    finding.notes.append(f"BUG?: expected 3 error rows, saw {err_cells}")
                page.screenshot(path=str(OUT / f"{viewport}_sender_after_csv.png"), full_page=True)
            except Exception as e:
                finding.notes.append(f"CSV upload failed: {e}")

        elif route == "operator":
            for sel, label in [
                ("table", "settlements table"),
                ("th:has-text('batchId')", "batchId column"),
                ("th:has-text('settled')", "settled column"),
            ]:
                if page.locator(sel).count() == 0:
                    finding.notes.append(f"MISSING: {label} ({sel})")
            # Empty-state friendliness:
            if page.get_by_text("no settled batches yet").count() == 0 and page.get_by_text("loading").count() == 0:
                # If neither shows up, table might be silently empty
                rows = page.locator("tbody tr").count()
                finding.notes.append(f"INFO: table renders with {rows} body row(s); no empty/loading state visible")

        elif route == "recipient":
            for sel, label in [
                ('input[placeholder*="recipient"]', "wallet input"),
                ('button:has-text("Search")', "search button"),
            ]:
                if page.locator(sel).count() == 0:
                    finding.notes.append(f"MISSING: {label} ({sel})")
            # Enter a known address (the deployer) and search
            try:
                page.locator('input[placeholder*="recipient"]').fill("0x27f8c09a134037380a0164797e54f9B32B9fC6e2")
                page.locator('button:has-text("Search")').click()
                page.wait_for_timeout(2_000)
                finding.interactions.append({"search_known_address": "submitted"})
                page.screenshot(path=str(OUT / f"{viewport}_recipient_after_search.png"), full_page=True)
            except Exception as e:
                finding.notes.append(f"search interaction failed: {e}")

    except Exception as e:
        finding.notes.append(f"smoke-check exception: {e}")

    page.close()
    return finding


def main() -> None:
    findings: list[RouteFinding] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for vp_name, vp in VIEWPORTS.items():
            ctx = browser.new_context(viewport=vp, ignore_https_errors=True)
            for route, path in ROUTES:
                f = visit(ctx, route, path, vp_name)
                findings.append(f)
                print(f"  {vp_name:8s} {path:14s} → status={f.status_code} "
                      f"errs={len(f.console_errors)} pageerrs={len(f.page_errors)} "
                      f"fails={len(f.failed_responses)} notes={len(f.notes)}")
            ctx.close()
        browser.close()

    # Write raw json
    (OUT / "raw.json").write_text(json.dumps([asdict(f) for f in findings], indent=2))

    # Build markdown report
    lines: list[str] = []
    lines.append("# Conduit dashboard — bug-hunt report\n")
    lines.append(f"Dashboard: `{DASHBOARD_URL}`  ·  Indexer: `{INDEXER_URL}`\n")
    lines.append(f"Routes tested: {len(ROUTES)} × {len(VIEWPORTS)} viewports = {len(findings)} runs\n")
    lines.append("\n---\n")

    # Aggregate summary
    total_console_errors = sum(len(f.console_errors) for f in findings)
    total_page_errors = sum(len(f.page_errors) for f in findings)
    total_failed_resp = sum(len(f.failed_responses) for f in findings)
    total_notes = sum(len(f.notes) for f in findings)
    lines.append(f"\n## Summary\n")
    lines.append(f"- console errors:   **{total_console_errors}**")
    lines.append(f"- page JS errors:   **{total_page_errors}**")
    lines.append(f"- HTTP ≥400 resps:  **{total_failed_resp}**")
    lines.append(f"- notes / findings: **{total_notes}**\n")

    for f in findings:
        lines.append(f"\n---\n\n## `{f.path}` — {f.viewport}\n")
        lines.append(f"- status: `{f.status_code}`  ·  load: `{f.load_time_ms}ms`  ·  screenshot: `{f.screenshot}`\n")
        if f.notes:
            lines.append("**Findings:**")
            for n in f.notes:
                lines.append(f"  - {n}")
        if f.interactions:
            lines.append("**Interactions:**")
            for i in f.interactions:
                lines.append(f"  - {i}")
        if f.console_errors:
            lines.append(f"\n**Console errors ({len(f.console_errors)}):**")
            for e in f.console_errors[:8]:
                lines.append(f"  - `{e[:300]}`")
        if f.page_errors:
            lines.append(f"\n**Page JS errors ({len(f.page_errors)}):**")
            for e in f.page_errors[:5]:
                lines.append("```\n" + e[:600] + "\n```")
        if f.failed_responses:
            lines.append(f"\n**Failed responses ({len(f.failed_responses)}):**")
            for r in f.failed_responses[:8]:
                lines.append(f"  - `{r['status']}` `{r['url'][:120]}`  body: `{(r['body_preview'] or '')[:150]}`")
        if f.failed_requests:
            lines.append(f"\n**Failed requests ({len(f.failed_requests)}):**")
            for r in f.failed_requests[:8]:
                lines.append(f"  - `{r['method']}` `{r['url'][:120]}`  failure: `{r['failure']}`")
        if f.console_warnings:
            lines.append(f"\n**Console warnings ({len(f.console_warnings)}):** (showing first 5)")
            for w in f.console_warnings[:5]:
                lines.append(f"  - `{w[:200]}`")

    (OUT / "report.md").write_text("\n".join(lines) + "\n")
    print(f"\nReport: {OUT}/report.md")
    print(f"Screenshots in: {OUT}/")


if __name__ == "__main__":
    main()
