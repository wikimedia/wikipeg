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
ESLINT        = $(NODE_MODULES_BIN_DIR)/eslint
JASMINE_NODE  = $(NODE_MODULES_BIN_DIR)/jasmine-node
WIKIPEG       = $(BIN_DIR)/wikipeg
BENCHMARK_RUN = $(BENCHMARK_DIR)/run

# ===== Targets =====

# Generate the grammar parser
parser:
	$(WIKIPEG) $(PARSER_SRC_FILE) $(PARSER_OUT_FILE)

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

.PHONY:  parser spec benchmark hint
.SILENT: parser spec benchmark hint
