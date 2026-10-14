import swig from 'free-swig';
import { stringDocIDs, to_display as upstreamDisplay } from '../../lib/filters.js';

// Same escaping as upstream's to_display, which does not export it.
const escapeHtml = (text) => String(text)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll('\'', '&apos;');

const MAX_STRING = 50;
const INLINE_MEDIA = /^data:(image|audio|video)\//;

/**
 * Renders one document value for a table cell with the designer's type classes (.v-oid, .v-date, .v-bool, …).
 *
 * Anything it does not recognise goes through upstream's own display filter, so objects keep their `<pre>` (which
 * upstream's script turns into a collapsible tree), oversized values keep their "click to fetch" stub, and inline media
 * keeps rendering. Output is HTML: use with `| safe`.
 */
export const meValue = (input) => {
  if (input === null || input === undefined) return '<span class="v-null">null</span>';

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return '<span class="v-null">Invalid Date</span>';
    const iso = input.toISOString();
    return `<span class="v-date">${iso.slice(0, 10)}<span class="v-time">${iso.slice(10)}</span></span>`;
  }

  if (input._bsontype === 'ObjectId') return `<span class="v-oid">${escapeHtml(input.toString())}</span>`;
  if (typeof input === 'boolean') return `<span class="v-bool is-${input}">${input}</span>`;
  if (typeof input === 'number') return `<span class="v-num">${input}</span>`;
  if (Array.isArray(input) && input.length === 0) return '<span class="v-empty">[]</span>';

  if (typeof input === 'string') {
    if (input === '') return '<span class="v-empty">""</span>';
    if (INLINE_MEDIA.test(input)) return upstreamDisplay(input);
    const shown = input.length > MAX_STRING ? `${input.slice(0, MAX_STRING - 1)}…` : input;
    return `<span class="v-str"${shown === input ? '' : ` title="${escapeHtml(input.slice(0, 500))}"`}>${escapeHtml(shown)}</span>`;
  }

  const display = upstreamDisplay(stringDocIDs(input));
  // Binary / Long ids come back as plain text; objects, stubs and media already carry their own markup.
  return display.startsWith('<') ? display : `<span class="v-str">${display}</span>`;
};

/** Registers the filters the shadowed templates use. swig keeps filters in one shared registry, so this is global. */
export const registerValueFilters = () => swig.setFilter('me_value', meValue);
