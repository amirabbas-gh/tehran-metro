import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));

function readPackageVersion(): string {
  const pkg = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf-8")
  ) as { version: string };
  return pkg.version;
}

function readManifestBase(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(root, "public/manifest.webmanifest"), "utf-8")
  ) as Record<string, unknown>;
}

/** Inject package.json version into /manifest.webmanifest (dev + build). */
function manifestVersionPlugin(): Plugin {
  const buildBody = () =>
    `${JSON.stringify(
      { ...readManifestBase(), version: readPackageVersion() },
      null,
      2
    )}\n`;

  return {
    name: "manifest-version",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== "/manifest.webmanifest") {
          next();
          return;
        }
        res.setHeader("Content-Type", "application/manifest+json");
        res.end(buildBody());
      });
    },
    closeBundle() {
      writeFileSync(
        resolve(root, "dist/manifest.webmanifest"),
        buildBody(),
        "utf-8"
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), manifestVersionPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(readPackageVersion()),
  },
});
