'use strict';

// process.memoryUsage.rss() can throw on some platforms, see #67
function safeRss() {
	try {
		return process.memoryUsage.rss();
	} catch {
		return;
	}
}

module.exports = safeRss;
