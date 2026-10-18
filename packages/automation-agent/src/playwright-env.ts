import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** Use bundled Chromium when PLAYWRIGHT_BROWSERS_PATH is set (desktop installer). */
export function applyBundledPlaywrightEnv(): void {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return;

  const packagedBrowsers = resolvePackagedBrowsersDir();
  if (packagedBrowsers) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = packagedBrowsers;
  }
}

function resolvePackagedBrowsersDir(): string | null {
  const resourcesPath = process.env.IVAAN_AGENT_RESOURCES_PATH;
  if (resourcesPath) {
    return path.join(resourcesPath, "playwright-browsers");
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const devCandidate = path.join(here, "..", "playwright-browsers");
  if (existsSync(devCandidate)) return devCandidate;
  return null;
}
