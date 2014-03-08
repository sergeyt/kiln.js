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

	var request, extend, defer, promise;
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
					if (options.type == 'json') {
						if (typeof body == 'string') {
							body = JSON.parse(body);
						}
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
			debug = require_impl('debug')('kiln.js');
			var q = require_impl('q');
			defer = q.defer;
			promise = q;
			extend = require_impl('underscore').extend;
			request = node_request(require_impl('request'), q);
		break;
		default:
			if (typeof window.debug != 'undefined') {
				debug = window.debug('kiln.js');
			}
			defer = $.Deferred;
			promise = function(value) {
				return $.Deferred().resolve(value).promise();
			};
			extend = $.extend;
			request = function(url, options){
				// accept fake request for tests
				if (options.request){
					return node_request(options.request)(url, options);
				}
				var query = {
					type: 'GET',
					url: url
				};
				if (options.type == 'json') {
					query.dataType = 'json';
				}
				return $.ajax(query);
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

	// builds query string
	function qs(params) {
		var keys = Object.keys(params);
		if (keys.length === 0) return '';
		return '?' + keys.map(function(key){
			var val = params[key];
			return key + '=' + encodeURIComponent(String(val));
		}).filter(function(s){ return s.length > 0; })
		.join('&');
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

		if (endpoint.charAt(endpoint.length - 1) != '/') {
			endpoint += '/';
		}

		var token = options.token;
		var user = options.user || options.username;
		var password = options.password || options.pwd;
		if (token) {
			if (typeof token != 'string') {
				throw new Error("'token' option is not string.");
			}
		} else {
			if (!user || typeof user != 'string') {
				throw new Error("Required 'user' option is not specified.");
			}
			if (!password || typeof password != 'string') {
				throw new Error("Required 'password' option is not specified.");
			}
		}

		// request options
		var req_opts = {};

		function build_url(baseUrl, path, params){
			if (!baseUrl) {
				baseUrl = endpoint + api_prefix;
			} else if (!is_absolute_uri(baseUrl)) {
				baseUrl = endpoint + baseUrl;
			}
			if (baseUrl.charAt(baseUrl.length - 1) != '/'){
				baseUrl += '/';
			}
			return baseUrl + path + qs(params);
		}

		function get(baseUrl, entity, params){
			var url = build_url(baseUrl, entity, params);
			debug('GET ' + url);
			return request(url, req_opts);
		}

		function create_client(token){
			return {
				// TODO api
			};
		}

		if (token) {
			var client = create_client(token);
			return promise(client);
		}

		return get('', 'Auth/Login', {sUser: user, sPassword: password}).then(create_client);
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
