import { expect } from 'chai';

import { matchesFilter } from '../../enhanced/scripts/listFilter.js';

describe('enhanced list filter', () => {
  it('matches a substring, ignoring case', () => {
    expect(matchesFilter('fast_channel', 'CHAN')).to.equal(true);
    expect(matchesFilter('fast_channel', 'xyz')).to.equal(false);
  });

  it('matches everything for an empty or blank query', () => {
    expect(matchesFilter('anything', '')).to.equal(true);
    expect(matchesFilter('anything', '   ')).to.equal(true);
  });

  it('trims the query but not the name', () => {
    expect(matchesFilter('epgs', '  epg ')).to.equal(true);
  });
});
