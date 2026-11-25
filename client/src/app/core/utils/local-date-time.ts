const parseLocalDateTime = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
    value,
  );
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, millisecondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? 0);
  const millisecond = Number((millisecondText ?? '').padEnd(3, '0') || 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, second, millisecond);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second ||
    date.getMilliseconds() !== millisecond
  ) {
    return null;
  }
  return date;
};

const formatLocalDateTime = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`;

export const localDateTimeToIso = (value: string): string | null =>
  parseLocalDateTime(value)?.toISOString() ?? null;

export const utcDateTimeToLocalInput = (value: string): string | null => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatLocalDateTime(date) : null;
};

export const localDateBoundaryToIso = (value: string, endOfDay = false): string | null =>
  localDateTimeToIso(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
