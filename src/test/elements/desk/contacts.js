'use strict';

const suite = require('core/suite');
const payload = require('./assets/contacts');

const contactUpdate = () => ({
  "first_name": "test",
  "last_name": "cloud"
});

const options = {
  churros: {
    updatePayload: contactUpdate()
  }
};

suite.forElement('helpdesk', 'contacts', payload, (test) => {
  test.withOptions(options).should.supportCrus();
  test.should.supportPagination();
  test.withOptions({ qs: { where: 'email=\'support@desk.com\'' } }).should.return200OnGet();
});