# ===== Variables =====

WIKIPEG_VERSION = `cat $(VERSION_FILE)`

# ===== Directories =====

SRC_DIR              = src
LIB_DIR              = lib
BIN_DIR              = bin
BROWSER_DIR          = browser
SPEC_DIR             = spec
BENCHMARK_DIR        = benchmark
NODE_MODULES_DIR     = node_modules
NODE_MODULES_BIN_DIR = $(NODE_MODULES_DIR)/.bin

# ===== Files =====

PARSER_SRC_FILE = $(SRC_DIR)/parser.pegjs
PARSER_OUT_FILE = $(LIB_DIR)/parser.js

BROWSER_FILE_DEV = $(BROWSER_DIR)/peg-$(WIKIPEG_VERSION).js
BROWSER_FILE_MIN = $(BROWSER_DIR)/peg-$(WIKIPEG_VERSION).min.js

VERSION_FILE = VERSION

# ===== Executables =====

NODE          = node
ESLINT        = $(NODE_MODULES_BIN_DIR)/eslint
UGLIFYJS      = $(NODE_MODULES_BIN_DIR)/uglifyjs
JASMINE_NODE  = $(NODE_MODULES_BIN_DIR)/jasmine-node
WIKIPEG       = $(BIN_DIR)/wikipeg
BENCHMARK_RUN = $(BENCHMARK_DIR)/run

# ===== Targets =====

# Default target
all: browser

# Generate the grammar parser
parser:
	$(WIKIPEG) $(PARSER_SRC_FILE) $(PARSER_OUT_FILE)

# Build the browser version of the library
browser:
	mkdir -p $(BROWSER_DIR)

	rm -f $(BROWSER_FILE_DEV)
	rm -f $(BROWSER_FILE_MIN)

	$(NODE) tools/build-browser.js > $(BROWSER_FILE_DEV)

	$(UGLIFYJS)                 \
	  --mangle                  \
	  --compress warnings=false \
	  --comments /Copyright/    \
	  -o $(BROWSER_FILE_MIN)    \
	  $(BROWSER_FILE_DEV)

# Remove browser version of the library (created by "browser")
browserclean:
	rm -rf $(BROWSER_DIR)

# Run the spec suite
spec:
	$(JASMINE_NODE) --verbose $(SPEC_DIR)

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

.PHONY:  all parser browser browserclean spec benchmark hint
.SILENT: all parser browser browserclean spec benchmark hint
