/*
	#########################################
	######                             ######
	#####    Torn API Reader (TAPIR)    #####
	##### copyright Bobogoobo [2618206] #####
	######                             ######
	#########################################

	https://github.com/Bobogoobo/tapir

	Please credit me if using any part of this and do not redistribute this file. I'd rather enhance this version than have forks.
	For any suggestions, questions, or issues, please create an issue on GitHub or mail me in game (not chat) or message me on Discord (I'm verified in the Torn server).
	If you do something cool using this, feel free to send me a link!
*/

'use strict';

/* Returns current log format version. Placed here to try to remember to update it. */
function getLogVersion() {
	return 'v0.1';
}

/* Check whether the given object is empty, if it is an object. Non-plain objects are not treated differently.
	*obj: the object to check.
*/
function isEmptyObject(obj) {
	return typeof obj === 'object' && obj !== null && !Object.keys(obj).length;
}

/* Very simple conversion of an array-like object to an array (e.g. HTMLCollection).
	*arrayLike: the object to convert to an array.
*/
function arrayFrom(arrayLike) {
	if (!arrayLike.length) { return undefined; }
	var arr = [];
	for (var item = 0; item < arrayLike.length; item++) {
		arr.push(arrayLike[item]);
	}
	return arr;
}

/* Create Or Update Sub-Property State for an object that has a property that is an object that has dynamic keys.
	*obj: the object to access.
	*outer: the name of the outer property.
	*inner: the name of the inner property. Omit this to set the value of the outer property (must be `undefined` if using later parameters).
	*value: the value to set for the inner property. Omit this to increment the value (must be `undefined` if using later parameters).
	*createOnly: pass `true` to retain the current value if one is present.
*/
function cousps(obj, outer, inner, value, createOnly) {
	//Note: x = x+1 || 1 is a shortcut using undefined+1 = NaN
	if (inner !== undefined) {
		if (!obj[outer]) {
			obj[outer] = {};
		}
		obj[outer][inner] = createOnly && obj[outer][inner] ? obj[outer][inner] : value !== undefined ? value : obj[outer][inner] + 1 || 1;
	} else {
		obj[outer] = createOnly && obj[outer] ? obj[outer] : value !== undefined ? value : obj[outer] + 1 || 1;
	}
}

/* Conditionally compare two values while accounting for one or both being missing. Can be used with sort methods.
	If either value is falsy (other than 0), returns the other value. If both are, returns null. (When mode is sort, falsy values are treated as lowest by default.)
	*a: the first value.
	*b: the second value.
	*mode: `sort` (returns a value to use in e.g. `Array.sort`), `min` (lower of the two values), or `max` (higher of the two values).
	*descend: if mode is sort, pass `true` to sort descending, otherwise sort will be ascending.
	*flipFalse: if mode is sort, pass `true` to reverse the ordering of non-zero falsy values (i.e. they will come last ascending and first descending).
*/
function compare(a, b, mode, descend, flipFalse) {
	//note: array comparisons coerce to string, so don't need to check those
	var aFalse = (!a && a !== 0) || isEmptyObject(a);
	var bFalse = (!b && b !== 0) || isEmptyObject(b);
	if (aFalse && bFalse) {
		return mode === 'sort' ? 0 : null;
	}
	if (aFalse) {
		return mode === 'sort' ? (-1 * (+!descend || -1) * (+!flipFalse || -1)) : b;
	}
	if (bFalse) {
		return mode === 'sort' ? (1 * (+!descend || -1) * (+!flipFalse || -1)) : a;
	}
	if (mode === 'max' || mode === 'min') {
		return Math[mode](a, b);
	} else if (mode === 'sort') {
		if (descend) {
			return a < b ? 1 : a > b ? -1 : 0;
		} else {
			return a > b ? 1 : a < b ? -1 : 0;
		}
	}
	return mode === 'sort' ? 0 : undefined;
}

/* Set multiple attributes on an Element at once. Returns the element.
	The following special names will be set directly as properties: innerHTML.
	*el: the Element to use.
	*attrs: an object of the attributes and values to set.
*/
function setAttributes(el, attrs) {
	Object.keys(attrs).forEach(function(attr) {
		if (attr === 'innerHTML') {
			el[attr] = attrs[attr];
		} else {
			el.setAttribute(attr, attrs[attr]);
		}
	});
	return el;
}

/* This should be the only function called from HTML. It sets `this` appropriately for the requested function.
	Only use from the program if `this` is required and different from the automatic context.
	*func: the name of the function to call within  the `ui` property.
	*pone (optional): first parameter to pass to the given function.
	*ptwo (optional): second parameter to pass to the given function.
	*pthree (optional): third parameter to pass to the given function.
*/
function TAPIR(func, pone, ptwo, pthree, pfour) {
	window.TornAPIReader.ui[func].call(window.TornAPIReader, pone, ptwo, pthree, pfour);
}

