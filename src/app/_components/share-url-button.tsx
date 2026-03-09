"use client";

import { useState } from "react";

type Label = "Share" | "Copied!" | "Shared!";

export function copyToClipboard(text: string): boolean {
  if (!text || typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to execCommand fallback
    }
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function ShareUrlButton({
  className = "",
  title: shareTitle,
  text: shareText,
}: {
  className?: string;
  /** Optional title for native share (e.g. "Premier League stats | statsBuildr"). */
  title?: string;
  /** Optional description for native share. */
  text?: string;
}) {
  const [label, setLabel] = useState<Label>("Share");

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (!url) {
      setLabel("Share");
      return;
    }
    const title = shareTitle ?? "statsBuildr";
    const text = shareText ?? "Check out this page on statsBuildr.";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, url, text });
        setLabel("Shared!");
      } else {
        const copied = copyToClipboard(url);
        setLabel(copied ? "Copied!" : "Share");
      }
    } catch {
      const copied = copyToClipboard(url);
      setLabel(copied ? "Copied!" : "Share");
    }
    setTimeout(() => setLabel("Share"), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className={className}
    >
      {label}
    </button>
  );
}
