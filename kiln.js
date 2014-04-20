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
			debug = require_impl('debug')('kiln');
			var q = require_impl('q');
			defer = q.defer;
			promise = q;
			extend = require_impl('underscore').extend;
			request = node_request(require_impl('request'), q);
		break;
		default:
			if (typeof window.debug != 'undefined') {
				debug = window.debug('kiln');
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
	function format(s, args){
		return s.replace(/\{(\d+)\}/g, function(m, i){
			var index = (+i);
			return typeof args[index] != 'undefined' ? args[index] : '';
		});
	}

	function combine(p1, p2) {
		if (p1) {
			return p1.charAt(p1.length - 1) != '/' ? p1 + '/' + p2 : p1 + p2;
		}
		return p2;
	}

	function reject(reason) {
		var d = defer();
		d.reject(reason);
		return typeof d.promise == 'function' ? d.promise() : d.promise;
	}

	// builds query string
	function qs(params) {
		if (!params) return '';
		var keys = Object.keys(params);
		if (keys.length === 0) return '';
		return '?' + keys.map(function(key){
			var val = params[key];
			return key + '=' + encodeURIComponent(String(val));
		}).filter(function(s){ return s.length > 0; })
		.join('&');
	}

	// api schema
	var project_api = {
		remove: 'POST:Delete'
	};

	var repo_group_api = {
		remove: 'POST:Delete'
	};

	var repo_api = {
		remove: 'POST:Delete',
		outgoing: 'Outgoing',
		history: 'History',
		diff: 'History/{rev}',
		manifest: 'Manifest',
		tags: 'Tags',
		branches: 'NamedBranches',
		related: {
			url: 'Related',
			prefix: 'Repo/{ixRepo}'
		},
		file: 'Raw/File/{path}'
	};
	repo_api.related.api = repo_api;

	var kiln_api = {
		projects: {
			url: 'Project',
			prefix: 'Project/{ixProject}',
			api: project_api
		},
		project: {
			url: 'Project/{id}',
			prefix: 'Project/{ixProject}',
			api: project_api
		},
		repo_groups: {
			url: 'RepoGroup',
			prefix: 'RepoGroup/{ixRepoGroup}',
			api: repo_group_api
		},
		repo_group: {
			url: 'RepoGroup/{id}',
			prefix: 'RepoGroup/{ixRepoGroup}',
			api: repo_group_api
		},
		repos: {
			url: 'Repo',
			prefix: 'Repo/{ixRepo}',
			api: repo_api
		},
		repo: {
			url: 'Repo/{id}',
			prefix: 'Repo/{ixRepo}',
			api: repo_api
		}
	};

	function kiln(options){
		// check required options
		if (typeof options != 'object'){
			throw new Error('Options are not specified.');
		}

		var endpoint = options.url || options.endpoint;
		if (!endpoint || typeof endpoint != 'string'){
			throw new Error("Required 'endpoint' option is not specified.");
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

		function get(path, params) {
			var url = combine(endpoint, path) + qs(params);
			debug('GET ' + url);
			return request(url, req_opts).then(function(d) {
				// TODO auto parse JSON in request function
				if (typeof d == 'string') {
					d = JSON.parse(d);
				}
				if (d.errors) {
					return reject(d.errors[0].sError);
				}
				return d;
			});
		}

		function eval_url_template(template, query, options) {
			var url = template.replace(/\{(\w+)\}/g, function(m, key){
				return query.hasOwnProperty(key) ? query[key] : '';
			});
			return combine(options.prefix, url);
		}

		function build_method(def, options) {
			var url_template, prefix, api;

			if (typeof def == 'object') {
				url_template = def.url;
				prefix = def.prefix;
				api = def.api;
			} else if (typeof def == 'string') {
				url_template = def;
			}

			return function(query, params) {
				var path = eval_url_template(url_template, query, options);
				// TODO support post requests
				params = extend(params || {}, {token: options.token});
				return get(path, params).then(function(d) {
					if (!api) {
						return d;
					}

					function extend_record(record) {
						var url_prefix = eval_url_template(prefix, record, {});
						return inject_api(record, api, {token: options.token, prefix: url_prefix});
					}

					return Array.isArray(d) ? d.map(extend_record) : extend_record(d);
				});
			};
		}

		function inject_api(obj, api, options) {
			Object.keys(api).forEach(function(key){
				var def = api[key];
				obj[key] = build_method(def, options);
			});
			return obj;
		}

		function create_client(token) {
			return inject_api({token: token}, kiln_api, {token: token});
		}

		if (token) {
			return promise(create_client(token));
		}

		return get('Auth/Login', {sUser: user, sPassword: password}).then(create_client);
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
