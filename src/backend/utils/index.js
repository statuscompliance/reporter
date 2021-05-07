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

const moment = require('moment-timezone');
var _ = require('lodash');

module.exports = {
  swagger: require('./swagger.js'),
  getPeriods: _getPeriods,
  convertPeriodToName: _convertPeriodToName,
  convertPeriodToShort: _convertPeriodToShort,
  textReplaceReferencesFromJSON: textReplaceReferencesFromJSON
};

/**
 * This method return a set of periods which are based on a window parameter.
 * @param {AgreementModel} agreement agreement model passed
 * @param {WindowModel} window window model passed
 * @return {Set} set of periods
 * @alias module:gUtils.getPeriods
 * */
function _getPeriods (agreement, window) {
  var periods = [];
  var Wfrom = moment.utc(moment.tz(window.initial, agreement.context.validity.timeZone));
  var Wto = window.end ? moment.utc(moment.tz(window.end, agreement.context.validity.timeZone)) : moment.utc();

  var from = moment.utc(moment.tz(Wfrom, agreement.context.validity.timeZone));
  var to = moment.utc(moment.tz(Wfrom, agreement.context.validity.timeZone).add(1, 'months').subtract(1, 'milliseconds'));

  while (!to || to.isSameOrBefore(Wto)) {
    periods.push({
      from: from.toISOString(),
      to: to.toISOString()
    });
    from = moment.utc(moment.tz(from, agreement.context.validity.timeZone).add(1, 'months'));
    to = moment.utc(moment.tz(from, agreement.context.validity.timeZone).add(1, 'months').subtract(1, 'milliseconds'));
  }

  return periods;
}

/**
 * This method return the name of corresponding period
 * @param type Type of periods ("daily", "monthly", "yearly")
 * @return {String} Name of corresponding fractions
 * */

var conversionTable = [
  { period: 'secondly', name: 'second', short: '1s' },
  { period: 'minutely', name: 'minute', short: '1m' },
  { period: 'hourly', name: 'hour', short: '1h' },
  { period: 'daily', name: 'day', short: '1d' },
  { period: 'weekly', name: 'week', short: '1w' },
  { period: 'biweekly', name: 'biweek', short: '2w' },
  { period: 'monthly', name: 'month', short: '1M' },
  { period: 'quarterly', name: 'quart', short: '3M' },
  { period: 'yearly', name: 'year', short: '1y' }
];

function _convertPeriodToShort (str) {
  return conversionTable.find(x => x.period === str).short;
}

function _convertPeriodToName (str) {
  return conversionTable.find(x => x.period === str).name;
}

// This function receives a text when variables can be declared with [startingDefinition].???.???[endDefinition] and replace them with the json content referenced
// Example: textReplaceReferencesFromJSON(JSON.stringify(targetText), agreement, '>>>agreement.', "<<<"))
// This function will replace all variables in text like >>>agreement.id<<< with the property id of the json
function textReplaceReferencesFromJSON (targetText, json, startingDefinition, endDefinition) {
  var finalText = targetText;
  // Returns an array of array with format [key, value], [key, value]
  // Key is the complete unparsed text >>>agreement.id<<<, and the value the parsed text (id)
  const matches = [...targetText.matchAll(startingDefinition + '([^<]+)' + endDefinition)];
  matches?.forEach((match) => {
    // Variable replacement
    finalText = finalText.replace(match[0], _.get(json, match[1]));
  });
  return finalText;
}

/**
 * This method return a set of periods which are based on a window parameter.
 * @param periodType Type of periods ("daily", "monthly", "yearly")
 * @param {String} timeZone Time Zone of agreement
 * @param {String} from Initial date for periods
 * @param {String} to (Optional) Finish date for periods
 * @return {Set} set of periods
 * */
/* function _createPeriods (periodType, timeZone, from, to) {
  var periods = [];
  var Wfrom = moment.utc(moment.tz(from, timeZone));
  var Wto = to ? moment.utc(moment.tz(to, timeZone)) : moment.utc();

  var from = moment.utc(moment.tz(Wfrom, timeZone));
  var to = moment.utc(moment.tz(Wfrom, timeZone).add(1, periodType).subtract(1, 'milliseconds'));

  while (!to || to.isSameOrBefore(Wto)) {
    periods.push({
      from: from.toISOString(),
      to: to.toISOString()
    });
    from = moment.utc(moment.tz(from, timeZone).add(1, periodType));
    to = moment.utc(moment.tz(from, timeZone).add(1, periodType).subtract(1, 'milliseconds'));
  }

  return periods;
} */
