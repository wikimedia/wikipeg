<?php

$cfg = require __DIR__ . '/../vendor/mediawiki/mediawiki-phan-config/src/config-library.php';

$cfg['directory_list'][] = 'tests';

if ( PHP_VERSION_ID >= 80000 && PHP_VERSION_ID < 81000 ) {
	// Don't complain about 'ReturnTypeWillChange' from PHP 8.1 on 8.0
	$cfg['suppress_issue_types'] = array_merge(
		$cfg['suppress_issue_types'],
		[
			'PhanUndeclaredClassAttribute',
		]
	);
}

return $cfg;
