import { ObjectId } from 'mongodb';
import { expect } from 'chai';

import { meValue } from '../../enhanced/features/valueFilter.js';

describe('enhanced me_value filter', () => {
  it('marks null and undefined', () => {
    expect(meValue(null)).to.equal('<span class="v-null">null</span>');
    expect(meValue()).to.equal('<span class="v-null">null</span>');
  });

  it('renders ObjectIds, dates (ISO, time dimmed), booleans and numbers with their type classes', () => {
    expect(meValue(new ObjectId('65f1c2a8e4b0a1b2c3d4e5f6'))).to.equal('<span class="v-oid">65f1c2a8e4b0a1b2c3d4e5f6</span>');
    expect(meValue(new Date('2026-10-14T06:30:00.000Z')))
      .to.equal('<span class="v-date">2026-10-14<span class="v-time">T06:30:00.000Z</span></span>');
    expect(meValue(true)).to.equal('<span class="v-bool is-true">true</span>');
    expect(meValue(false)).to.equal('<span class="v-bool is-false">false</span>');
    expect(meValue(0)).to.equal('<span class="v-num">0</span>');
  });

  it('does not throw on an invalid date', () => {
    expect(meValue(new Date('nope'))).to.contain('v-null');
  });

  it('shows empty strings and empty arrays as muted chips, not blank cells', () => {
    expect(meValue('')).to.contain('v-empty');
    expect(meValue([])).to.equal('<span class="v-empty">[]</span>');
  });

  it('escapes strings and truncates long ones like upstream, keeping the full text in a title', () => {
    expect(meValue('<b>&"x"</b>')).to.equal('<span class="v-str">&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;</span>');
    const long = 'a'.repeat(60);
    expect(meValue(long)).to.contain(`${'a'.repeat(49)}…`).and.to.contain(`title="${long}"`);
  });

  it('hands everything else to upstream, so objects keep their <pre> and oversized values keep their stub', () => {
    expect(meValue({ a: 1 })).to.match(/^<pre>/);
    const stub = {
      display: '*** LARGE PROPERTY ***', preview: '{"x"', roughSz: 5, humanSz: '5 B', attribu: 'x', maxSize: '1 B', _id: 'id',
    };
    expect(meValue(stub)).to.contain('class="tooDamnBig"');
  });

  it('passes inline media through unwrapped', () => {
    expect(meValue('data:image/png;base64,AAAA')).to.match(/^<img /);
  });
});
