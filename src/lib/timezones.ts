/**
 * The timezone list offered in the UI.
 *
 * Deliberately short. A full IANA list is 400+ entries and makes the common
 * case slower; these cover Strive's clients with room to grow, and Settings
 * accepts any IANA name for the exceptions.
 */
export const TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "New York" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/Denver", label: "Denver" },
  { value: "America/Phoenix", label: "Phoenix" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "America/Anchorage", label: "Anchorage" },
  { value: "Pacific/Honolulu", label: "Honolulu" },
  { value: "America/Toronto", label: "Toronto" },
  { value: "America/Mexico_City", label: "Mexico City" },
  { value: "America/Sao_Paulo", label: "São Paulo" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Africa/Addis_Ababa", label: "Addis Ababa" },
  { value: "Africa/Lagos", label: "Lagos" },
  { value: "Africa/Nairobi", label: "Nairobi" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "Kolkata" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Seoul", label: "Seoul" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Pacific/Auckland", label: "Auckland" },
];

export const DEFAULT_TIMEZONE = "America/New_York";

export function timezoneLabel(tz: string): string {
  return TIMEZONES.find((t) => t.value === tz)?.label
    ?? tz.split("/").pop()?.replace(/_/g, " ")
    ?? tz;
}

/** Current UTC offset, e.g. "GMT-4" — shown beside each option. */
export function offsetLabel(tz: string, at = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
