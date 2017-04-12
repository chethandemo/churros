'use strict';

const suite = require('core/suite');

suite.forElement('ecommerce', 'credit-memos', (test) => {
  test.withOptions({ qs: {orderBy : 'id'} }).should.return200OnGet();
  test.withOptions({ qs: {orderBy : 'id desc'} }).should.return200OnGet();
  test.should.return200OnGet();
  test.should.supportPagination();
});
