'use strict';

const util = require('util');
const chocolate = require('core/chocolate');
const chakram = require('chakram');
const expect = chakram.expect;
const common = require('../common');
const fs = require('fs');
const schema = require('./assets/files.schema.json');

describe('files', () => {
  common.for('files');

  it('should allow uploading and downloading a file', () => {
    const fullPath = util.format('/brady-%s.jpg', chocolate.random());
    var fileId = -1;
    return chakram.post('/hubs/documents/files', undefined, {
        formData: {
          file: fs.createReadStream(__dirname + '/assets/brady.jpg')
        },
        qs: {
          path: fullPath
        }
      })
      .then(r => {
        expect(r).to.have.status(200);
        expect(r).to.have.schema(schema);
        fileId = r.body.id;
        return chakram.get('/hubs/documents/files/' + fileId);
      })
      .then(r => {
        expect(r).to.have.status(200);
        return chakram.delete('/hubs/documents/files/' + fileId);
      })
      .then(r => {
        expect(r).to.have.status(200);
      });
  });
});
