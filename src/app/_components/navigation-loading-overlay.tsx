type Props = {
  /** Override the loading message (e.g. "Building your Stats" on the fixtures homepage). */
  message?: string;
  /** When true, message is rendered in italic. */
  italic?: boolean;
};

export function NavigationLoadingOverlay({ message = "Loading…", italic }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 dark:bg-black/70"
      aria-live="polite"
      aria-label={message}
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-8 py-6 shadow-xl dark:bg-neutral-900">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-400"
          aria-hidden
        />
        <span
          className={`text-sm font-medium text-neutral-700 dark:text-neutral-300 ${italic ? "italic" : ""}`}
        >
          {message}
        </span>
      </div>
    </div>
  );
}
