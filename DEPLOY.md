# Deploying

1. `wrangler deploy`.

   The three custom hostnames are declared as `[[routes]]` entries in
   `wrangler.toml` with `custom_domain = true`, so a plain `wrangler
   deploy` provisions the DNS record and TLS certificate for each one
   automatically (no manual DNS edits, no separate API calls needed) —
   matching how the account's other `*.dosanjhlabs.com` subdomains are set
   up. Adding a fourth domain later is just another `[[routes]]` block.

   (The Cloudflare API token used for this needs Workers Scripts edit
   access; it does **not** need — and in practice may not have — direct
   `zone.dns_records` or `workers.domains` edit scope, since `wrangler
   deploy` provisions custom domains through a different path than calling
   those endpoints directly.)

2. Verify all three domains serve isolated content:

   ```sh
   curl -s https://sggs.dosanjhlabs.com/api/hukamnama | jq .source       # -> "aad"
   curl -s https://dasam.dosanjhlabs.com/api/hukamnama | jq .source      # -> "dasam" or "sarbloh"
   curl -s https://hukamnama.dosanjhlabs.com/api/hukamnama | jq .source  # -> any of the three
   ```

## iOS Shortcuts

See the "iOS Shortcuts" section in `README.md` for step-by-step setup —
point each Shortcut at its own domain's `/text` endpoint (or the page
itself via "Get Contents of Webpage" + "Get Text from Input") rather than
a shared URL, since routing is server-side by hostname with no shared
client state to leak the wrong granth onto the wrong Shortcut.
