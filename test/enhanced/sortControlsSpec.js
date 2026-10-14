import { expect } from 'chai';

import { nextSortValue } from '../../enhanced/scripts/sortControls.js';

describe('enhanced sort controls', () => {
  it('jumps straight to the wanted direction from unsorted', () => {
    expect(nextSortValue(0, 1)).to.equal(1);
    expect(nextSortValue(0, -1)).to.equal(-1);
    expect(nextSortValue(undefined, -1)).to.equal(-1);
  });

  it('switches direction in one step', () => {
    expect(nextSortValue(1, -1)).to.equal(-1);
    expect(nextSortValue(-1, 1)).to.equal(1);
    expect(nextSortValue('-1', 1)).to.equal(1);
  });

  it('turns the sort off when the active direction is pressed again', () => {
    expect(nextSortValue(1, 1)).to.equal(0);
    expect(nextSortValue('-1', -1)).to.equal(0);
  });
});
