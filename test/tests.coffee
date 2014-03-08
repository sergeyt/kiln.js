kiln = require '../kiln'
should = require 'should'
_ = require 'underscore'

# creates fake request
fakeRequest = ->
	responses = []
	req = (url, opts, cb) ->
		r = _.find responses, (x) ->
			return x[0](url) if typeof x[0] is 'function'
			return x[0].test(url)
		return cb('#{url} is not routed', null, null) if !r
		# TODO provide response object
		return cb null, {}, r[1] if typeof r[1] is 'string'
		throw new Error('not implemented!')

	req.get = req

	req.on = (matcher, response) ->
		matcher = new RegExp(matcher) if typeof matcher is 'string'
		responses.push [matcher, response]

	return req

create = (req) ->
	teamcity
		url: 'http://test.com',
		email: 'test@test.com',
		password: '1',
		request: req

create2 = (req) ->
	teamcity
		url: 'http://test.com',
		token: 'token',
		request: req

describe 'with kiln', ->

	it 'check required options', ->
		(-> kiln()).should.throw('Options are not specified.')
		(-> kiln({url: ''})).should.throw("Required 'endpoint' option is not specified.")
		(-> kiln({url: 123})).should.throw("Required 'endpoint' option is not specified.")
		(-> kiln({url: 'abc', user: ''})).should.throw("Required 'user' option is not specified.")
		(-> kiln({url: 'abc', user: 123})).should.throw("Required 'user' option is not specified.")
		(-> kiln({url: 'abc', user: 'abc', password: ''})).should.throw("Required 'password' option is not specified.")
		(-> kiln({url: 'abc', user: 'abc', password: 123})).should.throw("Required 'password' option is not specified.")
