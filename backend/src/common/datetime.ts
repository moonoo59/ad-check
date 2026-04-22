const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const LEGACY_SQLITE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

export const SQLITE_UTC_NOW_EXPRESSION = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export function utcNow(): string {
  return new Date().toISOString();
}

export function kstDateStartToUtc(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+09:00`).toISOString();
}

export function kstDateEndToUtc(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999+09:00`).toISOString();
}

export function utcToKstDate(dateTime: string): string {
  const date = new Date(dateTime);
  const kstDate = new Date(date.getTime() + KST_OFFSET_MS);

  return [
    kstDate.getUTCFullYear(),
    String(kstDate.getUTCMonth() + 1).padStart(2, '0'),
    String(kstDate.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function getKstNowParts(now = new Date()): { year: number; month: number; date: string } {
  const kstDate = new Date(now.getTime() + KST_OFFSET_MS);

  return {
    year: kstDate.getUTCFullYear(),
    month: kstDate.getUTCMonth() + 1,
    date: [
      kstDate.getUTCFullYear(),
      String(kstDate.getUTCMonth() + 1).padStart(2, '0'),
      String(kstDate.getUTCDate()).padStart(2, '0'),
    ].join('-'),
  };
}

export function normalizeLegacyKstTimestamp(value: string | null): string | null {
  if (!value) {
    return value;
  }

  if (!LEGACY_SQLITE_TIMESTAMP_RE.test(value)) {
    return value;
  }

  return new Date(`${value.replace(' ', 'T')}+09:00`).toISOString();
}
