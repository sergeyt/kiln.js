// https://developers.fogbugz.com/default.asp?W156
(function(){

	// detect environment
	var require_impl;
	var env = 'browser';
	if (typeof module !== 'undefined') {
		env = 'node';
		require_impl = require;
	} else if (typeof Meteor !== 'undefined' && Meteor.isServer) {
		env = 'meteor';
		require_impl = Npm.require;
	}

	var request, extend, defer;
	var debug = function(x){};

	function node_request(request){
		return function(url, options){
			// accept fake request for tests
			var req = options.request || request;
			var d = defer();
			req(url, options, function(err, res, body){
				if (err) {
					debug('GET ' + url + ' failed with: ' + err);
					d.reject(err);
				} else {
					// TODO xml2json
					if (typeof body == 'string') {
						body = JSON.parse(body);
					}
					d.resolve(body);
				}
			});
			return typeof d.promise == 'function' ? d.promise() : d.promise;
		};
	}

	switch (env){
		case 'node':
		case 'meteor':
			debug = require_impl('debug')('teamcity.js');
			defer = require_impl('q').defer;
			extend = require_impl('underscore').extend;
			request = node_request(require_impl('request'), require_impl('q'));
		break;
		default:
			if (typeof window.debug != 'undefined') {
				debug = window.debug('teamcity.js');
			}
			defer = $.Deferred;
			extend = $.extend;
			request = function(url, options){
				// accept fake request for tests
				if (options.request){
					return node_request(options.request)(url, options);
				}
				var auth = options.auth;
				// TODO pass 'accept: application/json' header
				return $.ajax({
					type: 'GET',
					url: url,
					dataType: 'json',
					username: auth.user,
					password: auth.pass
				});
			};
		break;
	}

	// utils
	function is_absolute_uri(uri){
		return (/^https?:\/\//i).test(uri);
	}

	function format(s, args){
		return s.replace(/\{(\d+)\}/g, function(m, i){
			var index = (+i);
			return typeof args[index] != 'undefined' ? args[index] : '';
		});
	}

	function kiln(options){
		// check required options
		if (typeof options != 'object'){
			throw new Error('Options are not specified.');
		}

		var endpoint = options.url || options.endpoint;
		if (!endpoint || typeof endpoint != 'string'){
			throw new Error("Required 'endpoint' option is not specified.");
		}

		// auto-fix endpoint
		var app_rest = 'Api/1.0';
		if (endpoint.indexOf(app_rest) >= 0) {
			endpoint = endpoint.replace(app_rest, '');
		}
		if (endpoint.charAt(endpoint.length - 1) != '/'){
			endpoint += '/';
		}

		var user = options.user || options.username;
		var password = options.password || options.pwd;
		if (!user || typeof user != 'string') {
			throw new Error("Required 'user' option is not specified.");
		}
		if (!password || typeof password != 'string') {
			throw new Error("Required 'password' option is not specified.");
		}

		var req_opts = {
			auth: {
				user: user,
				pass: password
			},
			headers: {
				accept: 'application/json'
			}
		};

		// TODO locator - query arguments
		function build_url(baseUrl, entity, locator){
			if (!baseUrl) {
				baseUrl = endpoint + app_rest;
			} else if (!is_absolute_uri(baseUrl)) {
				baseUrl = endpoint + baseUrl;
			}
			if (baseUrl.charAt(baseUrl.length - 1) != '/'){
				baseUrl += '/';
			}
			return baseUrl + entity;
		}

		function get(baseUrl, entity, locator){
			var url = build_url(baseUrl, entity, locator);
			debug('GET ' + url);
			return request(url, req_opts);
		}

		// TODO login then create client

		return {
			// TODO api
		};
	}

	// expose public api for different environments
	switch (env) {
		case 'node':
			module.exports = kiln;
			break;
		case 'meteor':
			Kiln = kiln;
			// alias
			Kiln.connect = kiln;
			break;
		default:
			window.kiln = kiln;
			break;
	}

})();
