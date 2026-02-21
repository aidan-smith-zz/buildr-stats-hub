"use client";

import Link from "next/link";
import { useState } from "react";
import { NavigationLoadingOverlay } from "./navigation-loading-overlay";

type Props = {
  href: string;
  children: React.ReactNode;
  className?: string;
};

export function FixtureRowLink({ href, children, className }: Props) {
  const [isNavigating, setIsNavigating] = useState(false);

  return (
    <li className="relative">
      <Link
        href={href}
        className={className}
        onClick={() => setIsNavigating(true)}
        aria-busy={isNavigating}
      >
        {children}
      </Link>
      {isNavigating && <NavigationLoadingOverlay />}
    </li>
  );
}

/** Link that shows the "Building your Stats" loading overlay when navigating to fixture stats (e.g. Explore more CTAs). */
export function FixtureStatsLink({ href, children, className }: Props) {
  const [isNavigating, setIsNavigating] = useState(false);

  return (
    <span className="relative inline-block">
      <Link
        href={href}
        className={className}
        onClick={() => setIsNavigating(true)}
        aria-busy={isNavigating}
      >
        {children}
      </Link>
      {isNavigating && (
        <NavigationLoadingOverlay message="Building your Stats" italic />
      )}
    </span>
  );
}