/* The main program object, contains all logic and data. */
window.TornAPIReader = {
	/* State variables that change while the program is running. */
	runtime: {},
	/* Variables configured by the user at initiation. */
	config: {},
	/* Variables for information gathered by the program. */
	data: {},
	/* Call to initialize data structures on each run of the program. */
	init: function() {
		this.runtime = {
			isRunning: false,// whether the program is currently making requests and/or processing data
			pending: 0,// number of unresolved requests
			reachedEnd: false,// whether all logs have been retrieved
			count: 0,// total number of log lines read
			requests: 0,// total number of requests made
			milestone: 0,// percentage completion, marked every 10
			startTime: null,// unix timestamp at which the program was started
		};
		this.config = {
			requestRate: 1,// request interval in seconds
			key: '',// user's API key
			modules: [],// array of names of routines to run
			useStored: true,// whether to use log data stored in the program (from previous run or reading a file)
			saveLogs: false,// whether to keep a record of all logs for user to save
			progressInterval: 10,// percentage of estimated progress to trigger a notification
			limitCount: -1,// maximum number of logs to retrieve
			limitInterval: -1,// maximum time (in seconds) to go back
			limitDate: -1,// unix timestamp representing the earliest date/time to go back to
		};
		this.data = {
			id: '',// user's Torn ID
			name: '',// user's Torn username
			signup: '',// user's date of registration on Torn as a unix timestamp
			logs: this.data.logs || {},// user's logs are stored here if requested
			logVersion: this.data.logVersion || null,// log format version of user-submitted logs
			torn: {
				logCategories: {},// the list of log categories (id -> name) from the Torn API
				logCatByName: {},// the above, inverted (category name -> id)
				logTypes: {},// the list of log types (id -> description) from the Torn API
			},
		};
	},
	/* Contains all ID mappings. */
	logIDs: {
		/* IDs built into Torn (usually the log) but not available from the API. Loaded from another file. */
		torn: {},
		/* An object to convert some common log strings to IDs. Using arrays for ease of use.
			Values must be unique and start from 1 (0 for no value).
			Keys should be lowercase and singular, sorted alphabetically.
		*/
		custom: {
			captcha: ['', 'image captcha', 'text captcha', 'reCaptcha'],
			cityjob: ['', 'Army', 'Grocer', 'Casino', 'Medical', 'Education', 'Law'],
			combatstat: ['', 'strength', 'defense', 'speed', 'dexterity'],
			highlow: ['', 'high', 'low', 'draw'],
			hunting: ['', 'a beginners hunting session', 'a standard hunting session', 'an advanced hunting session'],
			key: ['', 'Public Only', 'Minimal Access', 'Limited Accesss', 'Full Access'],
			lottery: ['', 'Daily Dime', 'Lucky Shot', 'Holy Grail'],
			missiondiff: ['', 'very easy', 'easy', 'medium', 'hard', 'very hard', 'expert'],
			missiontype: ['', 'mission', 'contract'],
			revive: ['', 'allow everyone', 'allow friends and faction', 'allow nobody'],
			staff: ['', 'Maid', 'Butler', 'Guard', 'Doctor', 'Pilot'],
			travel: ['', 'standard', 'personal', 'private', 'business'],
			upgrade: [
				'', 'Sufficient Interior Modification', 'Superior Interior Modification',
				'Hot Tub', 'Sauna', 'Open Bar', 'Small Pool', 'Medium Pool', 'Large Pool',
				'Small Vault', 'Medium Vault', 'Large Vault', 'Extra Large Vault',
				'Medical Facility', 'Advanced Shooting Range', 'Airstrip', 'Private Yacht'
			],
			virus: ['', 'a simple', 'a polymorphic', 'a tunneling', 'an armored', 'a stealth', 'a firewalk'],
			wheel: ['', 'the Wheel of Lame', 'the Wheel of Mediocrity', 'the Wheel of Awesome'],
		},
	},
	/* Regular expressions stored for re-use in the program. */
	regex: {
		key: /[?&]key\=\w{16}/,
		numeric: /ID\=(\d+)/,
		userid: /XID\=(\d+)/,
		linkText: /\<a\s?[^>]*\>([^<]*)\<\/a\>/,
		spanText: /\<span\s?[^>]*\>([^<]*)\<\/span\>/,
	},
	/* Convert a description of a duration to a number of seconds for use with unix timestamps. Returns the number of seconds.
		Input must be an array in the following order, all optional: years, months, days, hours, minutes, seconds.
		*arr: the array to parse.
	*/
	parseDuration: function(arr) {
		return 0 +
			parseInt(arr[0] || 0, 10) * 365.25 * 86400 +
			parseInt(arr[1] || 0, 10) * 30.4375 * 86400 +// 365.25 / 12
			parseInt(arr[2] || 0, 10) * 86400 +
			parseInt(arr[3] || 0, 10) * 3600 +
			parseInt(arr[4] || 0, 10) * 60 +
			parseInt(arr[5] || 0, 10);
	},
	/* Returns the web address for an API request given the information to look for.
		See the Torn API documentation for more information: https://www.torn.com/api.html
		*key: the player's API key.
		*to (optional): a unix timestamp for the latest time from which to return data.
		*selections (optional): items of data to get from the API. Defaults to `log`. Pass `null` for no selections.
		*zone (optional): the area of the API to query (see documentation). Defaults to `user`.
		*id (optional): the identifier for the entity to look up (usually not required for the key owner's information).
	*/
	apiuri: function(key, to, selections, zone, id) {
		var comment = 'TAPIR';
		zone = zone || 'user';
		id = id || '';
		selections = selections === null ? '' : 'selections=' + (selections || 'log');
		to = to ? '&to=' + to : '';
		key = '&key=' + key;
		
		return 'https://api.torn.com/' + zone + '/' + id + '?' + selections + to + key + '&comment=' + comment;
	},
	/* Handles making and receiving an asynchronous web request, then passing the response (if valid) to a callback.
		If an error occurs and can't be resolved, ends execution of the program.
		You must increment the pending requests counter before calling this and decrement it in the handler.
		*url: the web address to request.
		*handler: the callback function, which will be passed a JSON parsed object and the URL requested (with API key redacted).
		*self: pass through `this` since this function is often called through a timer.
		*isRetry (optional): internal use only - marks if this is the second try for a request.	
	*/
	request: function(url, handler, self, isRetry) {
		var json, toRetry = false, errorText = '';
		var req = new XMLHttpRequest();
		req.onreadystatechange = function() {
			if (req.readyState !== XMLHttpRequest.DONE) {
				return;
			}
			if (req.status === 200) {
				try {
					json = JSON.parse(req.responseText);
					if (json.error) {
						throw new Error('API returned error: ' + json.error.error);
					}
				} catch (err) {
					toRetry = true;
					errorText = err.toString();
				}
			} else {
				toRetry = true;
				errorText = req.status + ' ' + req.statusText;
			}
			//Retry once after one minute
			if (toRetry) {
				self.runtime.pending -= 1;
				if (isRetry) {
					self.ui.putlog(['Stopping - an error occurred.', errorText, url.replace(self.regex.key, '')], 'error');
					return;
				}
				self.ui.putlog('There was an issue with the request. Retrying in one minute: ' + url.replace(self.regex.key, ''), 'warning');
				self.runtime.pending += 1;// set before end of timer
				setTimeout(self.request, 60000, url, handler, self, true);
			} else {
				handler.call(self, json, req.responseURL.replace(self.regex.key, ''));
			}
		};
		self.runtime.requests += 1;
		req.open('GET', url);
		req.send();
	},
	/* Formats and initiates the requests to gather auxiliary data requested by modules, async with log requests.
		*requires: a flat array of all endpoints requested by modules. Does not need to be uniques only.
	*/
	readRequire: function(requires) {
		var endpoints = {};
		requires.forEach(function(require) {
			var req = require.split('.');
			req[0] = req[0].trim();
			req[1] = req[1].trim();
			if (req[2] || !req[1]) {
				this.ui.putlog('Invalid require specified. Any routines using it may not work: ' + require, 'warning');
				return;
			}
			if (!endpoints[req[0]]) {
				endpoints[req[0]] = [];
			}
			if (endpoints[req[0]].indexOf(req[1]) === -1) {
				endpoints[req[0]].push(req[1]);
			}
		});
		Object.keys(endpoints).forEach(function(zone, i) {
			var selections = endpoints[zone].sort().join(',');
			var uri = this.apiuri(this.config.key, '', selections, zone);
			var delay = this.config.requestRate * 1000 * (this.config.useStored ? 1 : 2) * (i + 1);
			this.runtime.pending += 1;// set before end of timer
			setTimeout(this.request, delay, uri, this.handleRequire, this);
		}, this);
		//If no requires were found, still need to check if it's time to finish
		if (!requires.length) {
			this.runtime.pending += 1;
			this.handleRequire({}, '/fake/?');
		}
	},
	/* Handles each response for requested auxiliary data, standardizing data and storing it where needed.
		*response: the JSON data obtained by request().
		*url: the requested URL.
	*/
	handleRequire: function(response, url) {
		var zone = url.match(/\/([a-z]+)\/\?/)[1];
		Object.keys(response).forEach(function(endpoint) {
			var path = zone + '.' + endpoint;
			//Begin specific data items to manipulate
			if (path === 'torn.items') {
				var unusedItems = [];
				//For items, store base URL and remove it from each item to save a bit of space
				var filePath = response[endpoint][1].image.split(/(\d)/);// first item is keyed 1, this is not array access
				Object.keys(response[endpoint]).forEach(function(item) {
					response[endpoint][item].image = response[endpoint][item].image.replace(filePath[0], '');
					if (response[endpoint][item].type === 'Unused') {
						unusedItems.push(item);
					}
				});
				response[endpoint].base_url = filePath[0];
				//Remove unused items
				unusedItems.forEach(function(item) {
					delete response[endpoint][item];
				});
			}
			//End manipulation
			//Begin replacing strings with custom IDs
			if (path === 'torn.properties') {
				var customIDs = [this.logIDs.custom.staff, this.logIDs.custom.upgrade];
				Object.keys(response[endpoint]).forEach(function(property) {
					//shortening keys as well
					response[endpoint][property].staff = response[endpoint][property].staff_available.map(function(staff) {
						return customIDs[0].indexOf(staff);
					});
					response[endpoint][property].upgrades = response[endpoint][property].upgrades_available.map(function(upgrade) {
						return customIDs[1].indexOf(upgrade);
					});
					delete response[endpoint][property].staff_available;
					delete response[endpoint][property].upgrades_available;
				});
			}
			//End custom IDs
			//add to relevant module data
			this.config.modules.forEach(function(modus) {
				var routine = this.routines[modus];
				if (routine.require && routine.require.indexOf(path) !== -1) {
					routine.data = routine.data || {};
					routine.data.torn = routine.data.torn || {};
					routine.data.torn[zone] = routine.data.torn[zone] || {};
					routine.data.torn[zone][endpoint] = response[endpoint];
				}
			}, this);
		}, this);
		
		this.runtime.pending -= 1;
		if (this.config.useStored && !this.runtime.pending) {
			this.runtime.reachedEnd = true;
		}
		//check for completion in case log requests finish first or using stored
		if (this.runtime.reachedEnd && !this.runtime.pending) {
			if (this.config.useStored) {
				this.readStoredLogs();
			} else {
				this.finish();
			}
		}
	},
	/* Handles the request loop for obtaining a full log from the API, processing each line, and storing it if requested.
		*response: the JSON data obtained by request().
	*/
	readLogs: function(response) {
		var logLine, dataStaging, datum, nextTo;
		if (response.log) {
			Object.keys(response.log).forEach(function(logHash, logIndex, hashArr) {
				this.runtime.count += 1;
				logLine = response.log[logHash];
				dataStaging = {
					'timestamp': logLine.timestamp,
					'category': this.data.torn.logCatByName[logLine.category],
					'title': logLine.log,
					'data': {},
				};
				Object.keys(logLine.data || {}).forEach(function(datumName) {
					datum = logLine.data[datumName];
					//Begin specific data items to manipulate
					//  roughly in order of magnitude and importance of change
					if (logLine.category === 'Attacking' && datumName === 'log') {
						datum = datum.match(/ID\=(\w{32})/)[1];//extract hash from link
					}
					if (logLine.title === 'Hospital' && datumName === 'reason') {
						if (/^(?:Lost to|Attacked by|Mugged by|Hospitalized by)/.test(datum)) {
							//Check if stealthed - add new key for user
							if (this.regex.userid.test(datum)) {
								dataStaging.data.user = parseInt(datum.match(this.regex.userid)[1], 10);
								datum = datum.replace(this.regex.linkText, '$1');
							} else {
								dataStaging.data.user = 0;
							}
						} else if (/^Crashed (?:his|her) /.test(datum)) {
							//consistency with most other strings
							datum = datum.replace(/his|her/, 'their');
						}
					}
					if (logLine.title === 'Jail' && datumName === 'reason') {
						if (/^(?:Arrested by|Was caught trying to break out (?!of jail))/.test(datum)) {
							//todo: verify with someone's data what stealthed arrest receive looks like, assuming it's possible
							if (datum === 'Arrested by someone.') {
								dataStaging.data.user = 0;
							} else {
								dataStaging.data.user = parseInt(datum.match(this.regex.userid)[1], 10);// add new key for user
								datum = datum.replace(this.regex.linkText, '$1');
							}
						}
						//Remove trailing period inconsistency
						if (datum[datum.length - 1] === '.') {
							datum = datum.slice(0, -1);
						}
					}
					if (logLine.title === 'Company train receive' && datumName === 'working_stats_received') {
						//Fix missing first value if 0. Note: using default key due to not being replaced until later
						if (datum.charAt(0) === ',') {
							datum = '0' + datum;
						}
					}
					if (logLine.category === 'Trades' && datumName === 'trade_id' && logLine.title !== 'Trade expire') {
						datum = parseInt(datum.match(this.regex.numeric)[1], 10);
					}
					if (logLine.title === 'Bounty place' || logLine.title === 'Bounty place receive') {
						if (datumName === 'reason' && datum !== '') {
							datum = datum.replace(this.regex.spanText, '$1').replace(' : ', '');
						}
						if (datumName === 'anonymous') {
							datum = !!datum ? 1 : 0;
						}
					}
					if ((logLine.title === 'Racing finish official race' || logLine.title === 'Racing upgrade car') && datumName === 'racing_points') {
						datum = parseInt(datum.replace(/ racing points?/i, ''), 10);
						datumName = 'points';
					}
					if ((logLine.title === 'Racing finish custom race' || logLine.title === 'Racing finish official race') && datumName === 'position') {
						datum = parseInt(datum.replace(/\D/g, ''), 10);
					}
					if ((logLine.title === 'Casino russian roulette result' || logLine.title === 'Casino russian roulette opponent result') && datumName === 'result') {
						if (datum === '*CLICK*') {
							datum = 0;
						} else if (datum === '*BANG*') {
							datum = 1;
						}
					}
					if ((logLine.title === 'Faction organized crimes initiate' || logLine.title === 'Faction organized crimes initiate receive') && datumName === 'result') {
						if (datum === 'failure') {
							datum = 0;
						} else if (datum === 'success') {
							datum = 1;
						}
					}
					if ([
						'Racing join custom race', 'Racing finish custom race',
						'Casino russian roulette start', 'Casino russian roulette join', 'Casino russian roulette opponent join'
						].indexOf(logLine.title) !== -1 && datumName === 'passworded'
					) {
						datum = !!datum ? 1 : 0;
					}
					if (logLine.category === 'Gym') {
						if (this.logIDs.custom.combatstat.indexOf(datumName.replace('_before', '')) > 0) {
							dataStaging.data.stat = this.logIDs.custom.combatstat.indexOf(datumName.replace('_before', ''));// add new key in order
							datumName = 'before';
							//fix API inconsistency in data type
							datum = parseFloat(datum, 10);
						} else if (this.logIDs.custom.combatstat.indexOf(datumName.replace('_after', '')) > 0) {
							datumName = 'after';
						} else if (this.logIDs.custom.combatstat.indexOf(datumName.replace('_increased', '')) > 0) {
							datumName = 'increased';
						}
					}
					if ((logLine.title === 'Faction organized crimes plan' || logLine.title === 'Faction organized crimes initiate') && datumName === 'users') {
						//fix inconsistent data type
						datum[0] = parseInt(datum[0], 10);
					}
					if (logLine.category === 'Casino' && (datumName === 'player_cards' || datumName === 'dealer_cards')) {
						//fix inconsistent data type, but making them arrays of ints anyway since cards seem to be in order
						if (typeof datum === 'number') {
							datum = datum.toString();
						}
						datum = datum.split(',').map(function(d) {
							return parseInt(d, 10);
						});
					}
					if (logLine.title === 'Casino russian roulette leave' && datumName === 'opponent') {
						if (datum === '') {
							datum = null;
						}
					}
					if (logLine.title === 'Hunting' && datumName === 'hunting_skill') {
						datum = parseFloat(datum, 10);
					}
					if (logLine.title === 'Easter egg hunt pickup brown egg' && datumName === 'working_stat_increased') {
						//key is inconsistent, and shorten it like the others anyway
						datumName = 'working_stats';
					}
					if (
						['Company train receive', 'Company employee pay', 'Job pay', 'Education complete'].indexOf(logLine.title) !== -1 && 
						datumName === 'working_stats_received'
					) {
						datumName = 'working_stats';
					}
					if (
						['Casino spin the wheel win casino tokens', 'Points casino token refill', 'Easter egg hunt pickup orange egg'].indexOf(logLine.title) !== -1 &&
						datumName === 'casino_tokens_increased'
					) {
						datumName = 'tokens';
					}
					if (logLine.title === 'Property rental market rent owner' && ['Rent', 'Days', 'Happy', 'Renter'].indexOf(datumName) !== -1) {
						datumName = datumName.toLowerCase();
					}
					//Begin replacing strings with custom IDs
					//  in order of logIDs.custom key name
					if (logLine.category === 'Captcha' && datumName === 'type') {
						datum = this.logIDs.custom.captcha.indexOf(datum);
					}
					if (logLine.category === 'Job' && datumName === 'job') {
						datum = this.logIDs.custom.cityjob.indexOf(datum);
					}
					if (['Casino high-low lose', 'Casino high-low draw', 'Casino high-low win'].indexOf(logLine.title) !== -1 && (datumName === 'action' || datumName === 'result')) {
						datum = this.logIDs.custom.highlow.indexOf(datum);
					}
					if (logLine.title === 'Hunting' && datumName === 'session_type') {
						datum = this.logIDs.custom.hunting.indexOf(datum);
					}
					if ((logLine.title === 'API key add' || logLine.title == 'API key delete') && datumName === 'access_level') {
						datum = this.logIDs.custom.key.indexOf(datum);
					}
					if ((logLine.title === 'Casino lottery bet' || logLine.title === 'Casino lottery win') && datumName === 'lottery') {
						datum = this.logIDs.custom.lottery.indexOf(datum);
					}
					if (logLine.category === 'Missions' && datumName === 'difficulty') {
						datum = datum.replace(/^v/, 'very ');
						datum = this.logIDs.custom.missiondiff.indexOf(datum);
					}
					if (logLine.category === 'Missions' && datumName === 'type') {
						datum = this.logIDs.custom.missiontype.indexOf(datum);
					}
					if (logLine.category === 'Revive preference' && datumName === 'result') {
						datum = this.logIDs.custom.revive.indexOf(datum);
					}
					//todo: verify using someone's data - what datumName is and if it's an array with strings capitalized
					if (logLine.title === 'Property staff' && datumName === 'staff') {
						datum = datum.map(function(staff) {
							return this.logIDs.custom.staff.indexOf(staff);
						}, this);
					}
					if (logLine.title === 'Travel initiate' && datumName === 'travel_method') {
						datum = this.logIDs.custom.travel.indexOf(datum);
					}
					if (logLine.title === 'Property upgrade' && datumName === 'upgrades') {
						datum = datum.map(function(upgrade) {
							//First need to make strings consistent with torn.properties list
							if (/interior/i.test(upgrade)) {
								upgrade = upgrade + ' modification';
							}
							upgrade = upgrade.replace(/\s\S/g, function(match) { return match.toUpperCase(); });
							return this.logIDs.custom.upgrade.indexOf(upgrade);
						}, this);
					}
					if (logLine.category === 'Viruses' && datumName === 'virus') {
						datum = this.logIDs.custom.virus.indexOf(datum);
					}
					//todo: If the "Spin the wheel" category gets implemented, use that instead
					if (logLine.category === 'Casino' && /^Casino spin the wheel/.test(logLine.title) && datumName === 'wheel') {
						datum = this.logIDs.custom.wheel.indexOf(datum);
					}
					//End custom IDs
					//End manipulation
					if (datum === undefined) {
						datum = null;
					}
					dataStaging.data[datumName] = datum;
				}, this);
				if (isEmptyObject(dataStaging.data)) {
					delete dataStaging.data;
				}
				if (this.config.saveLogs) {
					this.data.logs[logHash] = dataStaging;
				}
				this.processRoutines(dataStaging, logHash);
				if (logIndex === hashArr.length - 1) {
					nextTo = logLine.timestamp;
				}
				//Check limits
				if (
					(this.config.limitCount >= 0 && this.runtime.count >= this.config.limitCount) ||
					(this.config.limitInterval >= 0 && this.runtime.startTime - logLine.timestamp >= this.config.limitInterval) ||
					(this.config.limitDate >= 0 && logLine.timestamp <= this.config.limitDate)
				) {
					this.runtime.reachedEnd = true;
					//todo: this return does nothing
					return;
				}
			}, this);
		} else {
			//todo: check if reached registration date and if not, try a from param, check against already parsed log hashes
			this.runtime.reachedEnd = true;
		}
		this.runtime.pending -= 1;
		if (this.runtime.reachedEnd) {
			if (!this.runtime.pending) {
				this.finish();
			}
		} else {
			this.checkProgress(nextTo);
			this.runtime.pending += 1;// set before end of timer
			setTimeout(this.request, this.config.requestRate * 1000, this.apiuri(this.config.key, nextTo), this.readLogs, this);
		}
	},
	/* Handles reading the logs when using already present log data. */
	readStoredLogs: function() {
		Object.keys(this.data.logs).forEach(function(logHash) {
			this.runtime.count += 1;
			this.processRoutines(this.data.logs[logHash], logHash);
		}, this);
		this.finish();
	},
	/* A shortcut to copy the log, change category and title back to string, and pass the result to all requested routines.
		*log: the log object to copy from.
		*hash: the hash for the given log.
	*/
	processRoutines: function(log, hash) {
		//copy so that stored logs are not affected
		var logCopy = {
			timestamp: log.timestamp,
			category: this.data.torn.logCategories[log.category],
			title: this.data.torn.logTypes[log.title],
			data: log.data,
		};
		this.config.modules.forEach(function(modus) {
			if (this.routines[modus].processor) {
				try {
					this.routines[modus].processor.call(this.routines[modus], logCopy, hash);
				} catch (err) {
					this.ui.putlog(['Error running routine `' + modus + '` with log:', JSON.stringify(logCopy), '-', err], 'warning');
				}
			}
		}, this);
	},
	/* Determines the estimated completion through the log and displays progress at set intervals.
		*nextTo: the unix timestamp for the next batch of logs used by readLogs().
	*/
	checkProgress: function(nextTo) {
		if (this.config.progressInterval < 1) {
			return;
		}
		var interval = this.runtime.startTime - this.data.signup;
		var traversed = this.runtime.startTime - nextTo;
		if (traversed / interval * 100 > this.runtime.milestone + this.config.progressInterval) {
			this.runtime.milestone += this.config.progressInterval;
			this.ui.putlog(this.runtime.milestone + '% completed');
		}
	},
	/* Takes user input and begins execution of the program. Pass any skipped parameters as `null` unless otherwise noted. This assumes all parameters are formatted correctly.
		*key: the user's API key (string). 
		*modules (optional): an array of names of routines the user wants to run for data processing. Use 'ALL' to run all available routines.
		*useStored (optional): if true, the program will run using data saved internally (e.g. from a file or previous run) rather than requesting it from the API. Otherwise, pass false.
		*limit (optional): an object with values to stop retrieving logs at a certain point. Can contain any, all, or none of the following keys (note that logs are in Torn Time aka UTC):
			-count: a number indicating how many lines of the log to retrieve. Note up to 100 lines are retrieved per request.
			-interval: an array specifying a duration using any combination of the following units in order: years, months, days, hours, minutes, seconds.
			-date: an array of integers representing a date and time: [year, month, day, hour, minute, second]. At least year and month are required; the rest will default to the lowest possible value.
		*save (optional): boolean indicating whether the user wants to save the full log data for download. Defaults to false.
		*rate (optional): the number of API requests the user wants to make per second. Defaults to 1.
		*progress (optional): the interval in integer percentage points at which to display progress indicators. Defaults to 10. Set to -1 for no indicators.
	*/
	start: function(key, modules, useStored, limit, save, rate, progress) {
		if (this.runtime.isRunning) {
			this.ui.putlog('Stopping. The program is already running.', 'error');
			return;
		}
		this.init();
		this.runtime.isRunning = true;
		this.runtime.startTime = Math.floor(new Date().getTime() / 1000);
		
		this.config.key = key;
		var allModules = modules[0] === 'ALL';
		if (allModules) {
			modules = Object.keys(this.routines);
		}
		this.config.modules = modules.filter(function(modus) {
			if (!modus) {
				return false;
			}
			var routine = this.routines[modus];
			if (routine) {
				if (allModules && routine.wip) {
					return false;
				}
				if (typeof routine.init === 'function') {
					try {
						routine.init(this.logIDs);
					} catch (err) {
						this.ui.putlog(['Error initializing routine `' + modus + '` -', err], 'warning');
						return false;
					}
				}
				return true;
			} else {
				this.ui.putlog('Routine named `' + modus + '` was not found.', 'warning');
				return false;
			}
		}, this);
		this.config.useStored = useStored;
		if (!this.config.useStored) {
			if (!isEmptyObject(limit)) {
				if (limit.count >= 0 && limit.count !== null) {
					this.config.limitCount = limit.count;
				}
				if (limit.interval) {
					var limitInterval = this.parseDuration(limit.interval);
					if (!limitInterval || isNaN(limitInterval)) {
						this.ui.putlog('Stopping. Invalid limit duration specified.', 'error');
						return;
					}
					this.config.limitInterval = limitInterval;
				}
				if (limit.date) {
					limit.date[1] -= 1;// month is zero-indexed in Date
					var limitDate = new Date(Date.UTC.apply(this, limit.date));// use apply to pass array easily
					if (limitDate.toString() === 'Invalid Date') {
						this.ui.putlog('Stopping. Invalid limit date specified.', 'error');
						return;
					}
					this.config.limitDate = Math.floor(limitDate.getTime() / 1000);
				}
			}
			//todo: object check is in case I implement saving specific logs
			if (typeof save === 'boolean' || typeof save === 'object') {
				this.config.saveLogs = save;
			} else {
				this.config.saveLogs = false;
			}
			this.config.requestRate = 1 / rate;// convert to interval
			this.config.progressInterval = progress;
			this.ui.putlog([
				'Making', rate.toString(), 'request' + (rate !== 1 ? 's' : ''), 'per second and',
				(this.config.saveLogs ? '' : 'not ') + 'saving your logs.',
				(this.config.modules.length ? 'Running routines: ' + this.config.modules.join(', ') : 'No routines running') + '.' +
				(
					this.config.limitCount >= 0 || this.config.limitInterval >= 0 || this.config.limitDate >= 0 ?
					(this.config.limitCount >= 0 ? ' Limited to ' + this.config.limitCount + ' log lines.' : '') +
					(this.config.limitInterval >= 0 ? ' Limited to ' + this.config.limitInterval + ' seconds ago.' : '') +
					(this.config.limitDate >= 0 ? ' Limited to ' + this.config.limitDate + ' and later.' : '')
					: ' No limits set.'
				)
			]);
		} else if (isEmptyObject(this.data.logs)) {
			this.ui.putlog('Stopping. No stored logs found. If you have refreshed the page, submit the file again.', 'error');
			return;
		}
		this.ui.putlog('Start: ' + new Date().toISOString());

		this.runtime.pending += 1;
		this.request(this.apiuri(this.config.key, '', null), this.ignition, this);
	},
	/* Checks that the given API key is valid and records some user data from the key, then proceeds if valid.
		*response: the JSON data obtained by request().
	*/
	ignition: function(response) {
		this.runtime.pending -= 1;
		this.data.id = response.player_id;
		this.data.name = response.name;
		var splitDate = response.signup.split(' ');
		splitDate = splitDate[0].split('-').concat(splitDate[1].split(':'));// creating date with string is discouraged
		splitDate[1] = (splitDate[1] - 1).toString();// month is zero-indexed (back to string just for consistency)
		this.data.signup = Math.floor(new Date(Date.UTC.apply(this, splitDate)).getTime() / 1000);// floor to discount non-elapsed seconds

		this.runtime.pending += 1;
		this.request(this.apiuri(this.config.key, '', 'logcategories,logtypes', 'torn'), this.liftoff, this);
	},
	/* Gets the log name information required to process logs, then continues the program.
		*response: the JSON data obtained by request().
	*/
	liftoff: function(response) {
		this.runtime.pending -= 1;
		this.data.torn.logCategories = response.logcategories;
		this.data.torn.logTypes = response.logtypes;
		//Construct reverse index
		Object.keys(response.logcategories).forEach(function(logid) {
			this.data.torn.logCatByName[response.logcategories[logid]] = parseInt(logid, 10);
		}, this);

		var requires = [];
		this.config.modules.forEach(function(modus) {
			if (this.routines[modus].require) {
				requires = requires.concat(this.routines[modus].require);
			}
		}, this);
		this.readRequire(requires);
		if (!this.config.useStored && this.config.limitCount !== 0) {// stop immediately if limited to zero logs
			this.runtime.pending += 1;
			this.request(this.apiuri(this.config.key), this.readLogs, this);
		}
	},
	/* Completes execution of the program, including displaying output. */
	finish: function() {
		this.config.key = '';
		var runTime = Math.floor(new Date().getTime() / 1000) - this.runtime.startTime;
		this.ui.putlog('Done: ' + new Date().toISOString());
		this.ui.putlog([
			'Read', this.runtime.count, 'logs in',
			this.runtime.requests, 'requests taking',
			(runTime < 60 ? runTime : runTime / 60).toFixed(2), (runTime < 60 ? 'seconds.' : 'minutes.')
		]);
		this.ui.putlog('Routines started.');
		this.config.modules.forEach(function(modus) {
			if (typeof this.routines[modus].finish === 'function') {
				var divID = 'routines-' + modus;
				try {
					document.getElementById('routines-output').appendChild(
						setAttributes(document.createElement('h4'), {
							innerHTML: modus,
						})
					).parentNode.appendChild(
						setAttributes(document.createElement('button'), {
							'class': 'toggle',
							type: 'button',
							onclick: "TAPIR('toggle', '" + divID + "', this)",
							innerHTML: 'Show results',
						})
					).parentNode.appendChild(
						setAttributes(document.createElement('div'), {
							id: divID,
							'class': 'collapsible collapsed',
							innerHTML: 'Program running...'
						})
					);
					this.routines[modus].buffer = '';
					this.routines[modus].finish(function(msg, swtch) { return TAPIR('putlog', msg, 'routine', swtch, modus); });
					document.getElementById(divID).innerHTML = this.routines[modus].buffer;
					this.ui.putlog('*' + modus + ': completed.', 'info');
				} catch (err) {
					document.getElementById(divID).innerHTML = 'An error occurred.';
					this.ui.putlog(['*' + modus + ': error -', err], 'info');
				} finally {
					delete this.routines[modus].buffer;
				}
			}
		}, this);
		this.ui.putlog('Routines completed.');
		if (!this.config.useStored) {
			TAPIR('displayLogs', false);
		}
		this.runtime.isRunning = false;
	},
	/* Analyzes metadata in a log object.
		*logs (optional): an object to read logs from. Omit parameter to use the log data stored in the program object.
	*/
	analyzeLogs: function(logs) {
		this.runtime.isRunning = true;
		logs = logs || this.data.logs;
		if (!logs || isEmptyObject(logs)) {
			this.ui.putlog('No logs to analyze.', 'warning');
			this.runtime.isRunning = false;
			return;
		}
		var keyLengthCutoff = -1;
		var valueLengthCutoff = -1;
		var logTypes = {};// { id: count }
		var longestKeys = {};// { length: { key: count } }
		var longestValues = {};// { length: { value: count } }
		var mostKeys = {};// { length: { title id: count } }
		var dataTypes = {};// { issue: { title id + key: count } }
		var logCounts = {};// { count: { id: title } }
		
		Object.keys(logs).forEach(function(hash) {
			var log = logs[hash];
			var data = log.data || {};
			var keyCount = 0;
			cousps(logTypes, log.title);
			Object.keys(data).forEach(function(dataKey) {
				var dataValue = data[dataKey];
				var titleAndKey = log.title + ' ' + dataKey;
				keyCount += 1;
				if ((dataValue || '').toString() === '[object Object]') {
					dataValue = JSON.stringify(dataValue);
				}
				if (dataKey.length > keyLengthCutoff) {
					cousps(longestKeys, dataKey.length, dataKey);
				}
				//Exclude floats
				if ((dataValue || '').toString().length > valueLengthCutoff && (typeof dataValue === 'number' ? Math.floor(dataValue) === dataValue : true)) {
					//Exclude known IDs and long integers
					if (!((dataKey === 'log' && (dataValue || '').toString().length === 32) || dataKey === 'trade_id' || /^\d{5,10}$/.test(dataValue))) {
						cousps(longestValues, (dataValue || '').toString().length, dataValue);
					}
				}
				if (typeof dataValue === 'string' && !isNaN(parseFloat(dataValue, 10)) && parseFloat(dataValue, 10).toString().length === dataValue.length) {
					cousps(dataTypes, 'number string', titleAndKey);
				} else if (typeof dataValue === 'boolean') {
					cousps(dataTypes, 'boolean', titleAndKey);
				} else if (dataValue === undefined) {
					cousps(dataTypes, 'undef', titleAndKey);
				} else if (dataValue === null && ['8390 opponent'].indexOf(titleAndKey) === -1) {
					cousps(dataTypes, 'null', titleAndKey);
				} else if (dataValue === '') {
					cousps(dataTypes, 'empty string', titleAndKey);
				}
				if (/[^a-z_]/.test(dataKey)) {
					cousps(dataTypes, 'weird key', titleAndKey);
				}
			});
			if (keyCount > 1 || (keyCount === 0 && log.data)) {
				cousps(mostKeys, keyCount, log.title);
			}
		});
		Object.keys(this.data.torn.logTypes).forEach(function(type) {
			cousps(logCounts, logTypes[type] || 0, type, this.data.torn.logTypes[type]);
		}, this);
		//todo: better output. Point out items with highest impact.
		//todo: could try to watch for things that aren't formatted the same as similar items
		this.ui.putlog('*analyze:', 'info');
		this.ui.putlog('Longest keys:', 'routine');
		this.ui.putlog(longestKeys, 'routine');
		this.ui.putlog('Longest values:', 'routine');
		this.ui.putlog(longestValues, 'routine');
		this.ui.putlog('Most keys per data object:', 'routine');
		this.ui.putlog(mostKeys, 'routine');
		this.ui.putlog('Data type issues/tracking:', 'routine');
		this.ui.putlog(dataTypes, 'routine');
		this.ui.putlog('Log type counts:', 'routine');
		this.ui.putlog(logCounts, 'routine');
		this.runtime.isRunning = false;
	},
	/* Contains functions called by the user interface, or called by the program to interact with the interface. (Ordered by frequency/importance of use.) */
	ui: {
		/* Called when the page is loaded to modify the page as needed for any dynamic information. */
		load: function() {
			var self = window.TornAPIReader;
			//Retrieve stored API key, listen for storage to show delete button
			var storedKey;
			try {
				storedKey = self.ui.storage(null, 'get', 'api-key', 'api-key');
				if (!storedKey) {
					document.getElementById('api-key-delete').style.display = 'none';
				}
				window.addEventListener('storage', function(evt) {
					if (evt.key === 'api-key' && evt.newValue) {
						document.getElementById('api-key-delete').style.display = '';
					}
				});
			} catch (err) {
				this.ui.putlog('Failed to initialize stored API key: ' + err, 'info');
			}
			//Insert interactive list of available routines
			var routinesList = document.getElementById('routines-list');
			try {
				routinesList.textContent = '\n';
				Object.keys(self.routines).forEach(function(routine) {
					var iswip = !!self.routines[routine].wip;
					routinesList.appendChild(
						document.createElement('label')
					).appendChild(
						setAttributes(document.createElement('input'), {
							type: 'checkbox',
							name: routine,
							'data-wip': iswip,
						})
					).parentNode.appendChild(
						document.createTextNode(routine + (iswip ? ' (WIP)' : '') + ': ' + self.routines[routine].description)
					);
					routinesList.appendChild(document.createTextNode('\n'));
				});
				document.getElementById('routines-collapsible').addEventListener('change', function(evt) {
					var type = evt.target.type, name = evt.target.name, value;
					var listText = document.getElementById('routines');
					
					/* Updates the text input list of selected routines based on the given checkbox's state.
						*routine: the name of the routine (checkbox value)
						*isChecked: the checked state of the checkbox
					*/
					function updateText(routine, isChecked) {
						var currentList = listText.value.replace(/\s/g, '').split(',');
						if (isChecked && currentList.indexOf(routine) === -1) {
							currentList.push(routine);
						} else if (!isChecked && currentList.indexOf(routine) !== -1) {
							currentList.splice(currentList.indexOf(routine), 1);
						}
						listText.value = currentList.filter(function(r) { return r !== ''; }).join(', ');
						//note: listener inefficiently updates value on every item regardless of whether it was changed
					}

					if (type === 'radio') {
						value = evt.target.value;
						if (value !== 'custom') {
							listText.value = '';
							arrayFrom(routinesList.getElementsByTagName('input')).forEach(function(cb) {
								if (value === 'all' && !cb.checked && !(cb.dataset.wip === 'true')) {
									cb.checked = true;
								} else if (value === 'none' && cb.checked) {
									cb.checked = false;
								}
								updateText(cb.name, cb.checked);
							});
						}
					} else if (type === 'checkbox') {
						document.getElementById('routine-selection-custom').checked = true;
						value = evt.target.checked;
						updateText(name, value);
					}
				});
			} catch (err) {
				routinesList.textContent = 'There was an error listing routines: ' + err;
			}
		},
		/* Begins execution of the program given user input from forms on the page, which is formatted here.
			*useStored: whether to run the program using log data already stored in the program.
		*/
		setup: function(useStored) {
			// Retrieves value of given configuration element from page. Pass second argument `true` if element is a checkbox.
			function conf(id, iscb) {
				if (iscb) {
					return document.getElementById(id).checked;
				} else {
					return document.getElementById(id).value.trim();
				}
			}
			useStored = !!useStored;
			var key = conf('api-key');
			var routines = conf('routines');
			var save = conf('store-logs', true);
			var rate = parseFloat(conf('request-rate'), 10) || 1;
			var progress = parseInt(conf('progress-check'), 10) || 10;
			var limitCount = conf('limit-logs') ? parseInt(conf('limit-logs'), 10) : null;
			var limitDate = [conf('limit-date'), conf('limit-time')];
			var limitInterval = ['years', 'months', 'days', 'hours', 'minutes', 'seconds'].map(function(lim) {
				return parseInt(conf('limit-' + lim), 10) || 0;
			});
			var limits;

			if (!key) {
				this.ui.putlog('Stopping. API key is required.', 'error');
				return;
			}
			routines = routines.replace(/\s/g, '').split(',');
			if (isNaN(limitCount) || limitCount < 0) {
				this.ui.putlog('Stopping. Limit count must be a number, zero or greater.', 'error');
				return;
			}
			if (limitDate[1] && !limitDate[0]) {
				this.ui.putlog('Stopping. Limit date must be specified when using limit time.', 'error');
				return;
			} else if (!limitDate.join('')) {
				limitDate = null;
			} else if (limitDate[0].split('-').length < 2) {
				this.ui.putlog('Stopping. At least year and month are required with limit date.', 'error');
				return;
			} else {
				limitDate = limitDate[0].split('-').concat(limitDate[1].split(':'));
			}
			if (!parseInt(limitInterval.join(''), 10)) {
				limitInterval = null;
			}
			limits = { count: limitCount, interval: limitInterval, date: limitDate };

			document.getElementById('routines-output').innerHTML = '';
			this.start(key, routines, useStored, limits, save, rate, progress);
		},
		/* Called by a file upload form to parse and store a previously downloaded log file.
			*btn: the button that was clicked (pass `this`).
		*/
		readFile: function(btn) {
			var self = this;
			var file = document.getElementById('log-file').files[0];
			var reader = new FileReader();
			var data;
			var success = true;
			var message = 'Logs loaded!';
			reader.onload = function() {
				try {
					if (!file) {
						throw new Error('No file selected.');
					}
					data = JSON.parse(reader.result);
					if (!data.log || isEmptyObject(data.log)) {
						throw new Error('No logs object found in file.');
					}
					self.data.logs = data.log;
					self.data.logVersion = data.tapir_format_ver;
					if (self.data.logVersion !== getLogVersion()) {
						success = null;
						message = 'File formatting version is ' +
							(self.data.logVersion ? 'outdated' : 'missing') +
							'; program may not run properly. See "Log Versions" for info.';
					}
					self.ui.putlog(['Stored data for', Object.keys(self.data.logs).length, 'logs.']);
				} catch (err) {
					success = false;
					if (err.name === 'Error') {
						message = err.message;
					} else {
						message = 'File could not be read due to improper formatting.';
						self.ui.putlog('Error parsing file contents: ' + err, 'error');
					}
				}
				self.ui.showFeedback(btn, success, message);
			};
			reader.readAsText(file);
			reader.onerror = function() {
				self.ui.putlog('Error reading file: ' + reader.error, 'error');
				self.ui.showFeedback(btn, false, 'Error reading file.');
			};
		},
		/* Prints the logs retrieved from the API and any needed metadata to an element on the page.
			*spaced (optional): if true, the dump will be more human-readable; otherwise, it will be minified.
				Must be specified when called from the program and unspecified when called from the interface.
		*/
		displayLogs: function(spaced) {
			if (isEmptyObject(this.data.logs || {})) {
				return;
			}
			var downloadData = {
				tapir_format_ver: getLogVersion(),
				log: this.data.logs,
			};
			var ta = document.getElementById('log-download');
			if (spaced === undefined) {
				spaced = !(ta.dataset.spaced === 'true');
				ta.dataset.spaced = spaced;
			}
			ta.value = JSON.stringify(downloadData, null, (spaced ? '\t' : null));
		},
		/* Outputs a message to the event log on the page. Note: a wrapper function is passed to `finish` in routines; documentation there needs to be updated for changes.
			*msg: the message to display, or something to be converted to a message.
				Note: if passing an array, any objects that are elements need JSON.stringify called on them.
			*type (optional): the type of message. Can be one of: error (only use if stopping execution), warning, info (default), routine.
			*onoff (optional): if true and `msg` is:
				an array - toString will be called instead of joining it with spaces.
				an object - it will be stringified without spaces instead of using tabs.
			*routine (optional): if type is routine, this must be the name of the routine.
		*/
		putlog: function(msg, type, onoff, routine) {
			var out = document.getElementById('logging').value ? '\n' : '', routineOut;
			if (type === 'error') {
				out += 'ERROR: ';
				window.TornAPIReader.runtime.isRunning = false;
			} else if (type === 'warning') {
				out += 'Warning: ';
			} else if (type === 'routine') {
				//Note: `this` is only set this way for routine type
				if (routine) {
					routineOut = this.routines[routine].buffer;
					out = routineOut ? '\n' : '';
				} else {
					out += '    ';
				}
			} else if (type && type !== 'info') {
				out += '[Invalid Log Type]: ';
			}
			if (typeof msg === 'string') {
				out += msg;
			} else if (typeof msg.join === 'function' && !onoff) {
				out += msg.join(' ');
			} else if (typeof msg.toString === 'function') {
				if (msg.toString() === '[object Object]') {
					if (type === 'routine') {
						//todo: this is convenient but might mess with things. Maybe use filter on keys?
						if (msg.torn) { 
							delete msg.torn;
						}
						if (msg.id) {
							delete msg.id;
						}
					}
					out += JSON.stringify(msg, null, onoff ? null : '\t').replace(/\n/g, routineOut ? '\n' : '\n    ');
				} else {
					out += msg.toString();
				}
			} else {
				out += msg;
			}
			if (routineOut !== undefined) {
				this.routines[routine].buffer += out;
			} else {
				document.getElementById('logging').value += out;
			}
		},
		/* Toggles the collapsed state of the given element.
			*id: the id attribute of a collapsible element.
			*btn: the button that called the toggle (pass `this`).
		*/
		toggle: function(id, btn) {
			var el = document.getElementById(id);
			var classes = el.classList;
			if (!classes.contains('collapsible')) {
				return;
			}
			var isCollapsed = classes.toggle('collapsed');
			var btnText = ['Hide', 'Show'];
			btn.textContent = btn.textContent.replace(btnText[+!isCollapsed], btnText[+isCollapsed]);
		},
		/* Adds an indicator of the result of a user action.
			*el: the element to which to append the indicator.
			*success: an indication of whether the action was successful - boolean, or `null` for a warning state.
			*successMsg: message to display if the action succeeded.
			*failureMsg (optional): message to display if the action failed. If omitted, successMsg will be used (i.e. appropriate message was set beforehand).
		*/
		showFeedback: function(el, success, successMsg, failureMsg) {
			var icon = el.getElementsByClassName('icon')[0];
			if (icon) {
				icon.remove();
			}
			el.appendChild(
				setAttributes(document.createElement('span'), {
					'class': 'icon ' + (success === null ? 'warning' : success ? 'valid' : 'error'),
					innerHTML: success === null ? '&sext;' : success ? '&check;' : '&cross;',
					title: success ? successMsg || 'success' : failureMsg || successMsg || (success === null ? 'warning' : 'failure'),
				})
			);
		},
		/* Copies the content of the log download panel to the clipboard.
			*btn: the button that was clicked (pass `this`).
		*/
		copyLogs: function(btn) {
			var success = true;
			var message = 'Copied to clipboard!';
			var logs = document.getElementById('log-download').value;
			//todo: writeText returns a Promise
			try {
				if (!logs) {
					throw new Error('No logs to copy.');
				}
				navigator.clipboard.writeText(logs);
			} catch (err) {
				success = false;
				if (err.name === 'Error') {
					message = err.message;
				} else {
					message = 'Sorry, your browser may not support current clipboard methods.';
					this.ui.putlog('Clipboard write failed: ' + err, 'info');
				}
			}
			this.ui.showFeedback(btn, success, message);
		},
		/* Accesses browser storage with given parameters.
			*btn: if applicable, the button that was clicked (pass `this`).
			*mode: "set", "get", or "remove".
				If "get", the value is returned from the function.
			*key: the key for the stored value.
			*valueId (optional): the ID of a page element. If setting a value, the value is retrieved from here (required). If getting a value, the value will be inserted here.
			*useSession (optional): true if using session storage instead of persistent storage.
		*/
		storage: function(btn, mode, key, valueId, useSession) {
			var storage = useSession ? sessionStorage : localStorage;
			var success = true;
			var message = 'Success!';
			var value;		
			if (mode === 'set') {
				try {
					value = document.getElementById(valueId).value;
					if (!value) {
						throw new Error('No value entered.');
					}
					storage.setItem(key, value);
					//note: StorageEvent constructor has fairly late support, not supported in IE
					window.dispatchEvent(new StorageEvent('storage', {
						key: key,
						newValue: value,
					}));
				} catch (err) {
					success = false;
					if (err.name === 'Error') {
						message = err.message;
					} else {
						message = 'Browser storage failed. There may be insufficient space allocated.';
						this.ui.putlog('Browsed storage failed: ' + err);
					}
				}
			} else if (mode === 'get') {
				value = storage.getItem(key);
				if (valueId) {
					document.getElementById(valueId).value = value || '';
				}
				return value;
			} else if (mode === 'remove') {
				storage.removeItem(key);
			}
			if (btn) {
				this.ui.showFeedback(btn, success, message);
			} else if (!success) {
				this.ui.putlog('Browser storage failed: ' + message, 'info');
			}
		},
		/* Clears the program logging panel. */
		clearLog: function() {
			document.getElementById('logging').value = '';
		},
		/* Runs log metadata analysis. */
		analyze: function() {
			this.analyzeLogs();
		},
	},
	/* This holds all the modules for tracking different data points in the log.
		The key should be a short, unique identifier and using only lowercase letters is recommended. Please keep them alphabetized.
		Each routine:
			MUST contain a brief string keyed `description` summarizing what the routine does, double quoted.
			MAY contain a function keyed `processor`, which will be passed each log line and its hash.
			MAY contain a function keyed `finish` to finalize processing data and/or provide output, which will be passed the output function.
				The output function takes two parameters: something to display, and an optional behavior switch.
					If the switch is true, arrays will be joined with commas instead of spaces and objects will be pretty-printed instead of being minified.
					Use four spaces for any additional indentation.
			MAY also use the following keys for organization purposes: `data` and `functions`.
			MAY specify additional required API calls in an array keyed `require`, e.g. 'user.travel' or 'property.property'.
				The data from these calls will be stored in `data.torn` under the same keys, e.g. `data.torn.torn.items`. These will be excluded from output.
				NOTE: if using `require`, you MUST also have an empty `data`, but do not inherently need `init`.
				Entries must all be {zone}.{selection} and you cannot omit the selection even for defaults.
				NOTE: Requires are not guaranteed to be available in `processor`, so you'll need to process them in `finish`!
			MUST provide a function keyed `init` if using `data` or tracking other state.
				`data` should be declared as an empty object/array and set with the default values in `init`.
				`init` is passed an object of ID mappings used by the program.
					It contains two sub-objects: `torn` for ones defined by the game (ID -> string) and `custom` for ones defined by the program (string -> ID).
					Store **only the associations you need**, preferably as `data.id` to exclude it from output automatically.
			MAY define the property `wip` (work in progress) - if true, the routine will be excluded when running all routines.
			MAY NOT access any properties outside of its scope, which will be provided as `this`, and passed parameters.
			MAY have a docstring for a more verbose description/explanation.
		The passed logs:
			Have already been converted to standard keys, notation, and data types.
				If using data containing strings that the program maps to IDs or vice versa, you will need to store **only the associations you need** from `init`.
			Contain the following keys: timestamp, category, title, data.
			Have had category and title converted back to strings matching the Torn API list.
	*/
	routines: {
		captcha: {
			description: "Gets stats on the player's interaction with captchas.",
			data: {},
			init: function(ids) {
				this.data = {
					id: ids.custom.captcha,
					count: { 'total': 0, 'success': 0, 'failure': 0 },
					types: {},
				};
			},
			processor: function(log) {
				if (log.category !== 'Captcha') {
					return;
				}
				var type = this.data.id[log.data.type];
				if (!this.data.types[type]) {
					this.data.types[type] = { 'total': 0, 'success': 0, 'failure': 0 };
				}
				this.data.count.total += 1;
				this.data.types[type].total += 1;
				if (log.title === 'Captcha validation success') {
					this.data.count.success += 1;
					this.data.types[type].success += 1;
				} else if (log.title === 'Captcha validation failure') {
					this.data.count.failure += 1;
					this.data.types[type].failure += 1;
				}
			},
			finish: function(output) {
				//todo
				output((this.data.count.total ? (this.data.count.failure / this.data.count.total * 100).toFixed(2) : 0) + '% failed');
				output(this.data);
			},
		},
		crimes: {
			description: "Gets stats on crimes the player has done.",
			require: ['torn.items'],
			data: {},
			init: function(ids) {
				this.data = {
					id: ids.torn.crime,
					count: {},
					undone: [],
					nerveSpent: 0,
				};
				Object.keys(this.data.id).forEach(function(crime) {
					var crimeData = this.data.id[crime];
					this.data.count[crime] = {
						desc: crimeData[0],
						category: crimeData[1],
						subcat: crimeData[2] || null,
						nerve: null,
						nerveTotal: 0,
						total: 0,
						success: 0,
						fail: 0,
						failMoney: 0,
						jail: 0,
						jailTime: 0,
						hospital: 0,
						hospTime: 0,
						moneyGained: 0,
						moneyLost: 0,
						itemsGained: {},
					};
				}, this);
			},
			processor: function(log) {
				//todo: don't have crime success casino token gain (5735) or points gain (5730)
				//  need to add property to count when needed
				if (log.category !== 'Crimes') {
					return;
				}
				var crime = log.data.crime;
				var data = this.data.count[crime];
				if (!data.nerve) {
					data.nerve = log.data.nerve;
				}
				data.total += 1;
				switch (log.title) {
					case 'Crime fail':
						data.fail += 1;
						break;
					case 'Crime fail jail':
						data.jail += 1;
						data.jailTime += log.data.jail_time_increased;
						break;
					case 'Crime fail hospital':
						data.hospital += 1;
						data.hospTime += log.data.hospital_time_increased;
						break;
					case 'Crime fail money loss':
						data.failMoney += 1;
						data.moneyLost += log.data.money_lost;
						break;
					case 'Crime success money gain':
						data.success += 1;
						data.moneyGained += log.data.money_gained;
						break;
					case 'Crime success item gain':
						data.success += 1;
						if (data.itemsGained[log.data.item_gained]) {
							data.itemsGained[log.data.item_gained].count += 1;
						} else {
							data.itemsGained[log.data.item_gained] = {
								name: null,
								count: 1,
								value: null,
								totalValue: null,
							};
						}
						break;
					case 'Crime success points gain':
						break;
					case 'Crime success casino token gain':
						break;
				}
			},
			finish: function(output) {
				//todo: can do drop rates for items like with wheels
				Object.keys(this.data.count).forEach(function(crime) {
					var crimeData = this.data.count[crime];
					var tornItems = this.data.torn.torn.items;
					Object.keys(crimeData.itemsGained).forEach(function(item) {
						var itemData = crimeData.itemsGained[item];
						itemData.name = tornItems[item].name;
						itemData.value = Math.max(tornItems[item].sell_price, tornItems[item].market_value);
						itemData.totalValue = itemData.value * itemData.count;
					});
					if (crimeData.total) {
						crimeData.nerveTotal = crimeData.nerve * crimeData.total;
						this.data.nerveSpent += crimeData.nerveTotal;
						output(crimeData);
					} else {
						//todo: formatting
						this.data.undone.push([crimeData.desc, crimeData.category, crimeData.subcat]);
					}
				}, this);
				output('Total nerve spent on crimes: ' + this.data.nerveSpent.toLocaleString());
				output('Crimes not done:');
				output(this.data.undone);
			},
		},
		footroulette: {
			wip: true,
			description: "Gets stats on the player's Foot Russian Roulette games.",
			data: {},
			init: function() {
				
			},
			processor: function(log) {
				//TODO
			},
			finish: function(output) {
				
			},
		},
		gym: {
			description: "Gets stats on the player's training in the gym.",
			require: ['torn.gyms'],
			data: {},
			init: function(ids) {
				this.data = {
					id: {
						stats: ids.custom.combatstat,
						stage: ids.torn.gymstage,
					},
					gyms: {},
					switches: [],
					totalTrains: {},
					totalGains: {},
					energySpent: 0,
					happySpent: 0,
					moneySpent: 0,
					blank: [],
				};
				var data = this.data;
				data.blank = data.id.stats.map(function(stat) {
					return stat || 'total';
				});
				data.blank.forEach(function(stat) {
					data.totalTrains[stat] = 0;
					data.totalGains[stat] = 0;
				});
			},
			processor: function(log) {
				//todo: whatever the "gym train addict" log type has, add it to stats as appropriate
				//todo: many more stats possible
				if (log.category !== 'Gym') {
					return;
				}
				var stat;
				var data = this.data;
				var gym = log.data.gym;
				var gymData = data.gyms[gym];
				if (!gymData) {
					data.gyms[gym] = {
						name: null,
						stage: null,
						unlocked: null,
						trains: {},
						gains: {},
						energy: 0,
						happy: 0,
					};
					gymData = data.gyms[gym];
					data.blank.forEach(function(stat) {
						gymData.trains[stat] = 0;
						gymData.gains[stat] = 0;
					});
				}
				if (/^Gym train (?!addict)/.test(log.title)) {
					stat = data.id.stats[log.data.stat];
					data.energySpent += log.data.energy_used;
					gymData.energy += log.data.energy_used;
					data.happySpent += log.data.happy_used;
					gymData.happy += log.data.happy_used;
					data.totalTrains.total += log.data.trains;
					data.totalTrains[stat] += log.data.trains;
					gymData.trains.total += log.data.trains;
					gymData.trains[stat] += log.data.trains;
					data.totalGains.total += log.data.increased;
					data.totalGains[stat] += log.data.increased;
					gymData.gains.total += log.data.increased;
					gymData.gains[stat] += log.data.increased;
				} else if (log.title === 'Gym purchase') {
					//todo: convert timestamp to date
					gymData.unlocked = log.timestamp;
					data.moneySpent += log.data.cost;
				} else if (log.title === 'Gym activate') {
					data.switches.push([log.timestamp, log.data.gym]);
				} else {// addict
					
				}
			},
			finish: function(output) {
				var tornData = this.data.torn.torn.gyms;
				var gymData = this.data.gyms;
				var stages = this.data.id.stage;
				delete this.data.blank;
				Object.keys(tornData).forEach(function(gym) {
					if (!gymData[gym]) {
						return;
					}
					gymData[gym].name = tornData[gym].name;
					gymData[gym].stage = stages[tornData[gym].stage];
				});
				//todo
				output(this.data);
			},
		},
		/* Builds a list of other players with whom the player has interacted in any way, sorted by most frequent.
			Does not include things that aren't recorded in the API, like racing opponents.
		*/
		interactions: {
			wip: true,
			description: "Builds a list of other players with whom the player has interacted and how, with some exceptions.",
			data: {},
			init: function() {
				
			},
			processor: function(log) {
				//TODO
			},
			finish: function(output) {
				
			},
		},
		/* Gets stats on the player's item collection. Inventory, display case, and bazaar are all counted together. */
		inventory: {
			description: "Gets stats on the player's item collection.",
			require: ['torn.items', 'user.inventory', 'user.display', 'user.bazaar'],
			data: {},
			init: function() {
				this.data = {
					gameItems: 0,
					totalOwned: 0,
					totalLiquid: 0,
					unowned: {},
					extra: {},
				};
			},
			processor: function(log) {
				//todo: track item input and output, total and from/to where. And anything else interesting from the log
			},
			finish: function(output) {
				var miscData = this.data;
				var unowned = this.data.unowned;
				var extra = this.data.extra;
				var itemData = this.data.torn.torn.items;
				this.data.torn.user.inventory.concat(this.data.torn.user.display, this.data.torn.user.bazaar).forEach(function(item) {
					itemData[item.ID].quantity = (itemData[item.ID].quantity || 0) + item.quantity;
				});
				Object.keys(itemData).forEach(function(item) {
					var data = itemData[item];
					if (typeof data === 'string') {
						return;
					}
					miscData.gameItems += 1;
					if (!data.quantity) {
						data.quantity = 0;
						unowned[item] = {
							name: data.name,
							buy: data.buy_price || null,
							market: data.market_value || null,
							circulation: data.circulation,
						};
					} else if (data.quantity > 1) {
						extra[item] = {
							name: data.name,
							quantity: data.quantity,
							sell: data.sell_price || null,
							market: data.market_value || null,
							circulation: data.circulation,
						};
					}
					if (data.quantity) {
						miscData.totalOwned += 1;
					}
				});
				var cheapUnowned = Object.keys(unowned).map(function(item) {
					return {
						name: unowned[item].name,
						cost: compare(unowned[item].buy, unowned[item].market, 'min'),
						circ: unowned[item].circulation,
					};
				}).sort(function(a, b) {
					return compare(a.cost, b.cost, 'sort', false, true) || compare(a.circ, b.circ, 'sort', true) || compare(a.name, b.name, 'sort') || 0;
				});
				var valuableExtra = Object.keys(extra).map(function(item) {
					var value = compare(extra[item].sell, extra[item].market, 'max');
					var totalValue = value * (extra[item].quantity - 1) || null;
					miscData.totalLiquid += totalValue || 0;
					return {
						name: extra[item].name,
						total: totalValue,
						quantity: extra[item].quantity,
						value: value,
						circ: extra[item].circulation,
					};
				}).sort(function(a, b) {
					return compare(a.total, b.total, 'sort', true, true) || compare(a.circ, b.circ, 'sort') || compare(a.name, b.name, 'sort') || 0;
				});
				//todo: give totals excluding items with 0 or 1 owners
				output([
					'Own', miscData.totalOwned,
					'of', miscData.gameItems,
					'game items (' + (miscData.totalOwned / miscData.gameItems * 100).toFixed(2) + '%) with',
					'$' + miscData.totalLiquid.toLocaleString(), 'total liquidity. (Values exclude keeping one of each item.)'
				]);
				//todo
				output({ 'Most valuable stacks of extra items': valuableExtra });
				output({ 'Cheapest unowned items': cheapUnowned });
			},
		},
		racing: {
			description: "Gets stats on the player's racing career.",
			data: {},
			init: function(ids) {
				this.data = {
					id: ids.torn.racetrack,
					classes: {},
					totalPoints: 0,
					races: {},
					tracks: {},
					crashes: {
						cars: {},
						upgrades: {},
					},
					raceIDs: {},
					lastCrash: null,
				};
				['total', 'official', 'custom'].forEach(function(type) {
					this.data.races[type] = {
						joined: 0,
						left: 0,
						finished: 0,
						crashed: 0,
						places: {},
					};
				}, this);
				Object.keys(this.data.id).forEach(function(track) {
					if (!this.data.id[track]) {
						return;
					}
					this.data.tracks[track] = {
						name: this.data.id[track],
						joined: 0,
						left: 0,
						finished: 0,
						crashed: 0,
						places: {},
						bestTimes: [],
					};
				}, this);
			},
			processor: function(log) {
				//todo: use remaining log types - car upgrades, bets, custom races created, etc
				//todo: find if a missing finish is because the race was started recently when logs were pulled
				//  I guess if first racing category log is a join/car change
				var raceID = (log.data || {}).race_id;
				if (log.category === 'Racing' && !raceID) {
					raceID = 'unknown' + log.timestamp;
				}
				switch (log.title) {
					case 'Points racing license':
						this.data.classes['E'] = log.timestamp;
						break;
					case 'Racing class increase':
						this.data.classes[log.data.new_class] = log.timestamp;
						break;
					case 'Company special gain racing points':
						this.data.totalPoints += log.data.points;
						break;
					case 'Racing join custom race':
						this.data.races.total.joined += 1;
						this.data.races.custom.joined += 1;
						this.data.tracks[log.data.track].joined += 1;
						cousps(this.data.raceIDs, raceID, 'custom', true);
						cousps(this.data.raceIDs, raceID, 'join', log.timestamp);
						break;
					case 'Racing join official race':
						this.data.races.total.joined += 1;
						this.data.races.official.joined += 1;
						this.data.tracks[log.data.track].joined += 1;
						cousps(this.data.raceIDs, raceID, 'custom', false);
						cousps(this.data.raceIDs, raceID, 'join', log.timestamp);
						break;
					case 'Racing leave custom race':
						this.data.races.total.left += 1;
						this.data.races.custom.left += 1;
						cousps(this.data.raceIDs, raceID, 'custom', true);
						cousps(this.data.raceIDs, raceID, 'leave', log.timestamp);
						break;
					case 'Racing leave official race':
						this.data.races.total.left += 1;
						this.data.races.official.left += 1;
						cousps(this.data.raceIDs, raceID, 'custom', false);
						cousps(this.data.raceIDs, raceID, 'leave', log.timestamp);
						break;
					case 'Racing finish custom race':
						this.data.races.total.finished += 1;
						cousps(this.data.races.total.places, log.data.position);
						this.data.races.custom.finished += 1;
						cousps(this.data.races.custom.places, log.data.position);
						this.data.tracks[log.data.track].finished += 1;
						cousps(this.data.tracks[log.data.track].places, log.data.position);
						cousps(this.data.raceIDs, raceID, 'custom', true);
						cousps(this.data.raceIDs, raceID, 'finish', log.timestamp);
						break;
					case 'Racing finish official race':
						this.data.races.total.finished += 1;
						cousps(this.data.races.total.places, log.data.position);
						this.data.races.official.finished += 1;
						cousps(this.data.races.official.places, log.data.position);
						this.data.tracks[log.data.track].finished += 1;
						cousps(this.data.tracks[log.data.track].places, log.data.position);
						this.data.totalPoints += log.data.points;
						cousps(this.data.raceIDs, raceID, 'custom', false);
						cousps(this.data.raceIDs, raceID, 'finish', log.timestamp);
						break;
					case 'Racing personal best':
						this.data.tracks[log.data.track].bestTimes.push({
							'record': log.data.time,
							'date': log.timestamp,
							'car': log.data.car,
						});
						break;
					case 'Racing crash':
						this.data.races.total.crashed += 1;
						cousps(this.data.crashes.cars, log.data.car);
						log.data.upgrades_lost.forEach(function(upgrade) {
							cousps(this.data.crashes.upgrades, upgrade);
						}, this);
						this.data.lastCrash = log;
						break;
				}
				if (this.data.lastCrash && log.category === 'Racing') {
					if (log.title === 'Racing join custom race') {
						this.data.races.custom.crashed += 1;
						this.data.tracks[log.data.track].crashed += 1;
						cousps(this.data.raceIDs, raceID, 'crash', log.timestamp);
						delete this.data.raceIDs['unknown' + this.data.lastCrash.timestamp];
					} else if (log.title === 'Racing join official race') {
						this.data.races.official.crashed += 1;
						this.data.tracks[log.data.track].crashed += 1;
						cousps(this.data.raceIDs, raceID, 'crash', log.timestamp);
						delete this.data.raceIDs['unknown' + this.data.lastCrash.timestamp];
					}
					if (log.title !== 'Racing crash' && /^Racing (?:join|leave|finish)/.test(log.title)) {
						this.data.lastCrash = null;
					}
				}
			},
			finish: function(output) {
				if (!this.data.classes['E']) {
					output('You do not have a racing license.');
					return;
				}
				//Far easier to calculate leaves by track now than to track leaves like crashes
				var tracks = this.data.tracks;
				Object.keys(tracks).forEach(function(track) {
					var trackData = tracks[track];
					trackData.left = trackData.joined - trackData.finished - trackData.crashed;
				});
				var raceIDs = this.data.raceIDs;
				output('Race IDs missing a start or end event:');
				output(Object.keys(raceIDs).filter(function(raceID) {
					var raceData = raceIDs[raceID];
					return raceID === 'unknown' || !raceData.join || !(raceData.leave || raceData.finish || raceData.crash);
				}).reduce(function(out, raceId) {
					var raceData = raceIDs[raceId];
					return out + (out ? ', ' : '') + raceId + ': ' + JSON.stringify(raceData);
				}, ''));
				delete this.data.raceIDs;
				delete this.data.lastCrash;
				//todo; also convert timestamps to dates
				output(this.data);
			},
		},
		wheels: {
			description: "Gets stats on the player's spins on Leslie's wheels.",
			require: ['torn.items', 'torn.properties', 'torn.pawnshop'],
			data: {},
			init: function(ids) {
				this.data = {
					id: ids.custom.wheel,
					wheels: {},
				};
				this.data.id.forEach(function(wheel) {
					this.data.wheels[wheel || 'overall'] = {
						total: 0,
						cost: {},
						costTotal: 0,
						freeCount: 0,
						loseCount: 0,
						hospCount: 0,
						hospTotal: 0,
						moneyCount: 0,
						moneyTotal: 0,
						pointsCount: 0,
						pointsTotal: 0,
						tokensCount: 0,
						tokensTotal: 0,
						itemCount: 0,
						item: {},
						propertyCount: 0,
						property: {},
					};
				}, this);
				this.data.wheels.overall.honors = [false, false, false];
			},
			processor: function(log) {
				//todo: for consistency and wedge tracking, money should be broken out like cost
				//check for any other wedges that need to be separated
				//todo: can check current points market value I guess (market.pointsmarket), kind of negligible difference
				if (log.category !== 'Casino' || !/^Casino spin the wheel/.test(log.title)) {
					return;
				}
				var cat = log.title.replace('Casino spin the wheel ', '');
				var d = log.data;
				var oa = this.data.wheels.overall;
				var wd = this.data.wheels[this.data.id[d.wheel]];
				var base = '';
				var addValue = null;
				switch (cat) {
					case 'start':
						base = 'cost';
						addValue = d.cost;
						oa.total += 1;
						wd.total += 1;
						//special case
						oa.costTotal += d.cost;
						wd.costTotal += d.cost;
						break;
					case 'free spin':
						base = 'free';
						break;
					case 'lose':
						base = 'lose';
						break;
					case 'hospital':
						base = 'hosp';
						addValue = d.hospital_time_increased;
						break;
					case 'win money':
						base = 'money';
						addValue = d.money;
						break;
					case 'win points':
						base = 'points';
						addValue = d.points;
						break;
					case 'win casino tokens':
						base = 'tokens';
						addValue = d.tokens;
						break;
					case 'win item':
						base = 'item';
						addValue = d.item;
						break;
					case 'win property':
						base = 'property';
						addValue = d.property;
						break;
				}
				if (cat === 'honor bar') {
					oa.honors[d.wheel - 1] = true;
				} else {
					if (cat !== 'start') {
						oa[base + 'Count'] += 1;
						wd[base + 'Count'] += 1;
					}
					if (addValue !== null) {
						if (oa[base] && wd[base]) {
							cousps(oa[base], addValue);
							cousps(wd[base], addValue);
						} else {
							oa[base + 'Total'] += addValue;
							wd[base + 'Total'] += addValue;
						}
					}
				}
			},
			finish: function(output) {
				var td = this.data.torn.torn;
				var wheels = this.data.wheels;
				output('(using current market prices)');
				this.data.id.forEach(function(wheel) {
					wheel = wheel || 'overall';
					var wd = wheels[wheel];
					wd.pointsTotalValue = wd.pointsTotal * td.pawnshop.points_value;
					wd.itemTotalValue = 0;
					wd.propertyTotalValue = 0;
					Object.keys(wd.item).forEach(function(item) {
						wd.item[item] = {
							name: td.items[item].name,
							count: wd.item[item],
							value: Math.max(td.items[item].sell_price, td.items[item].market_value),
							totalValue: null,
						};
						wd.item[item].totalValue = wd.item[item].count * wd.item[item].value;
						wd.itemTotalValue += wd.item[item].totalValue;
					});
					Object.keys(wd.property).forEach(function(property) {
						wd.property[property] = {
							name: td.properties[property].name,
							count: wd.property[property],
							value: 0.75 * td.properties[property].cost,
							totalValue: null,
						};
						wd.property[property].totalValue = wd.property[property].count * wd.property[property].value;
						wd.propertyTotalValue += wd.property[property].totalValue;
					});
					wd.totalValue = wd.itemTotalValue + wd.propertyTotalValue + wd.pointsTotalValue + wd.moneyTotal;
					output(wheel + ':');
					output('    total spent: ' + wd.costTotal.toLocaleString());
					output('    total earned: ' + wd.totalValue.toLocaleString());
					output('    profitability: ' + (wd.totalValue / wd.costTotal).toFixed(3));
					output(['    profit per day:', Math.round((wd.totalValue - wd.costTotal) / wd.total).toLocaleString(), 'on', (wd.total - wd.freeCount).toLocaleString(), 'spins']);
				});
				//todo
				output(this.data.wheels);
			},
		},
		/* Template for new routines (remove any properties or parameters you're not using):

		name: {
			wip: true,
			description: "",
			require: [],
			data: {},
			init: function(ids) {
			},
			processor: function(log, hash) {
			},
			finish: function(output) {
			},
		},

		*/
	},
};
window.addEventListener('load', window.TornAPIReader.ui.load);