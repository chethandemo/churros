'use strict';

const tools = require('core/tools');
const expect = require('chakram').expect;
const suite = require('core/suite');
const cloud = require('core/cloud');

const pathUpdateString = "/CELogo-Update.png";

const pathUpdate = () => ({
  "path": pathUpdateString
});

suite.forElement('documents', 'files', (test) => {
  let query = { path: `/churros/CloudElements-${tools.random()}.png` };
  let path = __dirname + '/assets/CE_logo.png';

  it('should allow CRUD cycle by id', () => {
    let fileId = -1;
    return cloud.withOptions({ qs: query }).postFile(test.api, path)
      .then(r => fileId = r.body.id)
      .then(r => cloud.get(test.api + '/' + fileId, (r) => expect(r).to.have.statusCode(200)))
      .then(r => cloud.get(`${test.api}/${fileId}/links`))
      .then(r => cloud.get(`${test.api}/${fileId}/metadata`))
      .then(r => cloud.patch(`${test.api}/${fileId}/metadata`, pathUpdate()))
      .then(r => cloud.delete(`${test.api}/${fileId}`));
  });

  it('should allow CRUD cycle by path', () => {
    let fileId = -1;
    return cloud.withOptions({ qs: query }).postFile(test.api, path)
      .then(r => fileId = r.body.id)
      .then(r => cloud.withOptions({ qs: query }).get(`${test.api}/links`))
      .then(r => cloud.withOptions({ qs: query }).get(`${test.api}/metadata`))
      .then(r => cloud.withOptions({ qs: query }).get(test.api, (r) => expect(r).to.have.statusCode(200)))
      .then(r => cloud.withOptions({ qs: query }).patch(`${test.api}/metadata`, pathUpdate()))
      .then(r => cloud.withOptions({ qs: { path: `/churros${pathUpdateString}` } }).delete(test.api));
  });

  it('should allow GET /files/:id/links for a root file', () => {
    let fileId;
    return cloud.withOptions({ qs: { path: '/rootChurro.png' } }).postFile(test.api, path)
      .then(r => fileId = r.body.id)
      .then(r => cloud.get(`${test.api}/${fileId}/links`))
      .then(r => {
        expect(r.body).to.not.be.empty;
        expect(r.body.cloudElementsLink).to.not.be.empty;
      })
      .then(r => cloud.delete(`${test.api}/${fileId}`));
  });
});