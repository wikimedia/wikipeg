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

CASEFOLD_SRC_FILE = $(LIB_DIR)/utils/casefold.pegjs
CASEFOLD_OUT_FILE = $(LIB_DIR)/utils/casefold.js

TRANSFORMARRAY_SRC_FILE = $(LIB_DIR)/utils/transform-array.pegjs
TRANSFORMARRAY_OUT_FILE = $(LIB_DIR)/utils/transform-array.js

VERSION_FILE = VERSION

# ===== Executables =====

NODE          = node
PHP           = php
ESLINT        = $(NODE_MODULES_BIN_DIR)/eslint
JASMINE       = $(NODE_MODULES_BIN_DIR)/jasmine
WIKIPEG       = $(BIN_DIR)/wikipeg
BENCHMARK_RUN = $(BENCHMARK_DIR)/run

# ===== Targets =====

all: rebuild

# Generate the grammar parser
parser:
	$(WIKIPEG) --precise-failure $(PARSER_SRC_FILE) $(PARSER_OUT_FILE)

# Generate the case fold definitions parser
casefold:
	$(WIKIPEG) --precise-failure $(CASEFOLD_SRC_FILE) $(CASEFOLD_OUT_FILE)

# Generate the array transformation parser
transform-array:
	$(WIKIPEG) --precise-failure $(TRANSFORMARRAY_SRC_FILE) $(TRANSFORMARRAY_OUT_FILE)

# Generate the test case cache
testcache:
	$(PHP) tests/php/runCommonTests.php --write-cache

rebuild: parser casefold transform-array testcache

# If we've got PHP available, run the php test suite as well
test-with-php: spec common-tests-js common-tests-php

# If we don't have PHP available, validate that the testcache is up-to-date
test: spec common-tests-js validate-testcache

# Run the spec suite
spec:
	$(JASMINE)

common-tests-php:
	$(PHP) tests/php/runCommonTests.php

common-tests-js:
	$(NODE) tests/javascript/runCommonTests.js

# Validate the cached php output
validate-testcache:
	$(NODE) tests/javascript/validate-testcache.js

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

.PHONY:  all rebuild parser test common-tests-php spec benchmark eslint
.SILENT: all rebuild parser test common-tests-php spec benchmark eslint
