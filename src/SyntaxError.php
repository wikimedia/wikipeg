<?php

namespace WikiPEG;

class SyntaxError extends \Exception {
  public $message, $expected, $found, $location, $name;

  public function __construct($message, $expected, $found, $location) {
    $this->message  = $message;
    $this->expected = $expected;
    $this->found    = $found;
    $this->location = $location;

    $this->name     = "SyntaxError";
  }
}
