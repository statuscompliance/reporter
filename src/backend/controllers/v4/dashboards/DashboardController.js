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

const governify = require('governify-commons');
const utils = require('../../../utils/index');
const logger = require('../../../logger');

// const logger = require('../../../logger');

/**
 * Return dashboard JSON for grafana
 **/

exports.dashboardGET = async (req, res, next) => {
  var params = req.swagger.params;
  var agreementId = params.agreementId.value;
  var dashboardId = params.dashboardId.value;
  var boolGetBaseDashboard = params.base.value;
  const agreementRequest = await governify.infrastructure.getService('internal.registry').get('/api/v6/agreements/' + agreementId);
  const agreement = agreementRequest.data;
  try {
    var dashboardConfig = agreement.context.definitions.dashboards[dashboardId];
    // Get the JSON file
    var dashboardJSON = await governify.utils.loadObjectFromFileOrURL(dashboardConfig.base);

    if (!boolGetBaseDashboard) {
      var dashboardModifier = await governify.utils.requireFromFileOrURL(dashboardConfig.modifier, dashboardConfig.modifier);
      // Replace all agreement variables specified in the json
      // TODO - This functions is not being currently used and has not been tested. Implement it as a standard for dashboards
      dashboardJSON = utils.textReplaceReferencesFromJSON(JSON.stringify(dashboardJSON), agreement, '>>>agreement.', '<<<');
      // Apply modifier functions of the dashboard
      var dashboardJSON = dashboardModifier.modifyJSON(JSON.parse(dashboardJSON), agreement, dashboardId);
    }
    res.status(200).send(dashboardJSON);
  } catch (err) {
    logger.error('Error getting dynamic dashboard. agreementId: ' + agreementId + ' dashboardId: ' + dashboardId + ' - ERROR: ' + err);
    res.status(400).send(err);
  }
};
