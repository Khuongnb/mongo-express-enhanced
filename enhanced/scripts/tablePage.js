/* global document, ME_SETTINGS */
/* eslint-disable unicorn/no-unsafe-dom-html -- every interpolated value is a number, an internal label or a URL we build */
// Small behaviours of the collection page that the design adds on top of upstream's scripts: number formatting, range text,
// the designed pagination (replacing the paginator plugin's output), copy-_id, "Clear" buttons and the collection-delete gate.
import { clampPage, formatNumber, pageItems, rangeLabel } from './paging.js';

export const initNumbers = () => {
  for (const element of document.querySelectorAll('[data-me-num]')) {
    element.textContent = formatNumber(element.textContent.trim());
  }
};

export const initRanges = () => {
  for (const element of document.querySelectorAll('[data-me-range]')) {
    const skip = Number(element.dataset.skip) || 0;
    const shown = Number(element.dataset.shown) || 0;
    const perPage = element.dataset.perPage ? ` · ${formatNumber(element.dataset.perPage)} per page` : '';
    element.innerHTML = `<strong>${rangeLabel({ skip, shown })}</strong> of <strong>${formatNumber(element.dataset.total)}</strong>${perPage}`;
  }
};

const pageHref = (page, limit) => {
  const params = new URLSearchParams(globalThis.location.search);
  params.set('skip', String((page - 1) * limit));
  return `${globalThis.location.pathname}?${params}`;
};

const pageLink = ({ label, icon, page, limit, disabled, current, extra = '' }) => {
  const content = icon ? `<i class="fas ${icon}" aria-hidden="true"></i>` : label;
  const aria = icon ? ` aria-label="${label}"` : '';
  if (disabled) return `<li class="page-item disabled"><a class="page-link"${aria}>${content}</a></li>`;
  return `<li class="page-item${current ? ' active' : ''}${extra}"><a class="page-link" href="${pageHref(page, limit)}"${aria}${current ? ' aria-current="page"' : ''}>${content}</a></li>`;
};

const renderPagination = (nav, { current, total, limit }) => {
  // The paginator plugin turns the container itself into `.pagination` and fills it with <li>; we render a <ul.pagination>.
  nav.classList.remove('pagination');
  const items = pageItems(current, total).map((item) => (item === 'gap'
    ? '<li class="page-item me-gap" aria-hidden="true"><span class="page-link">…</span></li>'
    : pageLink({
      label: String(item), page: item, limit, current: item === current, extra: Math.abs(item - current) === 2 ? ' me-hide-sm' : '',
    })));
  nav.innerHTML = `<ul class="pagination">${[
    pageLink({ label: 'First page', icon: 'fa-angle-double-left', page: 1, limit, disabled: current === 1 }),
    pageLink({ label: 'Previous page', icon: 'fa-angle-left', page: current - 1, limit, disabled: current === 1 }),
    ...items,
    pageLink({ label: 'Next page', icon: 'fa-angle-right', page: current + 1, limit, disabled: current === total }),
    pageLink({ label: 'Last page', icon: 'fa-angle-double-right', page: total, limit, disabled: current === total }),
  ].join('')}</ul>`;
};

export const initPagination = () => {
  const limit = Number(ME_SETTINGS.limit);
  const total = Number(ME_SETTINGS.totalPages);
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(total) || total <= 1) return;
  const current = Math.round((Number(ME_SETTINGS.skip) || 0) / limit) + 1;

  for (const nav of document.querySelectorAll('#paginator-top, #paginator-bottom')) {
    renderPagination(nav, { current, total, limit });
  }

  const top = document.querySelector('#paginator-top');
  if (!top) return;
  top.insertAdjacentHTML('afterend', `<label class="me-page-jump">Page <input class="form-control" value="${current}" inputmode="numeric" aria-label="Go to page"> of ${formatNumber(total)}</label>`);
  top.parentElement.querySelector(':scope .me-page-jump input').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const page = clampPage(event.target.value, total);
    if (page !== undefined && page !== current) globalThis.location.assign(pageHref(page, limit));
  });
};

export const initCopy = () => {
  // Capture phase: rows navigate on click through an inline handler, which a bubbling listener would be too late to stop.
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-me-copy]');
    if (!button) return;
    event.stopPropagation();
    event.preventDefault();
    globalThis.navigator.clipboard?.writeText(button.dataset.meCopy).then(() => {
      button.classList.add('is-visible');
      button.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i>';
      setTimeout(() => {
        button.classList.remove('is-visible');
        button.innerHTML = '<i class="far fa-copy" aria-hidden="true"></i>';
      }, 1200);
    });
  }, { capture: true });
};

export const initQueryUi = () => {
  for (const button of document.querySelectorAll('[data-me-clear]')) {
    button.addEventListener('click', () => {
      const form = button.closest('form');
      for (const field of form.querySelectorAll('textarea')) field.value = '';
      for (const box of form.querySelectorAll('input[type="checkbox"]:not(.d-none)')) box.checked = false;
      form.querySelector('textarea')?.focus();
    });
  }

  for (const button of document.querySelectorAll('[data-me-clear-sort]')) {
    button.addEventListener('click', () => {
      for (const box of document.querySelectorAll('input[type="checkbox"][name^="sort["]')) box.checked = false;
      // Same form the column headers submit, but never the raw-command one, which would run the command.
      const active = document.querySelector('#my-tab-content .tab-pane.active');
      const form = active && active.id !== 'raw' ? active.querySelector('form') : document.querySelector('#simple form');
      form?.requestSubmit();
    });
  }
};

// The collection-delete prompt asks for the collection's name; keep Delete disabled until it matches.
export const initDeleteCollectionGate = () => {
  const modal = document.querySelector('#confirm-deletion-collection');
  const input = document.querySelector('#confirmation-input');
  const confirm = document.querySelector('#deleteCollectionConfirmation');
  if (!modal || !input || !confirm) return;
  const sync = () => {
    confirm.disabled = input.value.trim().toLowerCase() !== (input.getAttribute('shouldbe') ?? '').toLowerCase();
  };
  input.addEventListener('input', sync);
  modal.addEventListener('show.bs.modal', () => {
    input.value = '';
    sync();
  });
  sync();
};
