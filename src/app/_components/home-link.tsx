"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavigationLoadingOverlay } from "./navigation-loading-overlay";

export function HomeLink() {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    if (pathname === "/") setIsNavigating(false);
  }, [pathname]);

  return (
    <>
      <Link
        href="/"
        className="flex items-center gap-2 transition-opacity hover:opacity-80 focus:opacity-80"
        aria-label="Back to home"
        onClick={() => setIsNavigating(true)}
        aria-busy={isNavigating}
      >
        <Image
          src="/logo.png"
          alt=""
          width={180}
          height={56}
          className="h-11 w-auto shrink-0 object-contain sm:h-12 dark:invert dark:[mix-blend-mode:screen]"
          priority
        />
        <span className="ml-2 shrink-0 text-lg font-medium tracking-tight text-neutral-800 dark:text-neutral-100 sm:text-xl">
          <b>stats</b>Buildr
        </span>
      </Link>
      {isNavigating && (
          <NavigationLoadingOverlay message="Building your Stats" italic />
        )}
    </>
  );
}
