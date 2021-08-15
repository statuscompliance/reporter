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

/// //////////////////////// EXT DEPENDENCIES ///////////////////////////
const Promise = require('bluebird');
const governify = require('governify-commons');
const moment = require('moment-timezone');
const JSONStream = require('JSONStream');
const stream = require('stream');
const RRule = require('rrule').RRule
const RRuleSet = require('rrule').RRuleSet
const rrulestr = require('rrule').rrulestr

/// //////////////////////// INT DEPENDENCIES ///////////////////////////
const config = governify.configurator.getConfig('main');
const logger = governify.getLogger().tag('service-reporter-index');
const utils = require('../../utils');

/// //////////////////////// PRIVATE ATTRIBUTES ///////////////////////////
const _contractId = Symbol();
const _guaranteesStateURL = Symbol();
const _metricsStateURL = Symbol();
const _isExecutionFinished = Symbol();
const _kpiParam = Symbol();
const _agreement = Symbol();
const _contractDate = Symbol();
const _persistence = Symbol();
const _metricsForOnDemandCalculation = Symbol();

/// //////////////////////////////////////////////////////////// BEGIN CLASS ///////////////////////////////////////////////////////////////
class Reporter {
  /// //////////////////////// BEGIN CONSTRUCTOR ///////////////////////////
  constructor(persistence) {
    this._persistence = persistence;
  }
  /// //////////////////////// END CONSTRUCTOR ///////////////////////////

  /// //////////////////////// SETTERS ///////////////////////////
  set isExecutionFinished(new_isExecutionFinished) {
    this._isExecutionFinished = new_isExecutionFinished;
  }

  set contractId(new_contractId) {
    this._contractId = new_contractId;
    this._agreementURL = config.v1.agreementURL + new_contractId;
    this._guaranteesStateURL = config.v1.statesURL + new_contractId + '/guarantees' + (this._kpiParam ? '/' + this._kpiParam : '');
    this._metricsStateURL = config.v1.statesURL + new_contractId + '/metrics/';
  }

  set kpiParam(new_kpiParam) {
    this._kpiParam = new_kpiParam;
    this._guaranteesStateURL = config.v1.statesURL + this._contractId + '/guarantees' + (new_kpiParam ? '/' + new_kpiParam : '');
  }
  /// //////////////////////// END SETTERS ///////////////////////////

  /// //////////////////////// GETTERS ///////////////////////////
  get agreementURL() {
    return this._agreementURL;
  }

  get kpiParam() {
    return this._kpiParam;
  }

  get isExecutionFinished() {
    return this._isExecutionFinished;
  }

  get contractId() {
    return this._contractId;
  }

  get guaranteesStateURL() {
    return this._guaranteesStateURL;
  }

  get metricsStateURL() {
    return this._metricsStateURL;
  }

  get agreement() {
    return this._agreement;
  }

  get contractDate() {
    return this._contractDate;
  }

  get persistence() {
    return this._persistence;
  }

  get metricsForOnDemandCalculation() {
    return this._metricsForOnDemandCalculation;
  }
  /// //////////////////////// END GETTERS ///////////////////////////

  /// //////////////////////// AUX FUNCTIONS ///////////////////////////
  static getFreq(Wperiod) {
    switch (Wperiod) {
      case "yearly": return RRule.YEARLY
      case "monthly": return RRule.MONTHLY
      case "weekly": return RRule.WEEKLY
      case "daily": return RRule.DAILY
      case "hourly": return RRule.HOURLY
    }
  }

