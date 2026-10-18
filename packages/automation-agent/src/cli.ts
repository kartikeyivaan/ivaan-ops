#!/usr/bin/env node
import { loadConfigResolved } from "./config.js";
import { runAgentLoop } from "./runner.js";
import { pairDevice } from "./pairing.js";

function parseArgs(argv: string[]) {
  const args = [...argv];
  const command = args.shift() ?? "serve";
  const flags: Record<string, string> = {};
  while (args.length) {
    const key = args.shift();
    if (!key?.startsWith("--")) continue;
    const name = key.slice(2);
    const value = args[0]?.startsWith("--") ? "true" : args.shift();
    if (value !== undefined) flags[name] = value;
  }
  return { command, flags };
}

async function pair(flags: Record<string, string>) {
  const baseUrl = flags.url ?? flags.baseUrl ?? process.env.IVAAN_OPS_API_URL ?? "http://localhost:3000";
  const code = flags.code ?? flags.pairingCode;
  if (!code) {
    console.error("Usage: pair --code 123456 [--url https://ops.example.com] [--label \"Office PC\"]");
    process.exit(1);
  }

  await pairDevice({ pairingCode: code, baseUrl, label: flags.label });
  console.log("Device paired successfully.");
  console.log(`Config saved. Run: npm run serve (in packages/automation-agent)`);
}

async function serve() {
  const config = await loadConfigResolved();
  if (!config?.deviceId || !config.deviceSecret) {
    console.error("No paired device. Run: npm run pair -- --code <pairing-code> --url <ivaan-ops-url>");
    process.exit(1);
  }
  if (process.env.AUTOMATION_STUB_MODE === "fail") {
    config.stubMode = "fail";
  }
  await runAgentLoop(config);
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === "pair") {
    await pair(flags);
    return;
  }
  if (command === "serve" || command === "start") {
    await serve();
    return;
  }
  console.log("Commands: pair | serve");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
