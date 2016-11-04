'use strict';

const suite = require('core/suite');
const payload = require('./assets/contacts');
const cloud = require('core/cloud');

suite.forElement('db', 'contacts', { payload: payload }, (test) => {
  test.should.supportCruds();
  test.should.supportCeqlSearch('id');
  test.should.supportPagination();
  it('should create a contact and then an attachment for that id', () => {
    let contactId;
    return cloud.post(test.api, payload)
      .then(r => contactId = r.body.id)
      .then(r => cloud.withOptions({ qs: { fieldName : 'file' } }).postFile(`${test.api}/${contactId}/attachments`, __dirname + '/assets/attach.txt'))
      .then(r => cloud.get(`${test.api}/${contactId}/attachments/22`))
      .then(r => cloud.delete(`${test.api}/${contactId}`));
  });
});