'use strict';

const suite = require('core/suite');
const payload = require('./assets/accounts');

suite.forElement('crm', 'accounts', { payload: payload, skip: true}, (test) => {
  test.should.supportCrus();
  test.withOptions({ qs: { where: 'accountName=\'churrosTestAccount\'' } }).should.return200OnGet();
  test.should.supportPagination();
 });
