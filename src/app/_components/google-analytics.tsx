"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void;
  }
}

export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", {
      page_path: pathname ?? "/",
      page_title: document.title,
    });
  }, [pathname]);

  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
