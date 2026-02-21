"use client";

import { useState } from "react";

type Label = "Share" | "Copied!" | "Shared!";

export function ShareUrlButton({
  className = "",
}: {
  className?: string;
}) {
  const [label, setLabel] = useState<Label>("Share");

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = "AI Insights | statsBuildr";
    const text = "Check today's AI-powered fixture insights.";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, url, text });
        setLabel("Shared!");
      } else {
        await navigator.clipboard?.writeText(url);
        setLabel("Copied!");
      }
    } catch {
      try {
        await navigator.clipboard?.writeText(url);
        setLabel("Copied!");
      } catch {
        setLabel("Share");
      }
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
