# Security

## Reporting a vulnerability

Please report security problems privately, not in a public issue: open the repository's **Security** tab and choose
**Report a vulnerability**. Include what you found, how to reproduce it, and what it lets someone do.

## What Daybook protects, and what it does not

- Journals are stored in the browser's `localStorage` on the device, or, when Daybook runs inside Claude, in that
  account's storage. Daybook has no server of its own and sends journal content nowhere.
- The **PIN lock** is a privacy screen against someone glancing at an open browser. The PIN is stored as a SHA-256 hash.
  Journal text is **not encrypted**: anyone with access to the browser profile or its developer tools can read it.
- Backup files are plain JSON and are not encrypted. Keep them somewhere private.
- Restoring a backup validates it first and treats its content as untrusted data (it is never run as code or inserted
  as HTML). Details are in `CONTEXT.md`.
