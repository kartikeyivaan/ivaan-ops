import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { processTaskReminders, processPiCreditReminders } = vi.hoisted(() => ({
  processTaskReminders: vi.fn(async () => ({ processed: 1 })),
  processPiCreditReminders: vi.fn(async () => ({ processed: 1 })),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/task-service", () => ({ processTaskReminders }));
vi.mock("@/lib/pi-credit-service", () => ({ processPiCreditReminders }));

import { GET as taskGET } from "@/app/api/cron/task-reminders/route";
import { GET as piGET } from "@/app/api/cron/pi-credit-reminders/route";

const SECRET = "test-cron-secret";
const routes = [
  { name: "task-reminders", GET: taskGET, job: processTaskReminders },
  { name: "pi-credit-reminders", GET: piGET, job: processPiCreditReminders },
];

function req(auth?: string) {
  const headers: Record<string, string> = {};
  if (auth !== undefined) headers.authorization = auth;
  return new Request("http://localhost/api/cron/x", { headers });
}

describe.each(routes)("cron route $name", ({ GET, job }) => {
  let original: string | undefined;
  beforeEach(() => {
    original = process.env.CRON_SECRET;
    job.mockClear();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("returns 500 and does not run the job when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "CRON_SECRET is not configured" });
    expect(job).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is empty", async () => {
    process.env.CRON_SECRET = "";
    const res = await GET(req("Bearer "));
    expect(res.status).toBe(500);
    expect(job).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong token and does not run the job", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await GET(req("Bearer wrong-token"));
    expect(res.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header is missing", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("returns 401 for a token that is a prefix of the secret", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await GET(req(`Bearer ${SECRET.slice(0, 5)}`));
    expect(res.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("does not return 401 for the correct token and runs the job", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
    expect(job).toHaveBeenCalledTimes(1);
  });
});
