'use strict';

const suite = require('core/suite');
const sharepayload = {
  "ShareType": "Send",
  "Title": "Sample Send Share",
  "Items": [],
  "ExpirationDate": "2017-07-23",
  "RequireLogin": false,
  "RequireUserInfo": false,
  "MaxDownloads": -1,
  "UsesStreamIDs": false
};
const folderpayload = require('./assets/folder');
const cloud = require('core/cloud');
suite.forElement('documents', 'share', (test) => {
  it('Testing share creating/getting', () => {
    return cloud.post('/hubs/documents/folders', folderpayload)
      .then(r => sharepayload.Items = [{ Id: r.body.id }])
      .then(r => cloud.post('/hubs/documents/share', sharepayload))
      .then(r => cloud.get('/hubs/documents/share'))
      .then(r => cloud.delete('/hubs/documents/folders/' + sharepayload.Items[0].Id));
  });
});