<?php
// Minimal admin console bootstrap (skeleton)
$config = require __DIR__ . '/config.php';

?><!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Darkmesh Admin Console</title>
  <link rel="stylesheet" href="/assets/tailwind.css">
</head>
<body class="bg-slate-950 text-slate-50">
  <main class="max-w-5xl mx-auto p-6 space-y-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">Darkmesh Admin Console</h1>
        <p class="text-sm text-slate-400">Templates, Inbox Sync, Monitoring</p>
      </div>
      <button class="px-3 py-2 rounded bg-emerald-600 text-white">Sync Inbox</button>
    </header>

    <section>
      <h2 class="text-lg font-medium mb-2">Template</h2>
      <div class="p-4 border border-slate-700 rounded">
        <p class="text-sm text-slate-300">Manifest: <?= htmlspecialchars($config['template_manifest']) ?></p>
        <button class="mt-2 px-3 py-2 rounded bg-blue-600 text-white">Fetch & Verify</button>
      </div>
    </section>

    <section>
      <h2 class="text-lg font-medium mb-2">Monitoring (placeholder)</h2>
      <div class="p-4 border border-slate-700 rounded">
        <p class="text-sm text-slate-300">Pull metrics from Gateway: <?= htmlspecialchars($config['gateway_api']) ?>/metrics</p>
      </div>
    </section>
  </main>
</body>
</html>
