# ===== Variables =====

WIKIPEG_VERSION = `cat $(VERSION_FILE)`

# ===== Directories =====

LIB_DIR              = lib
BIN_DIR              = bin
SPEC_DIR             = tests/jasmine
BENCHMARK_DIR        = benchmark
NODE_MODULES_DIR     = node_modules
NODE_MODULES_BIN_DIR = $(NODE_MODULES_DIR)/.bin

# ===== Files =====

PARSER_SRC_FILE = $(LIB_DIR)/parser.pegjs
PARSER_OUT_FILE = $(LIB_DIR)/parser.js

VERSION_FILE = VERSION

# ===== Executables =====

NODE          = node
PHP           = php
ESLINT        = $(NODE_MODULES_BIN_DIR)/eslint
JASMINE_NODE  = $(NODE_MODULES_BIN_DIR)/jasmine-node
WIKIPEG       = $(BIN_DIR)/wikipeg
BENCHMARK_RUN = $(BENCHMARK_DIR)/run

# ===== Targets =====

all: parser test-parsers

# Generate the grammar parser
parser:
	$(WIKIPEG) $(PARSER_SRC_FILE) $(PARSER_OUT_FILE)

test: spec common-tests-php common-tests-js

# Run the spec suite
spec:
	$(JASMINE_NODE) --verbose $(SPEC_DIR)

common-tests-php:
	$(PHP) tests/php/runCommonTests.php

common-tests-js:
	$(NODE) tests/javascript/runCommonTests.js

# Run the benchmark suite
benchmark:
	$(BENCHMARK_RUN)

# Run ESLint on the source
eslint:
	$(ESLINT)                                                                \
	  --ignore-pattern=$(SPEC_DIR)/vendor                                    \
	  $(LIB_DIR)                                                             \
	  $(SPEC_DIR)                                                            \
	  $(BENCHMARK_DIR)/*.js                                                  \
	  $(BENCHMARK_RUN)                                                       \
	  $(WIKIPEG)

.PHONY:  parser test-parsers test common-tests-php spec benchmark eslint
.SILENT: parser test-parsers test common-tests-php spec benchmark eslint