  /*! Get the difference of an UTC date and the same date in a time zone
  *  @param date, a date in UTC
  *  @param timeZone, a timeZone supported by Intl
  *  @return an integer that represents the difference in hours of a date in UTC and
  *  the same date in a time zone
  */
  static getTimeZoneOffset(date, timeZone) {

    // Abuse the Intl API to get a local ISO 8601 string for a given time zone.
    const options = { timeZone, calendar: 'iso8601', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const dateTimeFormat = new Intl.DateTimeFormat(undefined, options);
    const parts = dateTimeFormat.formatToParts(date);
    const map = new Map(parts.map(x => [x.type, x.value]));
    const year = map.get('year');
    const month = map.get('month');
    const day = map.get('day');
    const hour = map.get('hour');
    const minute = map.get('minute');
    const second = map.get('second');
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}`;

    // Lie to the Date object constructor that it's a UTC time.
    const lie = new Date(iso + 'Z');

    // Return the difference in timestamps, as hours
    // Positive values are West of GMT, opposite of ISO 8601
    // this matches the output of `Date.getTimeZoneOffset`
    return -(lie - date) / 60 / 1000 / 60;
  }

  /**
     * This method returns a set of periods which are based on a window parameter.
     * @param {AgreementModel} agreement agreement model passed
     * @param {WindowModel} window window model passed
     * @return {Set} set of periods
     * @alias module:gUtils.getPeriods
     * */
  static getPeriods(agreement, window) {
    var dates;
    var periods = [];
    const periodTypes = ['yearly', 'monthly', 'weekly', 'daily', 'hourly']

    var Wfrom = new Date(window.initial);
    var Wto = window.end ? new Date(window.end) : new Date();

    if (periodTypes.indexOf(window.period) >= 0) {
      var rruleInit = new RRule({
        freq: this.getFreq(window.period),
        dtstart: Wfrom,
        until: Wto
      })
      var rruleFin = new RRule({
        freq: this.getFreq(window.period),
        dtstart: Wfrom,
        until: Wto,
        bysecond: -1
      })

      var rruleSet = new RRuleSet();
      rruleSet.rrule(rruleInit);
      rruleSet.rrule(rruleFin);
      dates = rruleSet.all();
    } else {
      var rules = window.period.split("---");
      var initPeriodRule = rrulestr(rules[0])
      var endPeriodRule = rrulestr(rules[1])

      var rruleSet = new RRuleSet();
      rruleSet.rrule(initPeriodRule);
      rruleSet.rrule(endPeriodRule);
      dates = rruleSet.between(new Date(Wfrom), new Date(Wto));
    }

    //Sorting dates
    dates.sort(function (a, b) {
      return a - b;
    });

    for (var i = 0; i < dates.length - 1; i += 2) {
      dates[i + 1].setMilliseconds(999)
      dates[i].setUTCHours(dates[i].getUTCHours() + this.getTimeZoneOffset(dates[i], agreement.context.validity.timeZone))
      dates[i + 1].setUTCHours(dates[i + 1].getUTCHours() + this.getTimeZoneOffset(dates[i + 1], agreement.context.validity.timeZone))
      periods.push({
        from: dates[i].toISOString(),
        to: dates[i + 1].toISOString()
      });
    }

    return periods;
  }
  /// //////////////////////// END AUX FUNCTIONS ///////////////////////////

  /// //////////////////////// MAIN FUNCTION ///////////////////////////
  process(periods) {
    return new Promise(async (resolve, reject) => {
      this._;
      logger.info('New request to get states for the agreement = %s', this._contractId);
      try {
        logger.info('Getting the agreements from Registry with contractId = %s', this._contractId);
        const agreementRequest = await governify.infrastructure.getService('internal.registry').get('/api/v6/agreements/' + this._contractId).catch(err => {
          logger.error('Error while retrieving agreement: %s', error.toString().substr(0, 400));
          return reject(error.toString());
        });

        this._agreement = agreementRequest.data;
        logger.info('The agreement has been retrieved successfully');
        this._contractDate = this._agreement.context.validity.initial;
        logger.info('Setting agreement and initial date: %s', this._contractDate);

        logger.info('Retrieving info from: %s', this._guaranteesStateURL);

        // periods = ""; //TEMPORAL FIX
        if (!periods || periods == null || periods == '') {
          periods = Reporter.getPeriods(this._agreement, {
            initial: this._agreement.context.validity.initial
          });
        }

        logger.info('Periods for requests %s', JSON.stringify(periods, null, 2));

        Promise.each(periods, this._calculatePeriods.bind(this)).then((results) => {
          logger.info('All the periods have been processed (results length: %d)', results.length);
          return resolve(results);
        }).catch((error) => {
          return reject(error);
        });
      } catch (error) {
        logger.error('Unexpected error: ' + error.toString().substr(0, 400));
        return reject(error.toString());
      }
    });
  }
  /// //////////////////////// END MAIN FUNCTION ///////////////////////////

  /// //////////////////////// CORE FUNCTIONS ///////////////////////////
  _calculatePeriods(period, index) {
    return new Promise((resolve, reject) => {
      const url = this._guaranteesStateURL + '?from=' + period.from + '&to=' + period.to;
      logger.info('Request %d from %s', (index + 1), JSON.stringify(url, null, 2));
      const requestStream = request.get(url);

      requestStream.on('response', (response) => {
        if (response.code && response.code !== 200) {
          logger.error('Error while retrieving information from the period (%s,%s): %s', period.from, period.to, response.message);
          return reject(response.message);
        } else {
          logger.info('Connection with Registry successfully established');
          const kpis = [];

          logger.info('Receiving scoped guarantees information...');

          requestStream.pipe(JSONStream.parse()).on('error', (error) => {
            logger.error('Error while retrieving scoped guarantees information: %s', error);
            return reject(error);
          }).on('data', (guaranteeStates) => {
            if (guaranteeStates.code) {
              return reject(guaranteeStates.code);
            } else {
              this._processGuaranteeStates(guaranteeStates).catch((error) => {
                return reject(error);
              });
            }
          }).on('end', (data) => {
            return resolve(data);
          });
        }
      });
    });
  }

  _processGuaranteeStates(guaranteeStates) {
    return new Promise((resolve, reject) => {
      logger.info('Scoped guarantees states received: %d', guaranteeStates.length);
      Promise.each(guaranteeStates, this._calculateScopedGuaranteeState.bind(this)).then((results) => {
        logger.info('All the scoped guarantees states for the period been processed: %d', results.length);
        return resolve(results);

        if (false && this._metricsForOnDemandCalculation) { // FIXME: this feature should be modelled and defined in depth. Currently not supported
          logger.info('Receiving metrics information for on-demand calculation for this period...');
          Promise.each(this._metricsForOnDemandCalculation.names, this._calculateOnDemandMetric.bind(this)).then((metricsValues) => {
            logger.info('All the metrics for on-demand calculation for the period have been processed: %d', metricsValues.length);
            logger.info('Calculated metrics: ', metricsValues);
            return resolve(metricsValues);
          }, (error) => {
            logger.warn('Error while retrieving metrics information for on-demand calculation for the period : %s', JSON.stringify(error, 2));
            return reject(error);
          });
        }
      }, (error) => {
        logger.warn('Error while retrieving scoped guarantees states for the period: %s', JSON.stringify(error, 2));
        return reject(error);
      });
    });
  }

  // TODO: Remove. This method for recalculate point

  _calculateScopedGuaranteeState(scopedGuaranteeState, index, length) {
    return new Promise((resolve, reject) => {
      if (!this._kpiParam || this._kpiParam === scopedGuaranteeState.id) {
        logger.info('Processing KPI: %d/%d', (index + 1), length);
        if (scopedGuaranteeState.evidences) {
          Promise.each(scopedGuaranteeState.evidences, this._calculateEvidence.bind(this)).then((results) => {
            return resolve(results);
          });
        } else {
          logger.warn('There are no evidences for the KPI: %s', JSON.stringify(scopedGuaranteeState.id, null, 2));
          return resolve();
        }
      }
    });
  }

  _calculateEvidence(evidence, index, length) {
    return new Promise((resolve, reject) => {
      logger.info('Processing evidence: %d/%d', (index + 1), length);
      //  logger.warn("Guarantee to: %s", scopedGuaranteeState.period.to);
      logger.warn('Limit TO: %s', moment.tz(this._agreement.context.validity.end, this._agreement.context.validity.timeZone).subtract(1, 'milliseconds').toISOString());

      this._generateResponse(this._agreement, this._month, this._contractDate, this._scopedGuaranteeState, evidence).then((elementProcessed) => {
        return resolve(elementProcessed);
      });
    });
  }
  /// //////////////////////// END CORE FUNCTIONS ///////////////////////////

  /// //////////////////////// BEGIN OVERRIDABLE BUSINESS FUNCTIONS ///////////////////////////
  _generateResponse(kpi, evidence) {
    return new Promise((resolve, reject) => {
      return reject('This abstract Reporter cannot generate a response. Please consider using a specific implementation.');
    });
  }
  /// //////////////////////// END OVERRIDABLE BUSINESS FUNCTIONS ///////////////////////////

  /// //////////////////////// METRIC ON DEMAND FUNCTIONS ///////////////////////////
  _calculateOnDemandMetric(metricId) {
    logger.info('Receiving %s for this period...', metricId);
    return new Promise((resolve, reject) => {
      // TODO: now it only supports priority calculation.
      Promise.each(this._metricsForOnDemandCalculation.scope.priorities, this._calculateScopedOnDemandMetric.bind(this)).then((scopedMetricValues) => {
        logger.info('All the scoped metrics for on-demand calculation for the period %s have been processed: %d', JSON.stringify(period), scopedMetricValues.length);
        logger.info('Calculated scoped metrics: %s', scopedMetricValues);
        return resolve(scopedMetricValues);
      }, (error) => {
        logger.warn('Error while retrieving scoped metrics information for on-demand calculation for metric %s', metricId, JSON.stringify(error, 2));
        return reject(error);
      });
    });
  }

  _calculateScopedOnDemandMetric(priority) {
    // TODO: now it only supports priority calculation.
    logger.info('Receiving metric scope %s for this period...', priority);
    return new Promise(async (resolve, reject) => {
      logger.info('Getting scoped metric %s ', url);

      // FIXME
      const params = '?' +
        'scope.priority=' + String(priority) +
        '&scope.type=' + String('*') +
        '&scope.serviceLine=' + String(agreement.context.definitions.scopes[this._contractId].serviceLine.default) +
        '&scope.activity=' + String(agreement.context.definitions.scopes[this._contractId].activity.default) +
        '&window.type=' + String('static') +
        '&window.period=' + String('monthly') +
        '&window.initial=' + String(period.from) +
        '&window.timeZone=' + String(agreement.context.validity.timeZone) +
        '&parameters.schedule=' + this._agreement.terms.guarantees.filter((g) => g.id === metricId)[0].of[0].with[metricId].schedule +
        '&parameters.deadline=' + this._agreement.terms.guarantees.filter((g) => g.id === metricId)[0].of[0].with[metricId].deadline +
        '&log.' + this._metricsForOnDemandCalculation.logName + '.uri=' + String(agreement.context.definitions.logs[this._metricsForOnDemandCalculation.logName].uri);

      const queryURL = (metricsStateURL + metricId + params).replace('//,/');

      logger.info('Doing request to retrieve scoped metric to:', queryURL);

      const metricsRequest = await governify.infrastructure.getService('internal.registry').get('/api/v6/states/' + this._contractId + '/metrics/' + metricId + params).catch(err => {
        logger.warn('There was an error while retrieving metric: ' + err.toString().substr(0, 400));
        return reject('There was an error while retrieving metric: ' + err.toString());
      });
      const metricsStates = metricsRequest.data;

      logger.info('All metrics %s', metricsStates);
      const metricsStatesArray = JSON.parse(metricsStates);
      logger.info('Metrics length %d type of %s', metricsStatesArray.length, typeof metricsStatesArray);
      if (metricsStatesArray && Array.isArray(metricsStatesArray)) {
        logger.info('Processing metric response');
        Promise.each(metricsStatesArray, (metricState, index, length) => {
          return new Promise((resolve, reject) => {
            logger.info('Processing metric: %d/%d', (index + 1), length);
            this._generateOnDemandMetricResponse(metricState).then((elementProcessed) => {
              return resolve(elementProcessed);
            });
          });
        }).then((results) => {
          logger.info('Finished metric calculation %s, with scope: %s', metricId, priority);
          return resolve(results);
        });
      }
    });
  }

  _generateOnDemandMetricResponse(metricState) {
    return new Promise((resolve, reject) => {
      logger.error('_generateOnDemandMetricResponse NOT implemented yet.');
      return reject('_generateOnDemandMetricResponse NOT implemented yet.');
    });
  }
  /// //////////////////////// END METRIC ON DEMAND FUNCTIONS ///////////////////////////

  /// //////////////////////////////////////////////////////////// END CLASS ///////////////////////////////////////////////////////////////
}

module.exports = {
  Reporter: Reporter
};
