// Launch Electron with a clean env so ELECTRON_RUN_AS_NODE never leaks.
const { spawn } = require("child_process");
const path = require("path");
const electron = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const mainPath = path.join(__dirname, "..", "dist", "desktop", "src", "main.js");
const child = spawn(electron, [mainPath], {
  stdio: "inherit",
  env,
});

child.on("exit", (code) => process.exit(code ?? 0));
