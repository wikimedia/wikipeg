<?php
declare( strict_types = 1 );

namespace Wikimedia\WikiPEG;

interface Tracer {
	public function trace( array $event ): void;
}
