<?php
// Admin console configuration (example)
return [
    'gateway_api' => 'https://gateway.example.com',
    'worker_inbox' => 'https://worker.example.com/inbox',
    'worker_notify' => 'https://worker.example.com/notify',
    'ao_read' => 'https://ao-read.example.com',
    'ao_write' => 'https://ao-write.example.com',
    'public_key_txid' => 'arweave_public_key_txid',
    'template_manifest' => 'https://arweave.net/manifest.json',
    // Local encrypted DB path
    'data_path' => __DIR__ . '/../data/offline.db',
];
