"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavigationLoadingOverlay } from "./navigation-loading-overlay";

type Props = {
  href: string;
  children: React.ReactNode;
  className?: string;
};

const DEFAULT_LOADING_MESSAGE = "Building your Stats";

export function FixtureRowLink({ href, children, className }: Props) {
  const [isNavigating, setIsNavigating] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) setIsNavigating(false);
  }, [pathname]);

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

/** Link that shows the loading overlay when navigating (e.g. Explore more CTAs). */
export function FixtureStatsLink({
  href,
  children,
  className,
  message = DEFAULT_LOADING_MESSAGE,
}: Props & { message?: string }) {
  const [isNavigating, setIsNavigating] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) setIsNavigating(false);
  }, [pathname]);

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
        <NavigationLoadingOverlay message={message} italic />
      )}
    </span>
  );
}

/** Wrapper for any Link that shows a full-screen loading overlay during navigation. Use for billboard CTAs. */
type NavLinkWithOverlayProps = Props & {
  message?: string;
  italic?: boolean;
};

export function NavLinkWithOverlay({
  href,
  children,
  className,
  message = DEFAULT_LOADING_MESSAGE,
  italic = true,
}: NavLinkWithOverlayProps) {
  const [isNavigating, setIsNavigating] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) setIsNavigating(false);
  }, [pathname]);

  return (
    <>
      <Link
        href={href}
        className={className}
        onClick={() => setIsNavigating(true)}
        aria-busy={isNavigating}
      >
        {children}
      </Link>
      {isNavigating && (
        <NavigationLoadingOverlay message={message} italic={italic} />
      )}
    </>
  );
}
