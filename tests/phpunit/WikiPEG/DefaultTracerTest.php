<?php
declare( strict_types = 1 );
namespace Test\WikiPEG;

use Wikimedia\WikiPEG\DefaultTracer;
use Wikimedia\WikiPEG\LocationRange;

/**
 * @coversDefaultClass \Wikimedia\WikiPEG\DefaultTracer
 */
class DefaultTracerTest extends \PHPUnit\Framework\TestCase {
	/**
	 * @covers ::trace
	 * @covers ::log
	 * @covers ::formatArgs
	 */
	public function testLogWithFullMatchEvent(): void {
		$tracer = new DefaultTracer();

		$location1 = new LocationRange( 0, 1, 26, 0, 1, 26 );
		$location2 = new LocationRange( 0, 1, 26, 0, 2, 1 );

		$events = [
			[
				'type' => 'rule.enter',
				'location' => $location1,
				'rule' => 'tlb',
				'args' => [
					'$boolParams' => 0,
					'$param_th' => null,
					'$param_headingIndex' => null,
					'$param_preproc' => null
				]
			],
			[
				'type' => 'rule.enter',
				'location' => $location1,
				'rule' => 'block',
				'args' => [
					'$boolParams' => 512,
					'$param_tagType' => '',
					'$param_th' => null,
					'$param_headingIndex' => null,
					'$param_&preproc' => '}-'
				]
			],
			[
				'type' => 'rule.fail',
				'location' => $location2,
				'rule' => 'block',
				'args' => []
			],
			[
				'type' => 'rule.match',
				'location' => $location2,
				'rule' => 'tlb',
				'args' => []
			]
		];

		ob_start();
		foreach ( $events as $event ) {
			$tracer->trace( $event );
		}
		$output = ob_get_clean();

		$expected = <<<EOT
1:26-1:26           rule.enter tlb<0x0, th=null, headingIndex=null, preproc=null>
1:26-1:26           rule.enter  block<0x200, tagType="", th=null, headingIndex=null, preproc=&"}-">
1:26-2:1            rule.fail   block
1:26-2:1            rule.match tlb

EOT;

		$this->assertEquals( $expected, $output );
	}
}
