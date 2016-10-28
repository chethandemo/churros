'use strict';

const tools = require('core/tools');
const suite = require('core/suite');
const payload = require('./assets/folders');
const cloud = require('core/cloud');
const updatePayload = {
  			"name" : "Test Folder Updated",
  			"description" : tools.randomStr()
			};

suite.forElement('marketing', 'folders', { payload: payload }, (test) => {
  it('It should perform CRUS for /folders', () => {
	let id;
	return cloud.post(test.api, payload)
		.then(r => id = r.body.id)
		.then(r => cloud.patch(`${test.api}/${id}`, updatePayload))
		.then(r => cloud.get(test.api))
		.then(r => cloud.get(`${test.api}/${id}`));
  });
});
