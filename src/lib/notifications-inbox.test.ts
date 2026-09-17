import { describe, expect, it } from "vitest";
import {
  NOTIFICATIONS_MIN_GAP_MS,
  shouldFetchNotifications,
} from "@/lib/notifications-inbox";

describe("shouldFetchNotifications", () => {
  it("allows the first fetch when the tab is visible", () => {
    expect(
      shouldFetchNotifications({
        visible: true,
        inFlight: false,
        now: 1_000,
        lastFetchedAt: null,
      }),
    ).toBe(true);
  });

  it("pauses while the tab is hidden and skips in-flight or recent fetches", () => {
    expect(
      shouldFetchNotifications({
        visible: false,
        inFlight: false,
        now: 20_000,
        lastFetchedAt: null,
      }),
    ).toBe(false);

    expect(
      shouldFetchNotifications({
        visible: true,
        inFlight: true,
        now: 20_000,
        lastFetchedAt: null,
      }),
    ).toBe(false);

    expect(
      shouldFetchNotifications({
        visible: true,
        inFlight: false,
        now: 20_000,
        lastFetchedAt: 10_000,
      }),
    ).toBe(false);
  });

  it("refetches after the 15s gap, including when the tab becomes visible again", () => {
    expect(NOTIFICATIONS_MIN_GAP_MS).toBe(15_000);

    expect(
      shouldFetchNotifications({
        visible: true,
        inFlight: false,
        now: 30_000,
        lastFetchedAt: 10_000,
      }),
    ).toBe(true);

    expect(
      shouldFetchNotifications({
        visible: false,
        inFlight: false,
        now: 11_000,
        lastFetchedAt: 10_000,
        force: true,
      }),
    ).toBe(true);

    expect(
      shouldFetchNotifications({
        visible: true,
        inFlight: true,
        now: 30_000,
        lastFetchedAt: 10_000,
        force: true,
      }),
    ).toBe(false);
  });
});
