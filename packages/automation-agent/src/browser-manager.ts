import { mkdir } from "fs/promises";
import { chromium, type BrowserContext } from "playwright";
import { createInterface } from "readline";
import type { AgentConfig } from "./config.js";
import { getProfileDir } from "./config.js";
import type { PortalCode } from "./constants.js";
import { applyBundledPlaywrightEnv } from "./playwright-env.js";

export type BrowserManagerOptions = {
  /** When set (desktop app), skip terminal Enter prompt for portal login. */
  waitForLogin?: (portal: PortalCode) => Promise<void>;
};

export class BrowserManager {
  private contexts = new Map<PortalCode, BrowserContext>();

  constructor(
    private config: AgentConfig,
    private options: BrowserManagerOptions = {},
  ) {}

  async openPortal(portal: PortalCode): Promise<void> {
    if (this.contexts.has(portal)) return;

    const profileDir = getProfileDir(portal);
    await mkdir(profileDir, { recursive: true });

    applyBundledPlaywrightEnv();

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 900 },
      args: ["--disable-blink-features=AutomationControlled"],
    });

    const url = this.config.portals?.[portal];
    const page = context.pages()[0] ?? (await context.newPage());
    if (url) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
    } else {
      await page.setContent(
        `<html><body style="font-family:sans-serif;padding:2rem"><h1>Ivaan Ops — ${portal} portal</h1><p>Set portals.${portal} in config.json or navigate manually.</p></body></html>`,
      );
    }

    this.contexts.set(portal, context);
    await this.waitForManualLogin(portal);
  }

  getContext(portal: PortalCode): BrowserContext {
    const context = this.contexts.get(portal);
    if (!context) throw new Error(`Portal ${portal} is not open.`);
    return context;
  }

  private async waitForManualLogin(portal: PortalCode): Promise<void> {
    console.log(`\n[${portal}] Log in to the DCR portal (OTP/CAPTCHA as required).`);
    if (this.options.waitForLogin) {
      await this.options.waitForLogin(portal);
      return;
    }
    await new Promise<void>((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`Press Enter when ${portal} login is complete… `, () => {
        rl.close();
        resolve();
      });
    });
  }

  async closeAll(): Promise<void> {
    for (const context of this.contexts.values()) {
      await context.close();
    }
    this.contexts.clear();
  }
}
