'use strict';

const suite = require('core/suite');
const payload = require('./assets/opportunities');
const cloud = require('core/cloud');
const note = {
  "name": "Test Note",
  "description": "I am a test note"
};

suite.forElement('crm', 'opportunities', { payload: payload }, (test) => {
  test.should.supportCruds();
  test.should.supportPagination();
  let opportunityId, noteId;
  it('should support CRUDS for opportunities/notes', () => {
    return cloud.post(test.api, payload)
      .then(r => opportunityId = r.body.id)
      .then(r => cloud.post(`${test.api}/${opportunityId}/notes`, note))
      .then(r => noteId = r.body.id)
      .then(r => cloud.get(`${test.api}/${opportunityId}/notes/${noteId}`))
      .then(r => cloud.patch(`${test.api}/${opportunityId}/notes/${noteId}`, { "description": "this is an updated note" }))
      .then(r => cloud.delete(`${test.api}/${opportunityId}/notes/${noteId}`))
      .then(r => cloud.delete(`${test.api}/${opportunityId}`));
  });
});
