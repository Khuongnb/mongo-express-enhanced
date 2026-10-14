import { expect } from 'chai';

import { clampPage, formatNumber, pageItems, rangeLabel } from '../../enhanced/scripts/paging.js';

describe('enhanced paging', () => {
  it('shows first, last and the pages around the current one, with a gap for the rest', () => {
    expect(pageItems(1, 761)).to.deep.equal([1, 2, 3, 'gap', 761]);
    expect(pageItems(10, 761)).to.deep.equal([1, 'gap', 8, 9, 10, 11, 12, 'gap', 761]);
    expect(pageItems(761, 761)).to.deep.equal([1, 'gap', 759, 760, 761]);
  });

  it('shows the page itself instead of a gap that would hide just one', () => {
    expect(pageItems(5, 20)).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 'gap', 20]);
    expect(pageItems(4, 6)).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it('handles tiny totals', () => {
    expect(pageItems(1, 1)).to.deep.equal([1]);
    expect(pageItems(1, 0)).to.deep.equal([]);
    expect(pageItems(2, 3)).to.deep.equal([1, 2, 3]);
  });

  it('clamps a typed page number into range and rejects junk', () => {
    expect(clampPage('0', 761)).to.equal(1);
    expect(clampPage('9999', 761)).to.equal(761);
    expect(clampPage(' 12 ', 761)).to.equal(12);
    expect(clampPage('abc', 761)).to.equal(undefined);
  });

  it('formats numbers with thousands separators and leaves non-numbers alone', () => {
    expect(formatNumber('7603')).to.equal('7,603');
    expect(formatNumber(463_413)).to.equal('463,413');
    expect(formatNumber('')).to.equal('');
    expect(formatNumber('n/a')).to.equal('n/a');
  });

  it('labels the rows on a page', () => {
    expect(rangeLabel({ skip: 0, shown: 10 })).to.equal('1–10');
    expect(rangeLabel({ skip: 7600, shown: 3 })).to.equal('7,601–7,603');
    expect(rangeLabel({ skip: 0, shown: 0 })).to.equal('0');
  });
});
