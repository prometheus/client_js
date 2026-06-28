'use strict';

// process.memoryUsage.rss() Can throw on some platforms, see #67
function safeRss() {
	try {
		return process.memoryUsage.rss();
	} catch {
		return;
	}
}

module.exports = safeRss;
