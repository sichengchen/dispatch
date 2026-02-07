/* global console */
const path = require("path");
const fs = require("fs");

/**
 * electron-builder excludes node_modules/ from extraResources due to
 * .gitignore rules. This afterPack hook copies server-dist/node_modules
 * into the packaged app so the bundled server can resolve its dependencies.
 */
exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context;

  let resourcesDir;
  if (electronPlatformName === "darwin") {
    const appName = context.packager.appInfo.productFilename;
    resourcesDir = path.join(appOutDir, `${appName}.app`, "Contents", "Resources");
  } else {
    resourcesDir = path.join(appOutDir, "resources");
  }

  const src = path.join(context.packager.projectDir, "server-dist", "node_modules");
  const dest = path.join(resourcesDir, "server-dist", "node_modules");

  if (!fs.existsSync(src)) {
    console.log("afterPack: server-dist/node_modules not found, skipping");
    return;
  }

  if (fs.existsSync(dest)) {
    console.log("afterPack: server-dist/node_modules already present, skipping");
    return;
  }

  console.log(`afterPack: copying server node_modules to ${dest}`);
  fs.cpSync(src, dest, { recursive: true, verbatimSymlinks: false, dereference: true });
};
