const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const LEGACY_SQLITE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

function parseStoredTimestamp(value: string): Date {
  if (LEGACY_SQLITE_TIMESTAMP_RE.test(value)) {
    return new Date(`${value.replace(' ', 'T')}+09:00`);
  }

  return new Date(value);
}

function toKstDate(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatTimestampKst(
  value?: string | null,
  options: { seconds?: boolean; dateOnly?: boolean } = {},
): string {
  if (!value) {
    return '-';
  }

  const parsed = parseStoredTimestamp(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const kst = toKstDate(parsed);
  const datePart = `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;

  if (options.dateOnly) {
    return datePart;
  }

  const timePart = options.seconds
    ? `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}`
    : `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;

  return `${datePart} ${timePart}`;
}

export function getKstNowParts(now = new Date()): { year: number; month: number; date: string } {
  const kst = toKstDate(now);

  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    date: `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`,
  };
}
