// Pure helpers for the designed pagination and range text.

const PAGE_WINDOW = 2;

/**
 * Page numbers to render around `current`, with 'gap' where pages are skipped: always the first, the last and
 * `current` ± 2. A gap that would hide a single page shows that page instead.
 */
export const pageItems = (current, total) => {
  if (total < 1) return [];
  const wanted = new Set([1, total]);
  for (let page = current - PAGE_WINDOW; page <= current + PAGE_WINDOW; page++) {
    if (page >= 1 && page <= total) wanted.add(page);
  }
  const pages = [...wanted].sort((left, right) => left - right);
  const items = [];
  for (const [index, page] of pages.entries()) {
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous === 2) items.push(previous + 1);
    else if (previous !== undefined && page - previous > 2) items.push('gap');
    items.push(page);
  }
  return items;
};

export const clampPage = (value, total) => {
  const page = Number.parseInt(value, 10);
  if (!Number.isFinite(page)) return;
  return Math.min(Math.max(page, 1), Math.max(total, 1));
};

export const formatNumber = (value) => {
  const number = Number(value);
  return value !== '' && value !== null && Number.isFinite(number) ? new Intl.NumberFormat('en-US').format(number) : String(value);
};

// "1–10" for the rows shown on this page.
export const rangeLabel = ({ skip, shown }) => {
  if (shown <= 0) return '0';
  return `${formatNumber(skip + 1)}–${formatNumber(skip + shown)}`;
};
