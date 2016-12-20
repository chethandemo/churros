'use strict';

const suite = require('core/suite');
const payload = require('./assets/sales-receipts');

suite.forElement('finance', 'sales-receipts', { payload: payload, skip: false}, (test) => {
  test.should.supportCruds();
  test.withOptions({ qs: { page: 1, pageSize: 5 } }).should.return200OnGet();
});