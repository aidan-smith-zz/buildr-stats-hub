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
