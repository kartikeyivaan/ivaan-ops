import { describe, expect, it } from "vitest";
import {
  buildServiceRequestWhatsappMessage,
  formatWhatsappContactDisplay,
} from "@/lib/whatsapp";
import {
  buildServiceRequestWhatsappUrl,
  resolveServiceExecutiveMobile,
} from "@/lib/service-share";

describe("service request whatsapp share", () => {
  it("formats the customer-facing raised-request message", () => {
    const message = buildServiceRequestWhatsappMessage({
      customerName: "Rahul Sharma",
      serviceRequestNumber: "ISE-SRV-2526-00012",
      executiveName: "Amit Patil",
      executiveMobile: "9876543210",
    });

    expect(message).toBe(
      "Hi Rahul Sharma, your service request ISE-SRV-2526-00012 has been raised. " +
        "The service executive Amit Patil (Mobile: 9876543210) will visit in 1-2 days. " +
        "— Ivaan Solar Energy",
    );
  });

  it("prefers official contact number for the executive", () => {
    expect(
      resolveServiceExecutiveMobile({
        name: "Amit Patil",
        mobile: "9111111111",
        officialContactNumber: "9876543210",
      }),
    ).toBe("9876543210");
  });

  it("builds a wa.me url when customer and executive contacts exist", () => {
    const url = buildServiceRequestWhatsappUrl({
      customerName: "Rahul Sharma",
      mobileNumber: "9123456780",
      serviceRequestNumber: "ISE-SRV-2526-00012",
      assignedTo: {
        name: "Amit Patil",
        officialContactNumber: "9876543210",
      },
    });

    expect(url).toMatch(/^https:\/\/wa\.me\/919123456780\?text=/);
    const text = decodeURIComponent(new URL(url!).searchParams.get("text")!);
    expect(text).toContain("Amit Patil");
    expect(text).toContain("9876543210");
    expect(text).toContain("1-2 days");
  });

  it("returns null when the executive has no contact number", () => {
    expect(
      buildServiceRequestWhatsappUrl({
        customerName: "Rahul Sharma",
        mobileNumber: "9123456780",
        serviceRequestNumber: "ISE-SRV-2526-00012",
        assignedTo: { name: "Amit Patil", mobile: null },
      }),
    ).toBeNull();
  });

  it("formats country-coded mobiles for display", () => {
    expect(formatWhatsappContactDisplay("919876543210")).toBe("9876543210");
  });
});
