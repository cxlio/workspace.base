/**
 *
 * workspace.npm
 *
 */
"use strict";

var
	plugin = module.exports = cxl('workspace.npm')
;

plugin.config(function() {

	workspace.plugins.on('project.create', function(project) {

	var
		pkg = workspace.common.load_json_sync(project.path + '/package.json'),
		config = project.configuration,
		links
	;

		if (pkg)
		{
			config.tags.npm = true;
			config.name = config.name || pkg.name;
			config.version = config.version || pkg.version;
			config.description = config.description || pkg.description;
			config.license = config.license || pkg.license;
			
			links = [];
			
			if (pkg.homepage)
				links.push({ l: pkg.homepage, c: 'home', t: 'Homepage' });
			if (pkg.repository)
				links.push({ l: pkg.repository.url, c: 'database', t: 'Repository' });
			if (pkg.bugs)
				links.push({ l: pkg.bugs.url, c: 'bug', t: 'Bug Tracker' });
					
			config.links = config.links ? config.links.concat(links) : links;
		}

	});

});
