<?php
/*HEADER_COMMENT*/
/*NAMESPACE*/

/*INITIALIZER0*/

class CLASS_NAME extends \Wikimedia\WikiPEG\PEGParserBase {
	// initializer
	/*INITIALIZER*/

	// cache init
	/*CACHE_INIT*/

	// expectations
	protected $expectations = [
		/*EXPECTATIONS*/
	];

	// actions
	/*ACTIONS*/

	// generated
	/*GENERATED*/

	public function parse( $input, $options = [] ) {
		$this->initInternal( $input, $options );
		$startRule = $options['startRule'] ?? '(DEFAULT)';
		$result = null;

		if ( !empty( $options['stream'] ) ) {
			switch ( $startRule ) {
				/*STREAM_CASES*/
			default:
				throw new \Wikimedia\WikiPEG\InternalError( "Can't stream rule $startRule." );
			}
		} else {
			switch ( $startRule ) {
				/*START_CASES*/
			default:
				throw new \Wikimedia\WikiPEG\InternalError( "Can't start parsing from rule $startRule." );
			}
		}

		if ( $result !== self::$FAILED && $this->currPos === $this->inputLength ) {
			return $result;
		} else {
			if ( $result !== self::$FAILED && $this->currPos < $this->inputLength ) {
				$this->fail( /*END_EXPECTATION*/ );
			}
			throw $this->buildParseException();
		}
	}
}
