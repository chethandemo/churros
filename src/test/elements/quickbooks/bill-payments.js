'use strict';

const suite = require('core/suite');
const payload = require('./assets/bill-payments');

suite.forElement('finance', 'bill-payments', { payload: payload, skip: true}, (test) => {
  test.should.supportCrds();
  test.withOptions({ qs: { page: 1, pageSize: 5 } }).should.return200OnGet();
  test.should.supportCeqlSearch('totalAmt');
});