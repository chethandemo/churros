'use strict';

const suite = require('core/suite');
const payload = require('./assets/leads');

suite.forElement('marketing', 'leads', { payload: payload }, (test) => {
  test.should.supportCrud();
});
