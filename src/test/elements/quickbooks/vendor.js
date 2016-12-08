'use strict';

const suite = require('core/suite');
const payload = require('./assets/vendor');

suite.forElement('finance', 'vendor', { payload: payload, skip: false}, (test) => {
  test.should.supportCruds();
  test.withOptions({ qs: { page: 1, pageSize: 5 } }).should.return200OnGet();
});