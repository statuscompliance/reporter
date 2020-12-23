/*!
governify-project-gauss-reporter 1.0.0, built on: 2018-04-19
Copyright (C) 2018 ISA group
http://www.isa.us.es/
https://github.com/isa-group/governify-project-gauss-reporter

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>. */

'use strict';

const InfluxDB = require('../../../services/influxService').InfluxDB;
const config = require('../../../configurations');
const objectiveUtils = require('../../../utils/objective-utils');
const utils = require('../../../utils/index');
const logger = require('../../../logger');
const fs = require('fs');
const vm = require('vm')
const qs = require

// const logger = require('../../../logger');
var axios = require('axios');
/**
 * Return dashboard JSON for grafana
 **/

exports.dashboardGET = (req, res, next) => {
  var params = req.swagger.params;
  var agreementId = params.agreementId.value;
  var dashboardId = params.dashboardId.value;
  var boolGetBaseDashboard = params.base.value;
  var registryAgreementURL = config.v2.agreementURL + agreementId;


  function errorGettingAgreement(error) {
    logger.error("Error getting agreement to generate a Dashboard. agreementId: " + agreementId + " dashboardId: " + dashboardId + " - ERROR: " + error)
    res.status(400).send(error);
  }

  function errorGettingFile(error) {
    logger.error("Error getting File to generate a Dashboard. agreementId: " + agreementId + " dashboardId: " + dashboardId + " - ERROR: " + error)
    res.status(400).send(error);
  }

  async function getFile(URL) {
    var file = '';
    if (URL.startsWith('https://') || URL.startsWith('http://')) {
      await axios({
        url: URL,
        method: 'GET',
        json: false,
        headers: { 'User-Agent': 'request' }
      }).then(response => {
        file = response.data;

      }).catch(errorGettingFile)

    } else {
      file = JSON.parse(fs.readFileSync('./src/backend/dashboards/' + URL));
    }
    return file;
  }


  function requireFromString(src, filename) {
    var Module = module.constructor;
    var m = new Module();
    m._compile(src, filename);
    return m.exports;
  }


  async function agreementReceived(response) {
    try {
      var agreement = response.data;
      var dashboardConfig = agreement.context.definitions.dashboards[dashboardId];
      //Get the JSON file
      var dashboardJSON = await getFile(dashboardConfig.base);


      if (!boolGetBaseDashboard) {
        var dashboardModifier = requireFromString(await getFile(dashboardConfig.modifier), dashboardConfig.modifier);
        //Replace all agreement variables specified in the json
        dashboardJSON = utils.textReplaceReferencesFromJSON(JSON.stringify(dashboardJSON), agreement, ">>>agreement.", "<<<")
        // Apply modifier functions of the dashboard
        var dashboardJSON = dashboardModifier.modifyJSON(JSON.parse(dashboardJSON), agreement, dashboardId)
      }
      res.status(200).send(dashboardJSON);

    } catch (err) {
      logger.error("Error getting dynamic dashboard. agreementId: " + agreementId + " dashboardId: " + dashboardId + " - ERROR: " + err)
      res.status(400).send(err);
    }

  }

  //Get the agreement and generate
  axios({
    url: registryAgreementURL,
    method: 'GET',
    json: true,
    headers: { 'User-Agent': 'request' }
  }).then(agreementReceived).catch(errorGettingAgreement)

};

