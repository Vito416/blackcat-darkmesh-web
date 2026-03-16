#!/usr/bin/env bash
# Placeholder: pull envelopes from Worker inbox and store locally.

WORKER_INBOX_URL="${WORKER_INBOX_URL:-https://worker.example.com/inbox}"
DEST="${DEST:-./data/inbox.ndjson}"

curl -s "$WORKER_INBOX_URL" > "$DEST"
echo "Saved inbox to $DEST (decrypt & delete-on-download to be implemented)."
