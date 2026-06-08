#!/usr/bin/env bash
# IndexNow ping for newly-surfaced URLs.
#
# Runs after the daily rebuild (indemnite-rebuild.service). Fetches the live
# sitemap, filters URLs whose <lastmod> equals today (UTC), and submits
# them to the IndexNow API. Bing, Yandex, DuckDuckGo, Seznam and Naver
# consume these pings and trigger fresh crawls within hours.
#
# Google does NOT consume IndexNow (as of late 2025) — it discovers via
# sitemap and crawl. This script complements, not replaces, the sitemap.
#
# Protocol: https://www.indexnow.org/documentation
#
# Failure modes:
#   - Cloudflare hasn't finished rebuilding when we hit the sitemap: we
#     retry up to 3 times with 60s spacing
#   - No URLs surfaced today: exit 0, log "nothing to ping"
#   - IndexNow API error: log and exit non-zero (systemd captures)

set -euo pipefail

KEY="33b7a5fe9fdca653d276366a5d3b653a"
HOST="calcul-indemnite.fr"
SITEMAP_URL="https://${HOST}/sitemap-0.xml"
KEY_LOCATION="https://${HOST}/${KEY}.txt"
INDEXNOW_ENDPOINT="https://api.indexnow.org/IndexNow"
TODAY=$(date -u +%Y-%m-%d)

# Wait a bit for Cloudflare rebuild to complete after the empty-commit push.
# The rebuild typically takes 60-120 seconds after push.
echo "Waiting 180s for Cloudflare rebuild to settle..."
sleep 180

# Fetch sitemap with retries (rebuild may still be in progress).
SITEMAP_XML=""
for attempt in 1 2 3; do
  echo "[attempt ${attempt}/3] Fetching sitemap..."
  if SITEMAP_XML=$(curl -fsSL --max-time 30 "${SITEMAP_URL}"); then
    break
  fi
  if [ "${attempt}" -lt 3 ]; then
    echo "Failed; retrying in 60s..."
    sleep 60
  else
    echo "ERROR: could not fetch sitemap after 3 attempts."
    exit 1
  fi
done

# Extract URLs whose <lastmod> starts with today's date (UTC).
# Astro's sitemap shim sets lastmod from each entry's datePublished/dateModified.
# A URL with lastmod=$TODAY just appeared in the sitemap (drip-published today).
# NB: each grep is wrapped in `|| true` so that a zero-match doesn't trip
# `set -e` and silently kill the script before the empty-URLS branch below
# has a chance to log "nothing to ping" and exit 0 cleanly.
URLS=$(echo "${SITEMAP_XML}" \
  | tr '\n' ' ' \
  | { grep -oE '<url>[^<]*<loc>[^<]+</loc>[^<]*<lastmod>'"${TODAY}"'[^<]*</lastmod>' || true; } \
  | { grep -oE '<loc>[^<]+</loc>' || true; } \
  | sed 's|<loc>||; s|</loc>||')

if [ -z "${URLS}" ]; then
  echo "No URLs with lastmod=${TODAY}. Nothing to ping IndexNow."
  exit 0
fi

URL_COUNT=$(echo "${URLS}" | wc -l)
echo "Found ${URL_COUNT} URL(s) with lastmod=${TODAY}:"
echo "${URLS}" | sed 's/^/  /'

# Build JSON payload. jq escapes URLs safely.
URL_JSON=$(echo "${URLS}" | jq -R . | jq -s .)
PAYLOAD=$(jq -n \
  --arg host "${HOST}" \
  --arg key "${KEY}" \
  --arg keyLocation "${KEY_LOCATION}" \
  --argjson urls "${URL_JSON}" \
  '{host: $host, key: $key, keyLocation: $keyLocation, urlList: $urls}')

echo "POSTing to IndexNow..."
HTTP_STATUS=$(curl -s -o /tmp/indexnow-response.txt -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "${PAYLOAD}" \
  "${INDEXNOW_ENDPOINT}")

echo "Response code: ${HTTP_STATUS}"
echo "Response body: $(cat /tmp/indexnow-response.txt)"

# IndexNow returns:
#   200: URLs received (no further validation done)
#   202: URLs received and key is being validated
#   400: bad request
#   403: key not found / invalid
#   422: URLs don't match host
#   429: too many requests
if [ "${HTTP_STATUS}" = "200" ] || [ "${HTTP_STATUS}" = "202" ]; then
  echo "OK — IndexNow accepted ${URL_COUNT} URL(s)."
  exit 0
else
  echo "ERROR: IndexNow returned HTTP ${HTTP_STATUS}."
  exit 1
fi
