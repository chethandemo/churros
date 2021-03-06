'use strict';

const suite = require('core/suite');
const cloud = require('core/cloud');
const tools = require('core/tools');
const upload = require('./assets/metadata');

suite.forElement('documents', 'files', null, (test) => {
  it('should allow ping for sfdcdocuments', () => {
    return cloud.get(`/hubs/documents/ping`);
  });

  it('should allow CRD for hubs/documents/files and UR for hubs/documents/files/metadata by path', () => {
    let UploadFile = __dirname + '/assets/Penguins.jpg',
      srcPath;
    return cloud.withOptions({ qs: { path: `/${tools.random()}` } }).postFile(test.api, UploadFile)
      .then(r => srcPath = r.body.path)
      .then(r => cloud.withOptions({ qs: { path: `${srcPath}` } }).get(test.api))
      .then(r => cloud.withOptions({ qs: { path: `${srcPath}` } }).get(`${test.api}/metadata`))
      .then(r => cloud.withOptions({ qs: { path: `${srcPath}` } }).patch(`${test.api}/metadata`, upload))
      .then(r => cloud.withOptions({ qs: { path: `${srcPath}` } }).delete(test.api));
  });

  it('should allow CRD for hubs/documents/files and UR for hubs/documents/files/metadata by id', () => {
    let UploadFile = __dirname + '/assets/Penguins.jpg',
      fileId;
    return cloud.withOptions({ qs: { path: `/${tools.random()}` } }).postFile(test.api, UploadFile)
      .then(r => fileId = r.body.id)
      .then(r => cloud.get(`${test.api}/${fileId}`))
      .then(r => cloud.get(`${test.api}/${fileId}/metadata`))
      .then(r => cloud.patch(`${test.api}/${fileId}/metadata`, upload))
      .then(r => cloud.delete(`${test.api}/${fileId}`));
  });
});
