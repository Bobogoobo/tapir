/*
	#########################################
	######                             ######
	#####    Torn API Reader (TAPIR)    #####
	##### copyright Bobogoobo [2618206] #####
	######                             ######
	#########################################

	Please credit me if using any part of this and do not redistribute this file. I'd rather enhance this version than have forks.
	For any suggestions, questions, or issues, please mail me in game (not chat) or message me on Discord (I'm verified in the Torn server).
	If you do something cool using this, feel free to send me a link!
*/

'use strict';

/* This should be the only function called from the page. It sets `this` appropriately for the requested function.
	Only use from the program if `this` is required.
	*func: the name of the function to call within TornLogReader.ui.
	*pone (optional): first parameter to pass to the given function.
	*ptwo (optional): second parameter to pass to the given function.
	*pthree (optional): third parameter to pass to the given function.
*/
function TAPIR(func, pone, ptwo, pthree) {
	TornAPIReader.ui[func].call(TornAPIReader, pone, ptwo, pthree);
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
			isRunning: false,// whether the program is currently making requests
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
			torn: {
				logCategories: {},// the list of log categories (id -> name) from the Torn API
				logCatByName: {},// the above, inverted (category name -> id)
				logTypes: {},// the list of log types (id -> description) from the Torn API
			},
		};
	},
	/* An object to convert some common log strings to IDs. Using arrays for ease of use. Values must be unique and start from 1 (0 for no value). Key lowercase and singular, sorted. */
	customLogID: {
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
		requires.forEach(function(req) {
			req = req.split('.');
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
	/* Handles each response for requested auxiliary data, storing it where needed.
		*response: the JSON data obtained by request().
		*url: the requested URL.
	*/
	handleRequire: function(response, url) {
		var zone = url.match(/\/([a-z]+)\/\?/)[1];
		Object.keys(response).forEach(function(endpoint) {
			var path = zone + '.' + endpoint;
			var temp;
			//Begin specific data items to manipulate
			if (path === 'torn.items') {
				//For items, store base URL and remove it from each item to save a bit of space
				temp = response[endpoint][1].image.split(/(\d)/);// first item is keyed 1, this is not array access
				Object.keys(response[endpoint]).forEach(function(item) {
					response[endpoint][item].image = response[endpoint][item].image.replace(temp[0], '');
				});
				response[endpoint].base_url = temp[0];
			}
			//End manipulation
			//Begin replacing strings with custom IDs
			if (path === 'torn.properties') {
				temp = [this.customLogID.staff, this.customLogID.upgrade];
				Object.keys(response[endpoint]).forEach(function(property) {
					//shortening keys as well
					response[endpoint][property].staff = response[endpoint][property].staff_available.map(function(staff) {
						return temp[0].indexOf(staff);
					});
					response[endpoint][property].upgrades = response[endpoint][property].upgrades_available.map(function(upgrade) {
						return temp[1].indexOf(upgrade);
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
						if (/^(?:Arrested by|Was caught trying to break out)/.test(datum)) {
							dataStaging.data.user = parseInt(datum.match(this.regex.userid)[1], 10);// add new key for user
							datum = datum.replace(this.regex.linkText, '$1');
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
						if (this.customLogID.combatstat.indexOf(datumName.replace('_before', '')) > 0) {
							dataStaging.data.stat = this.customLogID.combatstat.indexOf(datumName.replace('_before', ''));// add new key in order
							datumName = 'before';
							//fix API inconsistency in data type
							datum = parseFloat(datum, 10);
						} else if (this.customLogID.combatstat.indexOf(datumName.replace('_after', '')) > 0) {
							datumName = 'after';
						} else if (this.customLogID.combatstat.indexOf(datumName.replace('_increased', '')) > 0) {
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
					//  in order of customLogID key name
					if (logLine.category === 'Captcha' && datumName === 'type') {
						datum = this.customLogID.captcha.indexOf(datum);
					}
					if (logLine.category === 'Job' && datumName === 'job') {
						datum = this.customLogID.cityjob.indexOf(datum);
					}
					if (['Casino high-low lose', 'Casino high-low draw', 'Casino high-low win'].indexOf(logLine.title) !== -1 && (datumName === 'action' || datumName === 'result')) {
						datum = this.customLogID.highlow.indexOf(datum);
					}
					if (logLine.title === 'Hunting' && datumName === 'session_type') {
						datum = this.customLogID.hunting.indexOf(datum);
					}
					if ((logLine.title === 'API key add' || logLine.title == 'API key delete') && datumName === 'access_level') {
						datum = this.customLogID.key.indexOf(datum);
					}
					if ((logLine.title === 'Casino lottery bet' || logLine.title === 'Casino lottery win') && datumName === 'lottery') {
						datum = this.customLogID.lottery.indexOf(datum);
					}
					if (logLine.category === 'Missions' && datumName === 'difficulty') {
						datum = datum.replace(/^v/, 'very ');
						datum = this.customLogID.missiondiff.indexOf(datum);
					}
					if (logLine.category === 'Missions' && datumName === 'type') {
						datum = this.customLogID.missiontype.indexOf(datum);
					}
					if (logLine.category === 'Revive preference' && datumName === 'result') {
						datum = this.customLogID.revive.indexOf(datum);
					}
					//todo: verify using someone's data - what datumName is and if it's an array with strings capitalized
					if (logLine.title === 'Property staff' && datumName === 'staff') {
						datum = datum.map(function(staff) {
							return this.customLogID.staff.indexOf(staff);
						}, this);
					}
					if (logLine.title === 'Travel initiate' && datumName === 'travel_method') {
						datum = this.customLogID.travel.indexOf(datum);
					}
					if (logLine.title === 'Property upgrade' && datumName === 'upgrades') {
						datum = datum.map(function(upgrade) {
							//First need to make strings consistent with torn.properties list
							if (/interior/i.test(upgrade)) {
								upgrade = upgrade + ' modification';
							}
							upgrade = upgrade.replace(/\s\S/g, function(match) { return match.toUpperCase(); });
							return this.customLogID.upgrade.indexOf(upgrade);
						}, this);
					}
					if (logLine.category === 'Viruses' && datumName === 'virus') {
						datum = this.customLogID.virus.indexOf(datum);
					}
					//todo: If the "Spin the wheel" category gets implemented, use that instead
					if (logLine.category === 'Casino' && /^Casino spin the wheel/.test(logLine.title) && datumName === 'wheel') {
						datum = this.customLogID.wheel.indexOf(datum);
					}
					//End custom IDs
					//End manipulation
					if (datum === undefined) {
						datum = null;
					}
					dataStaging.data[datumName] = datum;
				}, this);
				if (!Object.keys(dataStaging.data).length) {
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
				this.routines[modus].processor.call(this.routines[modus], logCopy, hash);
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
		if (modules[0] === 'ALL') {
			modules = Object.keys(this.routines);
		}
		this.config.modules = modules.filter(function(modus) {
			modus = modus.trim();
			if (!modus) {
				return false;
			}
			var routine = this.routines[modus];
			if (routine) {
				if (typeof routine.init === 'function') {
					routine.init(this.customLogID);
				}
				return true;
			} else {
				this.ui.putlog('Routine named `' + modus + '` was not found.', 'warning');
				return false;
			}
		}, this);
		this.config.useStored = useStored;
		if (!this.config.useStored) {
			if (limit && Object.keys(limit).length) {
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
		} else if (!Object.keys(this.data.logs).length) {
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
		if (response.error) {
			//todo: this is always intercepted in request
			this.ui.putlog('Stopping. Please check your API key. Error: ' + response.error.error, 'error');
			return;
		}
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
		this.config.modules.forEach(function(modus) {
			if (typeof this.routines[modus].finish === 'function') {
				this.ui.putlog('*' + modus + ':', 'info');
				this.routines[modus].finish(function(msg, swtch) { return TAPIR('putlog', msg, 'routine', swtch); });
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
		if (!logs || !Object.keys(logs).length) {
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
		// Shortcut to add items to above nested object formats
		function addToObject(obj, outer, inner, value) {
			if (obj[outer]) {
				obj[outer][inner] = value ? value : (obj[outer][inner] || 0) + 1;
			} else {
				obj[outer] = {};
				obj[outer][inner] = value ? value : 1;
			}
		}
		
		Object.keys(logs).forEach(function(hash) {
			var log = logs[hash];
			var data = log.data || {};
			var keyCount = 0;
			logTypes[log.title] = (logTypes[log.title] || 0) + 1;
			Object.keys(data).forEach(function(dataKey) {
				var dataValue = data[dataKey];
				var titleAndKey = log.title + ' ' + dataKey;
				keyCount += 1;
				if ((dataValue || '').toString() === '[object Object]') {
					dataValue = JSON.stringify(dataValue);
				}
				if (dataKey.length > keyLengthCutoff) {
					addToObject(longestKeys, dataKey.length, dataKey);
				}
				//Exclude floats
				if ((dataValue || '').toString().length > valueLengthCutoff && (typeof dataValue === 'number' ? Math.floor(dataValue) === dataValue : true)) {
					//Exclude known IDs and long integers
					if (!((dataKey === 'log' && (dataValue || '').toString().length === 32) || dataKey === 'trade_id' || /^\d{5,10}$/.test(dataValue))) {
						addToObject(longestValues, (dataValue || '').toString().length, dataValue);
					}
				}
				if (typeof dataValue === 'string' && !isNaN(parseFloat(dataValue, 10)) && parseFloat(dataValue, 10).toString().length === dataValue.length) {
					addToObject(dataTypes, 'number string', titleAndKey);
				} else if (typeof dataValue === 'boolean') {
					addToObject(dataTypes, 'boolean', titleAndKey);
				} else if (dataValue === null && ['8390 opponent'].indexOf(titleAndKey) === -1) {
					addToObject(dataTypes, 'null', titleAndKey);
				} else if (dataValue === '') {
					addToObject(dataTypes, 'empty string', titleAndKey);
				}
				if (/[^a-z_]/.test(dataKey)) {
					addToObject(dataTypes, 'weird key', titleAndKey);
				}
			});
			if (keyCount > 1 || (keyCount === 0 && log.data)) {
				addToObject(mostKeys, keyCount, log.title);
			}
		});
		Object.keys(this.data.torn.logTypes).forEach(function(type) {
			addToObject(logCounts, logTypes[type] || 0, type, this.data.torn.logTypes[type]);
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
		/* Called to begin execution of the program given user input from forms on the page, which is formatted here.
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
			routines = routines.split(',');
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

			this.start(key, routines, useStored, limits, save, rate, progress);
		},
		/* Called by a file upload form to parse and store a previously downloaded log file. */
		readFile: function() {
			var self = this;
			var file = document.getElementById('log-file').files[0];
			if (!file) {
				this.ui.putlog('Please select a file.', 'error');
				return;
			}
			var reader = new FileReader();
			var data;
			reader.onload = function() {
				try {
					data = JSON.parse(reader.result);
				} catch (err) {
					self.ui.putlog('Error parsing file contents: ' + err, 'error');
					return;
				}
				self.data.logs = data;
				self.ui.putlog(['Stored data for', Object.keys(data).length, 'logs.']);
			};
			reader.readAsText(file);
			reader.onerror = function() {
				self.ui.putlog('Error reading file: ' + reader.error, 'error');
			};
		},
		/* Prints the logs retrieved from the API to an element on the page.
			*spaced (optional): if true, the dump will be more human-readable; otherwise, it will be minified.
				Must be specified when called from the program and unspecified when called from the interface.
		*/
		displayLogs: function(spaced) {
			if (!Object.keys(this.data.logs || {}).length) {
				return;
			}
			var ta = document.getElementById('log-download');
			if (spaced === undefined) {
				spaced = !(ta.dataset.spaced === 'true');
				ta.dataset.spaced = spaced;
			}
			ta.value = JSON.stringify(this.data.logs, null, (spaced ? '\t' : null));
		},
		/* Outputs a message to the event log on the page. Note: a wrapper function is passed to `finish` in routines; documentation there needs to be updated for changes.
			*msg: the message to display, or something to be converted to a message.
			*type (optional): the type of message. Can be one of: error (only use if stopping execution), warning, info (default), routine.
			*onoff (optional): if true and `msg` is:
				an array - toString will be called instead of joining it with spaces.
				an object - it will be stringified without spaces instead of using tabs.
		*/
		putlog: function(msg, type, onoff) {
			var out = document.getElementById('logging').value ? '\n' : '';
			if (type === 'error') {
				out += 'ERROR: ';
				window.TornAPIReader.runtime.isRunning = false;
			} else if (type === 'warning') {
				out += 'Warning: ';
			} else if (type === 'routine') {
				out += '    ';
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
					out += JSON.stringify(msg, null, onoff ? null : '\t').replace(/\n/g, '\n    ');
				} else {
					out += msg.toString();
				}
			} else {
				out += msg;
			}
			document.getElementById('logging').value += out;
		},
		clearLog: function() {
			document.getElementById('logging').value = '';
		},
		/* Called to run log metadata analysis. */
		analyze: function() {
			this.analyzeLogs();
		},
	},
	/* This holds all the modules for tracking different data points in the log.
		The key should be a short identifier. All lowercase alphabetical names are recommended to avoid user errors. Please keep them alphabetized.
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
				`init` is passed the list of custom string->ID maps used by the program.
					Store **only the associations you need**, preferably as `data.id` to exclude it from output.
			MAY NOT access any properties outside of its scope, which will be provided as `this`, and passed parameters.
			MAY have a docstring for a more verbose description/explanation.
		The passed logs:
			Have already been converted to standard keys, notation, and data types.
				If using data containing strings that the program maps to IDs, you will need to store **only the associations you need** from `init`.
			Contain the following keys: timestamp, category, title, data.
			Have had category and title converted back to strings matching the Torn API list.
	*/
	routines: {
		captcha: {
			description: "Gets stats on the player's interaction with captchas.",
			data: {},
			init: function(custom) {
				this.data = {
					count: { 'total': 0, 'success': 0, 'failure': 0, 'unknown': 0 },
					types: {},
					id: custom.captcha,
				};
			},
			processor: function(log) {
				if (log.category === 'Captcha') {
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
					} else {
						this.data.count.unknown += 1;
					}
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
			data: {},
			init: function(custom) {
				
			},
			processor: function(log) {
				//TODO
			},
			finish: function(output) {
				
			},
		},
		footroulette: {
			description: "Gets stats on the player's Foot Russian Roulette games.",
			data: {},
			init: function() {
				
			},
			processor: function(log) {
				//TODO
			},
		},
		/* Builds a list of other players with whom the player has interacted in any way, sorted by most frequent.
			Does not include things that aren't recorded in the API, like racing opponents.
		*/
		interactions: {
			description: "Builds a list of other players with whom the player has interacted and how, with some exceptions.",
			data: {},
			init: function() {
				
			},
			processor: function(log) {
				//TODO
			},
		},
		wheels: {
			description: "Gets stats on the player's spins on Leslie's wheels.",
			require: ['torn.items', 'torn.properties', 'torn.pawnshop'],
			data: {},
			init: function(custom) {
				this.data = {
					id: custom.wheel,
					wheels: {},
				};
				custom.wheel.forEach(function(wheel) {
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
				if (log.category === 'Casino' && /^Casino spin the wheel/.test(log.title)) {
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
								oa[base][addValue] = (oa[base][addValue] || 0) + 1;
								wd[base][addValue] = (wd[base][addValue] || 0) + 1;
							} else {
								oa[base + 'Total'] += addValue;
								wd[base + 'Total'] += addValue;
							}
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
					output('    total spent - ' + wd.costTotal.toLocaleString());
					output('    total earned - ' + wd.totalValue.toLocaleString());
					output('    profitability - ' + (wd.totalValue / wd.costTotal).toFixed(3));
					output(['    profit per day -', Math.round((wd.totalValue - wd.costTotal) / wd.total).toLocaleString(), 'on', (wd.total - wd.freeCount).toLocaleString(), 'spins']);
				});
				//todo
				output(this.data.wheels);
			},
		},
		/* Template for new routines (remove any parts or variables you're not using):

		name: {
			description: "",
			require: [],
			data: {},
			init: function(custom) {
			},
			processor: function(log, hash) {
			},
			finish: function(output) {
			},
		},

		*/
	},
};