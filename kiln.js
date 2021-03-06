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

	// trim polyfill
	if (!String.prototype.trim) {
		String.prototype.trim = function () {
			return this.replace(/^\s+|\s+$/g, '');
		};
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
					return;
				}
				// handle html error page
				var contentType = (res.headers['content-type'] || '').toLowerCase();
				if (contentType.indexOf('html') >= 0) {
					var m = (/<title>([^<]*)<\/title>/).exec(body);
					if (m) {
						err = m[1];
						d.reject(err.trim());
					} else {
						d.reject(body);
					}
					return;
				}
				if (options.type == 'json') {
					if (typeof body == 'string') {
						body = JSON.parse(body);
					}
				}
				d.resolve(body);
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
			request = function(url, options) {
				// accept fake request for tests
				if (options.request) {
					return node_request(options.request)(url, options);
				}
				var query = {
					type: 'GET',
					url: url
				};
				if (options.type == 'json') {
					query.dataType = 'json';
				}
				// TODO handle html error page
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

	// converters
	function convert_user(it) {
		return {
			id: it.ixPerson,
			name: it.sName,
			email: it.sEmail
		};
	}

	function convert_project(it) {
		return {
			id: it.ixProject,
			name: it.sName,
			description: it.sDescription,
			slug: it.sSlug,
			permissionDefault: it.permissionDefault,
			repoGroups: (it.repoGroups || []).map(convert_repo_group)
		};
	}

	function convert_repo_group(it) {
		return {
			id: it.ixRepoGroup,
			projectId: it.ixProject,
			name: it.sName,
			slug: it.sSlug,
			repos: (it.repos || []).map(convert_repo)
		};
	}

	function convert_repo(it) {
		var res = {
			id: it.ixRepo,
			name: it.sName,
			description: it.sDescription,
			parentId: it.ixParent,
			groupId: it.ixRepoGroup,
			permissionDefault: it.permissionDefault,
			central: it.fCentral,
			bytesSize: it.bytesSize,
			aliases: it.rgAliases,
			slug: it.sSlug,
			groupSlug: it.sGroupSlug,
			projectSlug: it.sProjectSlug,
			status: it.sStatus,
			branches: (it.repoBranches || []).map(convert_repo)
		};
		if (it.personCreator) {
			res.creator = {
				id: it.personCreator.ixPerson,
				name: it.personCreator.sName,
				email: it.personCreator.sEmail
			};
		}
		return res;
	}

	function convert_bug(it) {
		return {
			date: new Date(Date.parse(it.dt)),
			bugs: it.ixBugs || [],
			reviews: it.ixReviews || [],
			rev: it.rev,
			revParent1: it.revParent1,
			revParent2: it.revParent2,
			author: it.sAuthor,
			description: it.sDescription
		};
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
			prefix: 'Project/{id}',
			api: project_api,
			convert: convert_project
		},
		project: {
			url: 'Project/{id}',
			prefix: 'Project/{id}',
			api: project_api,
			convert: convert_project
		},
		repo_groups: {
			url: 'RepoGroup',
			prefix: 'RepoGroup/{ixRepoGroup}',
			api: repo_group_api,
			convert: convert_repo_group
		},
		repo_group: {
			url: 'RepoGroup/{id}',
			prefix: 'RepoGroup/{ixRepoGroup}',
			api: repo_group_api,
			convert: convert_repo_group
		},
		repos: {
			url: 'Repo',
			prefix: 'Repo/{ixRepo}',
			api: repo_api,
			convert: convert_repo
		},
		repo: {
			url: 'Repo/{id}',
			prefix: 'Repo/{ixRepo}',
			api: repo_api,
			convert: convert_repo
		},
		bug: {
			url: 'Bug/{id}',
			convert: convert_bug
		},
		users: {
			url: 'Person',
			convert: convert_user
		},
		people: {
			url: 'Person',
			convert: convert_user
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
			var url_template, prefix, api, convert;

			if (typeof def == 'object') {
				url_template = def.url;
				prefix = def.prefix;
				api = def.api;
				convert = def.convert;
			} else if (typeof def == 'string') {
				url_template = def;
			}

			function extend_record(record) {
				if (typeof convert == 'function') {
					record = convert(record);
				}
				var url_prefix = eval_url_template(prefix, record, {});
				return inject_api(record, api, {token: options.token, prefix: url_prefix});
			}

			return function(query, params) {
				var path = eval_url_template(url_template, query, options);
				// TODO support post requests
				params = extend(params || {}, {token: options.token});
				return get(path, params).then(function(d) {
					if (api) {
						return Array.isArray(d) ? d.map(extend_record) : extend_record(d);
					}
					if (typeof convert == 'function') {
						return Array.isArray(d) ? d.map(convert) : convert(d);
					}
					return d;
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
