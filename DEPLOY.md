# Deploying

1. `wrangler deploy` (creates/updates the `hukamnama` Worker).
2. Attach both custom hostnames to that Worker — either in the Cloudflare
   dashboard (Workers & Pages → hukamnama → Settings → Domains & Routes →
   Add Custom Domain), or via the API:

   ```sh
   curl -X POST \
     "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/domains" \
     -H "Authorization: Bearer <API_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"hostname":"sggs.dosanjhlabs.com","service":"hukamnama","environment":"production","zone_id":"<ZONE_ID>"}'

   curl -X POST \
     "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/domains" \
     -H "Authorization: Bearer <API_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"hostname":"dasam.dosanjhlabs.com","service":"hukamnama","environment":"production","zone_id":"<ZONE_ID>"}'
   ```

   This provisions the DNS record and TLS certificate for each hostname
   automatically — no manual DNS edits needed, matching how the account's
   other `*.dosanjhlabs.com` subdomains are set up.

3. Verify both domains serve isolated content:

   ```sh
   curl -s https://sggs.dosanjhlabs.com/api/hukamnama | jq .source   # -> "aad"
   curl -s https://dasam.dosanjhlabs.com/api/hukamnama | jq .source  # -> "dasam" or "sarbloh"
   ```

## iOS Shortcuts

Point the "Get Contents of Webpage" step at `https://sggs.dosanjhlabs.com/`
or `https://dasam.dosanjhlabs.com/` directly (not a shared URL) — each now
serves a fully server-rendered page for its own granth only, so there's no
shared client-side state that can leak the other granth onto the wrong
Shortcut. For a plain-text automation without any HTML parsing, use
`https://sggs.dosanjhlabs.com/text` / `https://dasam.dosanjhlabs.com/text`
instead.
