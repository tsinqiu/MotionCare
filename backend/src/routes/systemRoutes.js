const express = require('express');
const config = require('../config');
const { sendData } = require('../response');

function createSystemRouter() {
  const router = express.Router();

  router.get('/system/public-config', (req, res) => {
    sendData(res, {
      maps: {
        amap: {
          key: config.maps.amap.key,
          securityCode: config.maps.amap.securityCode
        }
      }
    });
  });

  return router;
}

module.exports = createSystemRouter;
