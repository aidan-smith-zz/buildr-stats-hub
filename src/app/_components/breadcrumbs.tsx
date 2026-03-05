"use client";

import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";

export type BreadcrumbItem = {
  href: string;
  label: string;
};

type Props = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className }: Props) {
  if (!items || items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={className}
    >
      <ol className="flex flex-wrap items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.href}-${item.label}`} className="flex items-center gap-1">
              {index > 0 && (
                <span className="text-neutral-400 dark:text-neutral-600">/</span>
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="font-medium text-neutral-800 dark:text-neutral-100"
                >
                  {item.label}
                </span>
              ) : (
                <NavLinkWithOverlay
                  href={item.href}
                  className="hover:text-neutral-900 dark:hover:text-neutral-50"
                  message="Loading…"
                  italic={false}
                >
                  {item.label}
                </NavLinkWithOverlay>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

