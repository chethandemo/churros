'use strict';

const suite = require('core/suite');

suite.forElement('documents', 'changes', null, (test) => {
  test.should.return200OnGet();
});