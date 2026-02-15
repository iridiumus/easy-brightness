CC ?= gcc
CFLAGS ?= -Wall -Wextra -O2
LDFLAGS ?= -lddcutil

UUID := easy-brightness@iridiumus
HELPER := easy-brightness-helper
BUILD_DIR := build
DIST_DIR := dist
PO_DIR := po

INSTALL_PREFIX ?= $(HOME)/.local
DESTDIR ?=

APPLET_INSTALL_DIR := $(DESTDIR)$(INSTALL_PREFIX)/share/cinnamon/applets/$(UUID)
LOCALE_INSTALL_DIR := $(DESTDIR)$(INSTALL_PREFIX)/share/locale

PO_FILES := $(wildcard $(PO_DIR)/*.po)
MO_FILES := $(patsubst $(PO_DIR)/%.po,$(BUILD_DIR)/locale/%/LC_MESSAGES/$(UUID).mo,$(PO_FILES))

.PHONY: all build compile-mo install install-system uninstall clean \
	format-check lint test verify \
	changelog-check package release-check

all: build

build: $(BUILD_DIR)/$(HELPER)

$(BUILD_DIR)/.dir:
	mkdir -p $(BUILD_DIR)
	touch $@

$(BUILD_DIR)/$(HELPER): easy-brightness-helper.c | $(BUILD_DIR)/.dir
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

$(BUILD_DIR)/locale/%/LC_MESSAGES/$(UUID).mo: $(PO_DIR)/%.po | $(BUILD_DIR)/.dir
	mkdir -p $(dir $@)
	msgfmt --check -o $@ $<

compile-mo: $(MO_FILES)

install: build compile-mo
	install -d "$(APPLET_INSTALL_DIR)"
	install -m 0755 "$(BUILD_DIR)/$(HELPER)" "$(APPLET_INSTALL_DIR)/$(HELPER)"
	install -m 0644 applet.js metadata.json settings-schema.json README.md LICENSE "$(APPLET_INSTALL_DIR)/"
	install -d "$(APPLET_INSTALL_DIR)/po"
	install -m 0644 "$(PO_DIR)/$(UUID).pot" "$(APPLET_INSTALL_DIR)/po/"
	for po in $(PO_FILES); do \
		install -m 0644 "$$po" "$(APPLET_INSTALL_DIR)/po/"; \
	done
	if [ -f "$(PO_DIR)/LINGUAS" ]; then install -m 0644 "$(PO_DIR)/LINGUAS" "$(APPLET_INSTALL_DIR)/po/"; fi
	for mo in $(MO_FILES); do \
		lang="$$(echo "$$mo" | sed -E 's#^$(BUILD_DIR)/locale/([^/]+)/.*#\1#')"; \
		install -d "$(LOCALE_INSTALL_DIR)/$$lang/LC_MESSAGES"; \
		install -m 0644 "$$mo" "$(LOCALE_INSTALL_DIR)/$$lang/LC_MESSAGES/$(UUID).mo"; \
	done
	@echo "Installed applet to $(APPLET_INSTALL_DIR)"
	@echo "Add it from Cinnamon Applets settings."

install-system:
	$(MAKE) install INSTALL_PREFIX=/usr DESTDIR=$(DESTDIR)

uninstall:
	rm -rf "$(HOME)/.local/share/cinnamon/applets/$(UUID)"
	if [ -d "$(HOME)/.local/share/locale" ]; then \
		find "$(HOME)/.local/share/locale" -path "*/LC_MESSAGES/$(UUID).mo" -delete; \
	fi
	@echo "Removed user-local installation for $(UUID)"

format-check:
	if command -v clang-format >/dev/null 2>&1; then \
		clang-format --dry-run --Werror easy-brightness-helper.c; \
	else \
		echo "clang-format not found; skipping C format check"; \
	fi
	if command -v shfmt >/dev/null 2>&1; then \
		shfmt -d scripts/*.sh; \
	else \
		echo "shfmt not found; skipping shell format check"; \
	fi

lint:
	if command -v cppcheck >/dev/null 2>&1; then \
		cppcheck --quiet --enable=warning,style --error-exitcode=1 easy-brightness-helper.c; \
	else \
		echo "cppcheck not found; skipping C lint"; \
	fi
	if command -v shellcheck >/dev/null 2>&1; then \
		shellcheck scripts/*.sh; \
	else \
		echo "shellcheck not found; skipping shell lint"; \
	fi

test: build
	bash -n scripts/*.sh
	./$(BUILD_DIR)/$(HELPER) >/dev/null 2>&1 || true

verify: format-check lint test

changelog-check:
	./scripts/check_versions.sh

package:
	./scripts/build_deb.sh

release-check: verify changelog-check package

clean:
	rm -rf $(BUILD_DIR) $(DIST_DIR)
