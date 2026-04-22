export const TIME_RANGE_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const startH = String(h).padStart(2, '0');
  const endH = String((h + 1) % 24).padStart(2, '0');
  return {
    start: `${startH}:00`,
    end: `${endH}:00`,
    label: `${startH}:00 ~ ${endH}:00${h === 23 ? ' (자정 넘김)' : ''}`,
  };
});

const TIME_WITH_MINUTES_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIME_WITH_SECONDS_REGEX = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;

export function normalizeTimeInput(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  if (TIME_WITH_SECONDS_REGEX.test(trimmed)) {
    return trimmed;
  }

  if (TIME_WITH_MINUTES_REGEX.test(trimmed)) {
    return `${trimmed}:00`;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 4) {
    const formatted = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    return TIME_WITH_MINUTES_REGEX.test(formatted) ? `${formatted}:00` : null;
  }

  if (digits.length === 6) {
    const formatted = `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`;
    return TIME_WITH_SECONDS_REGEX.test(formatted) ? formatted : null;
  }

  return null;
}

export function timeToSeconds(raw: string): number | null {
  const normalized = normalizeTimeInput(raw);
  if (!normalized) {
    return null;
  }

  const [hours, minutes, seconds] = normalized.split(':').map(Number);
  return (hours * 60 * 60) + (minutes * 60) + seconds;
}
