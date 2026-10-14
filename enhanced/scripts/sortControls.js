/* global document, CSS */

/**
 * Sort value after pressing the ascending (1) or descending (-1) button of a column that is currently sorted `current`
 * (1, -1 or 0/absent). Pressing the direction that is already active turns the sort off.
 */
export const nextSortValue = (current, wanted) => (Number(current) === wanted ? 0 : wanted);

// Ascending / descending buttons in each column header (UI tier 2). Upstream's name button cycles asc → desc → none and needs a
// page load per step; these jump straight to the wanted direction. They drive the same hidden `sort[column]` checkboxes
// upstream's script does, and submit the same form.
export const initSortControls = () => {
  const buttons = document.querySelectorAll('[data-me-sort]');
  if (buttons.length === 0) return;

  const boxesFor = (column) => document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(`sort[${column}]`)}"]`);

  const submit = () => {
    // never the raw-command tab, whose form would run the command
    const active = document.querySelector('#my-tab-content .tab-pane.active');
    const form = active && active.id !== 'raw' ? active.querySelector('form') : document.querySelector('#simple form');
    form?.requestSubmit();
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const column = button.dataset.meSortColumn;
      const wanted = Number(button.dataset.meSort);
      const boxes = boxesFor(column);
      if (boxes.length === 0) return;
      const value = nextSortValue(boxes[0].checked ? boxes[0].value : 0, wanted);
      for (const box of boxes) {
        box.value = value;
        box.checked = value !== 0;
      }
      submit();
    });
  }
};
