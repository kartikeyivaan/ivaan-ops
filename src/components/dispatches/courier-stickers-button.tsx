"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { COURIER_STICKER_MAX_BOXES } from "@/lib/courier-sticker-constants";
import { cn } from "@/lib/utils";

export type CourierToDefaults = {
  firmName: string;
  contactName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
  phone?: string | null;
};

type ToFormState = {
  firmName: string;
  contactName: string;
  address: string;
  phone: string;
};

function buildDefaultAddress(to: CourierToDefaults): string {
  const lines: string[] = [];
  if (to.address) {
    for (const line of to.address.split("\n")) {
      if (line.trim()) lines.push(line.trim());
    }
  }
  const locality = [to.city, to.state].filter(Boolean).join(", ");
  const withPin = [locality, to.pinCode?.trim()].filter(Boolean).join(" ");
  if (withPin) lines.push(withPin);
  return lines.join("\n");
}

function toFormFromDefaults(to?: CourierToDefaults | null): ToFormState {
  return {
    firmName: to?.firmName?.trim() || "",
    contactName: to?.contactName?.trim() || "",
    address: to ? buildDefaultAddress(to) : "",
    phone: to?.phone?.trim() || "",
  };
}

type CourierStickersButtonProps = {
  dispatchId: string;
  dcNo: string;
  /** Prefills editable TO fields on the sticker dialog. */
  toDefaults?: CourierToDefaults | null;
  size?: "default" | "sm";
  className?: string;
};

export function CourierStickersButton({
  dispatchId,
  dcNo,
  toDefaults,
  size = "sm",
  className,
}: CourierStickersButtonProps) {
  const [open, setOpen] = useState(false);
  const [boxes, setBoxes] = useState("10");
  const [toForm, setToForm] = useState<ToFormState>(() => toFormFromDefaults(toDefaults));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function openModal() {
    setBoxes("10");
    setToForm(toFormFromDefaults(toDefaults));
    setError("");
    setOpen(true);
  }

  function close() {
    if (loading) return;
    setOpen(false);
    setError("");
  }

  async function downloadStickers() {
    const count = Number(boxes);
    if (!Number.isInteger(count) || count < 1 || count > COURIER_STICKER_MAX_BOXES) {
      setError(`Enter a whole number between 1 and ${COURIER_STICKER_MAX_BOXES}.`);
      return;
    }
    if (!toForm.firmName.trim()) {
      setError("Firm name is required for the TO section.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dispatches/${dispatchId}/courier-stickers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boxes: count,
          to: {
            firmName: toForm.firmName.trim(),
            contactName: toForm.contactName.trim() || null,
            address: toForm.address.trim() || null,
            phone: toForm.phone.trim() || null,
          },
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(data?.message ?? "Unable to generate courier stickers.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${dcNo}-courier-stickers-${count}boxes.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch {
      setError("Unable to generate courier stickers.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={className}
        onClick={openModal}
      >
        <Package className="h-4 w-4" />
        Dispatch via Courier
      </Button>

      {open ? (
        <Modal onClose={close} size="md">
          <ModalHeader
            title="Dispatch via Courier"
            description={`Print box stickers for ${dcNo}. Edit TO details if the courier label needs a different address.`}
            onClose={close}
          />
          <ModalBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="courier-box-count">Number of boxes</Label>
              <Input
                id="courier-box-count"
                type="number"
                min={1}
                max={COURIER_STICKER_MAX_BOXES}
                step={1}
                value={boxes}
                onChange={(event) => setBoxes(event.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">TO details</p>
              <div className="space-y-2">
                <Label htmlFor="courier-firm-name">Firm name</Label>
                <Input
                  id="courier-firm-name"
                  value={toForm.firmName}
                  onChange={(event) =>
                    setToForm((prev) => ({ ...prev, firmName: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="courier-contact-name">Contact person</Label>
                <Input
                  id="courier-contact-name"
                  value={toForm.contactName}
                  onChange={(event) =>
                    setToForm((prev) => ({ ...prev, contactName: event.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="courier-address">Address</Label>
                <textarea
                  id="courier-address"
                  rows={4}
                  value={toForm.address}
                  onChange={(event) =>
                    setToForm((prev) => ({ ...prev, address: event.target.value }))
                  }
                  className={cn(
                    "flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ring-offset-white",
                    "placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                    "disabled:cursor-not-allowed disabled:opacity-50 max-md:text-base",
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="courier-phone">Phone</Label>
                <Input
                  id="courier-phone"
                  value={toForm.phone}
                  onChange={(event) =>
                    setToForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                />
              </div>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={close} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" disabled={loading} onClick={() => void downloadStickers()}>
              {loading ? "Generating…" : "Download stickers PDF"}
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
}
