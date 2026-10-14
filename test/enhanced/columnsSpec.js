import { expect } from 'chai';

import {
  addPreset, hideAllColumns, matchColumns, parseJson, removePreset, sameSet, sanitizeHidden, sanitizePresets, summarize, toggleColumn,
} from '../../enhanced/scripts/columns.js';

const columns = ['_id', 'type', 'startAt', 'endAt', 'createdAt'];

describe('enhanced column picker logic', () => {
  it('keeps only real, unique, non-pinned names from stored state', () => {
    expect(sanitizeHidden(['type', 'type', '_id', 'gone', 7, 'endAt'], columns)).to.deep.equal(['type', 'endAt']);
    expect(sanitizeHidden('nope', columns)).to.deep.equal([]);
    expect(sanitizeHidden(undefined, columns)).to.deep.equal([]);
  });

  it('survives corrupt storage', () => {
    expect(parseJson('{not json', [])).to.deep.equal([]);
    expect(parseJson(null, ['x'])).to.deep.equal(['x']);
    expect(parseJson('["a"]', [])).to.deep.equal(['a']);
  });

  it('toggles a column in and out of the hidden set', () => {
    expect(toggleColumn([], 'type')).to.deep.equal(['type']);
    expect(toggleColumn(['type', 'endAt'], 'type')).to.deep.equal(['endAt']);
  });

  it('hides everything but the pinned column', () => {
    expect(hideAllColumns(columns)).to.deep.equal(['type', 'startAt', 'endAt', 'createdAt']);
  });

  it('summarises shown / hidden counts in table order, and detects "only _id"', () => {
    expect(summarize(columns, [])).to.include({ total: 5, shown: 5, isFiltered: false, onlyPinned: false });
    expect(summarize(columns, ['createdAt', 'type'])).to.deep.include({
      shown: 3, isFiltered: true, hiddenNames: ['type', 'createdAt'],
    });
    expect(summarize(columns, hideAllColumns(columns)).onlyPinned).to.equal(true);
    expect(summarize(['_id'], []).onlyPinned).to.equal(false);
  });

  it('matches columns case-insensitively with the matched span, and everything for an empty term', () => {
    expect(matchColumns(columns, 'AT')).to.deep.equal([
      { name: 'startAt', start: 5, end: 7 },
      { name: 'endAt', start: 3, end: 5 },
      { name: 'createdAt', start: 3, end: 5 },
    ]);
    expect(matchColumns(columns, '  ')).to.have.length(5);
    expect(matchColumns(columns, 'genre')).to.deep.equal([]);
  });

  it('compares hidden sets regardless of order', () => {
    expect(sameSet(['a', 'b'], ['b', 'a'])).to.equal(true);
    expect(sameSet(['a'], ['a', 'b'])).to.equal(false);
  });

  it('adds presets, replacing one with the same name and ignoring blank names', () => {
    const one = addPreset([], ' Audit ', ['type']);
    expect(one).to.deep.equal([{ name: 'Audit', hidden: ['type'] }]);
    expect(addPreset(one, 'Audit', ['endAt'])).to.deep.equal([{ name: 'Audit', hidden: ['endAt'] }]);
    expect(addPreset(one, '   ', ['x'])).to.equal(one);
  });

  it('cleans stored presets against the current columns', () => {
    expect(sanitizePresets([{ name: ' A ', hidden: ['type', 'gone'] }, { name: '' }, null, { hidden: [] }], columns))
      .to.deep.equal([{ name: 'A', hidden: ['type'] }]);
    expect(sanitizePresets('x', columns)).to.deep.equal([]);
  });

  describe('removePreset', () => {
    const presets = [{ name: 'A', hidden: ['x'] }, { name: 'B', hidden: [] }, { name: 'C', hidden: ['y'] }];

    it('drops the preset at that position and keeps the order of the rest', () => {
      expect(removePreset(presets, 1).map((preset) => preset.name)).to.deep.equal(['A', 'C']);
      expect(removePreset(presets, 0).map((preset) => preset.name)).to.deep.equal(['B', 'C']);
    });

    it('leaves the list as it is for an index that is not there, and does not change its input', () => {
      expect(removePreset(presets, 7)).to.deep.equal(presets);
      expect(removePreset(presets, 'x')).to.deep.equal(presets);
      expect(presets).to.have.length(3);
    });
  });
});
