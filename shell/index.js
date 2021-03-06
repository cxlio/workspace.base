
const
	plugin = module.exports = cxl('workspace.shell'),
	WHITELIST = {
		mkdir: true,
		mv: true,
		cp: true,
		rm: true
	},
	processList = {}
;

var pty;
try { pty = require('node-pty-prebuilt'); } catch (e) {}
try { pty = require('node-pty'); } catch (e) {}

function getOSShell()
{
const
	config = ide.configuration['shell.bin'],
	env = process.env
;
	if (config)
		return config;

	if (process.platform==='win32')
		return env.COMSPEC || 'cmd.exe';

	return env.SHELL || '/bin/bash';
}

class TerminalStream extends ide.ProcessStream {

	$initializeBindings(proc)
	{
		this.$process = proc;
		proc.on('data', this.$onData.bind(this));
		proc.on('exit', this.$onProcessClose.bind(this));
		proc.on('error', this.$onProcessError.bind(this));
	}

	write(data)
	{
		this.$process.write(data);
	}

}

class TerminalProcess extends ide.Process {

	$spawn(cmd, params, options)
	{
		return pty.spawn(cmd, params, options);
	}

	$createStream(process)
	{
		return new TerminalStream(process);
	}

	resize(cols, rows)
	{
		this.$process.resize(cols, rows);
	}

}

class SocketProcess {

	constructor(process)
	{
		this.clients = [];
		this.$process = process;
		this.$subscriber = process.stream.subscribe(this.onStream.bind(this));
	}

	onStream(ev)
	{
		ide.socket.broadcast('shell', { event: ev, pid: this.$process.pid }, this.clients);
	}

	registerClient(client)
	{
		if (this.clients.indexOf(client)===-1)
		{
			this.clients.push(client);

			client.on('close', this.unregisterClient.bind(this, client));
		}
	}

	unregisterClient(client)
	{
		var i = this.clients.indexOf(client);

		if (i===-1)
			throw "Invalid client";

		this.clients.splice(i, 1);
	}

	destroy()
	{
		this.$subscriber.unsubscribe();

		plugin.rpc.notify('close', { pid: this.$process.pid });
	}

}

class ShellProcess extends TerminalProcess {

	constructor(options)
	{
		const pid = options.pid;

		if (pid && processList[pid])
			return processList[pid];

		super();

		if (process.getuid)
		{
			options.uid = process.getuid();
			options.gid = process.getgid();
		}

		this.spawn(getOSShell(), [], options);

		processList[this.pid] = this;

		this.$process.on('close', this.onClose.bind(this));
		this.socket = new SocketProcess(this);

		plugin.rpc.notify('open', { pid: this.pid });
	}

	onClose()
	{
		this.destroy();
	}

	destroy()
	{
		delete processList[this.pid];
		this.socket.destroy();
	}

	toJSON()
	{
		var tags;

		if (this.socket.clients.length===0)
			tags = [ 'inactive' ];

		return {
			pid: this.pid,
			command: this.command,
			title: this.command,
			code: this.pid,
			tags: tags
		};
	}

}

class ShellRPC extends ide.RPCServer {

	constructor()
	{
		super('shell');
	}

	$createTerminal(pid, cwd)
	{
		return new ShellProcess({ pid: pid, cwd: cwd || ide.cwd });
	}

	resize(data)
	{
		var process = processList[data.pid];

		process.resize(data.columns, data.rows);
	}

	connect(data, client)
	{
		var process = this.$createTerminal(data.pid, data.cwd);

		process.socket.registerClient(client);
		process.resize(data.columns, data.rows);

		return process.toJSON();
	}

	in(data)
	{
		var process = processList[data.pid];

		process.stream.write(data.key);
	}

	disconnect()
	{
	}

}

plugin.extend({

	sourcePath: __dirname + '/shell.js'

}).config(function() {
	this.server = workspace.server;
}).route('POST', '/shell', function(req, res) {
var
	process, cmd = req.body.c
;
	if (!pty)
		return;

	if (!cmd || !(cmd in WHITELIST))
		return res.status(500).send(this.error('Invalid command.'));

	process = new ide.Process();
	process.spawn(req.body.c, req.body.q, { cwd: req.body.p});

	new ide.http.StreamResponse(res, process.stream);

}).route('GET', '/shell/terminal', function(req, res) {
	ide.http.ServerResponse.respond(res, cxl.map(processList, p => p.toJSON()), this);
}).run(function() {
	if (!pty)
		return this.log('Warning: pty support not enabled');

	this.rpc = new ShellRPC();
});
