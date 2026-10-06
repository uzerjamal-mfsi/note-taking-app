export function buildShareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/shared/${token}`;
}

export function formatShareExpiry(expiresAt: string | null): string {
  if (expiresAt === null) {
    return "Never expires";
  }
  return new Date(expiresAt).toLocaleString();
}

/** Formats a Date as `YYYY-MM-DDTHH:mm` in local time, the value format of `<input type="datetime-local">`. */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
