import { expect } from 'chai';
import { Binary, Decimal128, Int32, Long, ObjectId } from 'mongodb';

import { columnTypes } from '../../enhanced/features/columnTypes.js';

describe('enhanced columnTypes', () => {
  it('maps values to the Simple filter\'s type codes', () => {
    const types = columnTypes([{
      n: 4, f: 1.5, i: new Int32(2), l: Long.fromNumber(9), d128: Decimal128.fromString('1.5'),
      when: new Date(), ref: new ObjectId(), id: new Binary(Buffer.alloc(16), Binary.SUBTYPE_UUID),
      name: 'x', flag: true,
    }]);
    expect(types).to.deep.equal({
      n: 'N', f: 'N', i: 'N', l: 'N', d128: 'N', when: 'D', ref: 'O', id: 'U', name: 'S', flag: 'S',
    });
  });

  it('keeps a plain Binary as nothing: only UUID has a type of its own', () => {
    expect(columnTypes([{ blob: new Binary(Buffer.alloc(4)) }])).to.deep.equal({});
  });

  it('reaches into objects with dotted paths, to three levels', () => {
    const types = columnTypes([{ info: { slug: 'a', stats: { views: 3, deep: { too: { far: 1 } } } } }]);
    expect(types).to.deep.equal({ 'info.slug': 'S', 'info.stats.views': 'N' });
  });

  it('types an array by its elements, as MongoDB\'s dot notation does', () => {
    const types = columnTypes([{ tags: ['a', 'b'], items: [{ sku: 'x', qty: 2 }, { sku: 'y' }], empty: [] }]);
    expect(types).to.deep.equal({ tags: 'S', 'items.sku': 'S', 'items.qty': 'N' });
  });

  it('lets the first value seen decide, and skips nulls and large-value stubs', () => {
    const types = columnTypes([
      { a: null, b: { display: '*** LARGE PROPERTY ***', attribu: 'b' }, c: 1 },
      { a: 5, b: 'text', c: 'one' },
    ]);
    expect(types).to.deep.equal({ a: 'N', b: 'S', c: 'N' });
  });

  it('is empty for no documents and ignores things that are not documents', () => {
    expect(columnTypes([])).to.deep.equal({});
    expect(columnTypes()).to.deep.equal({});
    expect(columnTypes([null, 'x', 3])).to.deep.equal({});
  });

  it('stops collecting at a sane number of paths', () => {
    const wide = Object.fromEntries(Array.from({ length: 800 }, (_, i) => [`f${i}`, i]));
    expect(Object.keys(columnTypes([wide])).length).to.be.at.most(500);
  });
});
