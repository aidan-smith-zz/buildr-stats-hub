import { todayDateKey, tomorrowDateKey } from "@/lib/slugs";

export function normalizeDateKey(param: string | undefined): string {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const d = new Date(param + "T12:00:00.000Z");
    if (!Number.isNaN(d.getTime())) return param;
  }
  return todayDateKey();
}

export function dateContextLabel(dateKey: string): "today" | "tomorrow" | "date" {
  if (dateKey === todayDateKey()) return "today";
  if (dateKey === tomorrowDateKey()) return "tomorrow";
  return "date";
}

export function shortDateLabel(dateKey: string): string {
  return new Date(dateKey + "T12:00:00.000Z").toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
