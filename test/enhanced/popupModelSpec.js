import { expect } from 'chai';
import htmlParser from 'node-html-parser';

import {
  formBody, isSameOrigin, neighbourIndex, parseDocumentPage, positionLabel,
} from '../../enhanced/scripts/popupModel.js';

const page = `<html><body>
<form method="POST" id="documentEditForm" action="/db/d/c/%22abc%22?skip=0">
  <input type="hidden" name="_csrf" value="tok">
  <input type="hidden" name="_method" value="put">
  <textarea id="document" name="document">{
    _id: ObjectId(&#39;abc&#39;),
    title: &quot;a &amp; b&quot;
}</textarea>
</form>
<form method="POST" action="/db/d/c/%22abc%22"><input type="hidden" name="_csrf" value="tok">
<button type="submit" class="deleteButtonDocument">Delete</button></form>
</body></html>`;

describe('enhanced popup model', () => {
  describe('parseDocumentPage', () => {
    it('reads the text (entities decoded), token and both URLs', () => {
      const parsed = parseDocumentPage(htmlParser.parse(page));
      expect(parsed.text).to.equal("{\n    _id: ObjectId('abc'),\n    title: \"a & b\"\n}");
      expect(parsed.csrf).to.equal('tok');
      expect(parsed.saveUrl).to.equal('/db/d/c/%22abc%22?skip=0');
      expect(parsed.deleteUrl).to.equal('/db/d/c/%22abc%22');
    });

    it('has no delete URL when the page offers no delete (read-only, or deleting not permitted)', () => {
      const readOnly = page.replace(/<form method="POST" action="[^"]*%22"><input[\s\S]*<\/form>/, '');
      expect(parseDocumentPage(htmlParser.parse(readOnly)).deleteUrl).to.equal(null);
    });

    it('returns null for a page that is not a document page, such as the sign-in page', () => {
      expect(parseDocumentPage(htmlParser.parse('<html><body><form action="/login"></form></body></html>'))).to.equal(null);
    });
  });

  it('builds the form fields upstream\'s routes expect', () => {
    expect(formBody({ method: 'put', csrf: 't', document: '{ a: 1 }' }).toString()).to.equal('_method=put&_csrf=t&document=%7B+a%3A+1+%7D');
    expect(formBody({ method: 'delete', csrf: 't' }).toString()).to.equal('_method=delete&_csrf=t');
  });

  it('moves between rows and stops at the ends of the page', () => {
    expect(neighbourIndex(0, -1, 5)).to.equal(-1);
    expect(neighbourIndex(0, 1, 5)).to.equal(1);
    expect(neighbourIndex(4, 1, 5)).to.equal(-1);
    expect(neighbourIndex(4, -1, 5)).to.equal(3);
    expect(neighbourIndex(0, 1, 1)).to.equal(-1);
  });

  it('labels the position', () => {
    expect(positionLabel(2, 10)).to.equal('3 of 10 on this page');
  });

  it('accepts same-origin URLs only', () => {
    const base = 'https://h.example/app/db/x/y';
    expect(isSameOrigin('/app/db/x/y/%22a%22?skip=0', base, 'https://h.example')).to.equal(true);
    expect(isSameOrigin('https://evil.example/x', base, 'https://h.example')).to.equal(false);
    expect(isSameOrigin('//evil.example/x', base, 'https://h.example')).to.equal(false);
    expect(isSameOrigin('http://[bad', base, 'https://h.example')).to.equal(false);
  });
});
