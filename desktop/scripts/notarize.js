/**
 * Optional macOS notarization hook for electron-builder.
 *
 * Runs only when:
 *  - platform is darwin
 *  - APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID are present
 *
 * Keep this lightweight: if credentials are absent we log and exit silently so
 * local builds and CI dry runs keep working.
 */
const path = require("path");

module.exports = async function notarizeHook(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== "darwin") {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleAppPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleAppPassword || !teamId) {
    console.log("[notarize] Skipping notarization (missing Apple credentials)");
    return;
  }

  let notarize;
  try {
    // Lazy load to avoid dependency cost for non-mac builds.
    ({ notarize } = require("electron-notarize"));
  } catch (err) {
    console.warn("[notarize] electron-notarize not installed; skipping", err?.message || err);
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`[notarize] Submitting ${appName} for notarization`);
  await notarize({
    appBundleId: packager.appInfo.appId,
    appPath,
    appleId,
    appleIdPassword: appleAppPassword,
    teamId,
    ascProvider: process.env.APPLE_ASC_PROVIDER,
  });
  console.log("[notarize] Notarization request sent");
};
