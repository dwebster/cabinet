"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Heart } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Bump when the disclaimer text materially changes — older acks become
// invalid and the user gets re-prompted with the new copy. The literal
// suffix is preserved (`:v2`) so existing users' acks aren't wiped.
const DISCLAIMER_VERSION = "v2";
const STORAGE_KEY = `cabinet.breaking-changes-warning-ack:${DISCLAIMER_VERSION}`;
const SERVER_ENDPOINT = "/api/disclaimer";

// Fired after the user explicitly accepts the disclaimer. Other surfaces
// (e.g. the tour auto-open) listen for this so they can sequence behind the
// disclaimer instead of stacking on top of it.
export const DISCLAIMER_ACKED_EVENT = "cabinet:disclaimer-acked";

export function isDisclaimerAcknowledged(): boolean {
  // Synchronous check for callers that need an immediate answer (e.g. the
  // tour-gate in app-shell). Server-side state is mirrored to localStorage
  // by the dialog component on mount, so this stays the source of truth
  // for downstream consumers.
  if (typeof window === "undefined") return false;
  try {
    return !!window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode); fail open so we don't block the
    // rest of the app forever on a check we can't perform.
    return true;
  }
}

export function BreakingChangesWarning() {
  const [open, setOpen] = useState(false);
  // Audit #109: explicit checkbox separates "I read this" from "click the
  // big button" so users don't dismiss by reflex.
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    let local: string | null = null;
    try {
      local = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (private mode, SSR); fall through to server
    }

    if (local) return;

    // No local ack — check server before showing. Survives browser-storage
    // clears, browser switches on the same install, and "Forget this site"
    // accidents. A server miss (404/500/network) falls back to "show the
    // disclaimer" — never silently skip it.
    void fetch(`${SERVER_ENDPOINT}?v=${DISCLAIMER_VERSION}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setOpen(true);
          return;
        }
        const data = (await res.json()) as { acked?: boolean; acceptedAt?: string };
        if (data.acked) {
          // Mirror to localStorage so future loads are sync-fast; also tell
          // the tour gate it can proceed (otherwise it would still wait
          // forever on a missing local ack).
          try {
            localStorage.setItem(
              STORAGE_KEY,
              data.acceptedAt || new Date().toISOString(),
            );
          } catch {
            /* ignore */
          }
          window.dispatchEvent(new CustomEvent(DISCLAIMER_ACKED_EVENT));
        } else {
          setOpen(true);
        }
      })
      .catch(() => {
        if (!cancelled) setOpen(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const acknowledge = () => {
    const acceptedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, acceptedAt);
    } catch {
      // noop
    }
    // Fire-and-forget: the server-side persistence is a backup so future
    // "I cleared my browser storage" reloads stay quiet; the local ack is
    // the source of truth for *this* session, so we don't block UX on it.
    void fetch(SERVER_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: DISCLAIMER_VERSION, acceptedAt }),
    }).catch(() => {
      /* server unreachable — local ack still holds */
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(DISCLAIMER_ACKED_EVENT));
    }
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v, details) => {
        if (v) return;
        // Esc and outside clicks must not auto-accept the legal disclaimer;
        // acceptance has to be a deliberate click on "I understand, continue"
        // (or the X). Reasons we ignore: "escape-key", "outside-press".
        const reason = details?.reason;
        if (reason === "escape-key" || reason === "outside-press") {
          details?.cancel?.();
          return;
        }
        acknowledge();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Heads up
          </DialogTitle>
        </DialogHeader>
        {/* Audit #109: replaced a 200-word, 5-paragraph wall with a one-line
            lede + 3 bullets + a footer ToS/Privacy link. The mandatory
            checkbox below the bullets makes acceptance a deliberate act,
            not a click-through reflex. */}
        <div className="space-y-4 text-sm text-muted-foreground">
          <p className="text-foreground">
            Cabinet runs AI agents that can read, modify, and delete your
            files. By using it you accept that risk.
          </p>
          <ul className="space-y-2 pl-1">
            <li className="flex gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
              <span>
                <strong className="text-foreground">Alpha software.</strong>{" "}
                Active development with breaking changes possible without
                notice.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
              <span>
                <strong className="text-foreground">Agents have filesystem access.</strong>{" "}
                They run with elevated permissions and can touch your KB and
                any linked repos. Back up what you care about.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
              <span>
                <strong className="text-foreground">AI provider terms apply.</strong>{" "}
                Data you send to Claude / OpenAI / etc. is governed by their
                terms, not Cabinet&apos;s.
              </span>
            </li>
          </ul>
          <label className="flex items-start gap-2 pt-1 text-foreground">
            <input
              type="checkbox"
              name="disclaimer-accept"
              aria-label="I have read and I accept"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border border-border accent-foreground"
            />
            <span>I have read and I accept.</span>
          </label>
        </div>
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-[11px] text-muted-foreground/80">
            By continuing you agree to our{" "}
            <a
              href="https://runcabinet.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href="https://runcabinet.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Privacy
            </a>
            .
          </p>
          <Button onClick={acknowledge} disabled={!accepted}>
            Continue
          </Button>
        </div>
        <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground/70">
          Thanks for being here{" "}
          <Heart className="h-3 w-3 inline text-rose-500" fill="currentColor" />
        </p>
      </DialogContent>
    </Dialog>
  );
}
