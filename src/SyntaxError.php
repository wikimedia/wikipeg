<?php

namespace WikiPEG;

class SyntaxError extends \Exception {
  public $expected, $found, $location, $name;

  public function __construct($message, $expected, $found, $location) {
    parent::__construct( $message );
    $this->expected = $expected;
    $this->found    = $found;
    $this->location = $location;

    $this->name     = "SyntaxError";
  }

  public function getLocationString() {
    return $this->location['start']['line'] . ':' . $this->location['start']['column'];
  }
}
