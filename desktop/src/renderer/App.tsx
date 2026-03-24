import React from "react";

export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1>Blackcat Desktop</h1>
      <p>Skeleton ready for:</p>
      <ol>
        <li>Page builder (shared blocks from blackcat-darkmesh-web)</li>
        <li>Offline storage (SQLite/CRDT) for drafts</li>
        <li>Deploy to AO via @permaweb/aoconnect</li>
        <li>Sync / export bundles</li>
      </ol>
      <p style={{ color: "#666" }}>
        Replace this screen with the real editor UI; wire IPC for filesystem and deploy actions.
      </p>
    </div>
  );
}
