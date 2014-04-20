kiln = require '../kiln.js'
opts =
	endpoint: process.env.KILN_URL
	user: process.env.KILN_USER
	pwd: process.env.KILN_PWD

kiln(opts)
	.then (client) ->
		console.log('token: %s', client.token)
		client.bug({id: 171868})
	.then (list) ->
		console.log(list)
	.catch (err) ->
		console.log(err)
