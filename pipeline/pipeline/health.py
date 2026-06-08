"""Scrape pipeline health check.

Queries `scrape_runs` for the latest run per source and flags anything that:
- ended in status='failed' on the last attempt
- has been running >2h without finishing (stuck)
- has no successful run in the last 8 days (cron missing or VPS down)

Optionally pings a webhook (ntfy.sh / Slack / Discord auto-detected) via
ALERT_WEBHOOK_URL env var. Always prints to stdout for journald capture.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from .db import connect

STALE_THRESHOLD = timedelta(days=8)
STUCK_THRESHOLD = timedelta(hours=2)


@dataclass(frozen=True)
class Issue:
    source: str
    kind: str
    detail: str

    def __str__(self) -> str:
        return f"[{self.kind}] {self.source}: {self.detail}"


def check() -> list[Issue]:
    """Return list of issues. Empty list = healthy."""
    issues: list[Issue] = []
    now = datetime.now(timezone.utc)

    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (source)
                   source, status, started_at, finished_at, error_message
              FROM scrape_runs
             ORDER BY source, started_at DESC
            """
        )
        rows = cur.fetchall()

    if not rows:
        issues.append(Issue(source="*", kind="no_runs", detail="scrape_runs is empty — no scraper has ever run"))
        return issues

    for source, status, started_at, finished_at, error in rows:
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)

        if status == "failed":
            issues.append(
                Issue(
                    source=source,
                    kind="last_run_failed",
                    detail=f"started {started_at.isoformat()} — {error or 'no error message'}",
                )
            )
        elif status == "running":
            age = now - started_at
            if age > STUCK_THRESHOLD:
                issues.append(
                    Issue(
                        source=source,
                        kind="stuck_running",
                        detail=f"started {started_at.isoformat()} ({age} ago) and never finished",
                    )
                )
        elif status in ("success", "no_change"):
            age = now - started_at
            if age > STALE_THRESHOLD:
                issues.append(
                    Issue(
                        source=source,
                        kind="stale",
                        detail=f"last successful run {started_at.isoformat()} ({age.days} days ago)",
                    )
                )
        else:
            issues.append(
                Issue(
                    source=source,
                    kind="unknown_status",
                    detail=f"unexpected status '{status}' at {started_at.isoformat()}",
                )
            )

    return issues


def send_webhook(text: str, webhook_url: str) -> None:
    """Post the alert text to a webhook. Auto-detects ntfy / Slack / Discord."""
    import requests

    if "ntfy.sh" in webhook_url or "ntfy.io" in webhook_url:
        requests.post(
            webhook_url,
            data=text.encode("utf-8"),
            headers={"Title": "renov health alert", "Priority": "default", "Tags": "warning"},
            timeout=10,
        )
    elif "slack.com" in webhook_url or "hooks.slack" in webhook_url:
        requests.post(webhook_url, json={"text": text}, timeout=10)
    elif "discord.com" in webhook_url or "discordapp.com" in webhook_url:
        requests.post(webhook_url, json={"content": text}, timeout=10)
    else:
        requests.post(webhook_url, json={"text": text, "content": text}, timeout=10)


def report() -> tuple[bool, str]:
    """Run the check, optionally ping a webhook, return (healthy, text)."""
    issues = check()
    healthy = not issues
    if healthy:
        text = "OK — all scrapers healthy"
    else:
        lines = [f"renov health check found {len(issues)} issue(s):", ""]
        lines.extend(str(i) for i in issues)
        text = "\n".join(lines)

    webhook = os.environ.get("ALERT_WEBHOOK_URL")
    if not healthy and webhook:
        try:
            send_webhook(text, webhook)
        except Exception as e:  # noqa: BLE001 — never raise from a health checker
            text += f"\n\n[webhook delivery failed: {e}]"

    return healthy, text
