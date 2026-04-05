// SPDX-License-Identifier: GPL-2.0-or-later

const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Mainloop = imports.mainloop;
const Tooltips = imports.ui.tooltips;
const Gettext = imports.gettext;

const DEFAULT_UUID = "easy-brightness@iridiumus";
let UUID = DEFAULT_UUID;

const ICON_DAY = "display-brightness-symbolic";
const ICON_NIGHT = "weather-clear-night-symbolic";
const ICON_CUSTOM = "night-light-symbolic";
const ICON_BUSY = "content-loading-symbolic";
const ICON_VOLUME = "audio-volume-high-symbolic";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;
const PROFILE_FSM_STATE = {
    INIT: "init",
    SET_BRIGHTNESS: "set_brightness",
    SET_CONTRAST: "set_contrast",
    SET_LEGACY: "set_legacy",
    DONE: "done",
    FAILED: "failed"
};
const VOLUME_FSM_STATE = {
    INIT: "init",
    SET_VOLUME: "set_volume",
    SET_MUTE: "set_mute",
    DONE: "done",
    FAILED: "failed"
};
const DISPLAY_KIND = {
    AUDIO: "audio",
    LEGACY: "legacy",
    GENERIC: "generic"
};

function _(str) {
    let translated = Gettext.dgettext(UUID, str);
    if (translated !== str) {
        return translated;
    }
    return Gettext.gettext(str);
}

class ControlSlider extends PopupMenu.PopupSliderMenuItem {
    constructor(iconName, labelText, onChanged) {
        super(0);
        this._labelText = labelText;
        this._onChanged = onChanged;

        this.tooltip = new Tooltips.Tooltip(this.actor, _("%s: ?%%").format(labelText));

        let icon = new St.Icon({
            icon_name: iconName,
            icon_type: St.IconType.SYMBOLIC,
            icon_size: 16
        });

        this.removeActor(this._slider);
        this.addActor(icon, { span: 0 });
        this.addActor(this._slider, { span: -1, expand: true });

        this.connect("value-changed", () => {
            let pct = Math.round(this._value * 100);
            this.tooltip.set_text(_("%s: %d%%").format(this._labelText, pct));
            if (this._dragging)
                this.tooltip.show();
        });
        this.connect("drag-end", () => {
            this._onChanged(Math.round(this._value * 100));
        });
    }
}


class EasyBrightnessApplet extends Applet.IconApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this._metadata = metadata;
        if (metadata && metadata.uuid) {
            UUID = metadata.uuid;
        }
        this._bindTranslations();

        this._helperPath = metadata.path + "/easy-brightness-helper";
        this._busy = false;
        this._operationToken = 0;
        this._activeOperation = null;
        this._profilePending = false;
        this._volumePending = false;

        // Settings
        this.settings = new Settings.AppletSettings(this, UUID, instanceId);
        this.settings.bind("day-brightness", "dayBrightness");
        this.settings.bind("day-contrast", "dayContrast");
        this.settings.bind("legacy-day-compat", "legacyDayCompat");
        this.settings.bind("night-brightness", "nightBrightness");
        this.settings.bind("night-contrast", "nightContrast");
        this.settings.bind("legacy-night-compat", "legacyNightCompat");
        this.settings.bind("current-mode", "currentMode");
        this.settings.bind("custom-brightness", "customBrightness");
        this.settings.bind("custom-contrast", "customContrast");
        this.settings.bind("legacy-custom-compat", "legacyCustomCompat");
        this.settings.bind("volume-level", "volumeLevel");
        this.settings.bind("mode-debounce", "modeDebounce");

        // Custom mode sliders in context menu
        this._brightnessSlider = new ControlSlider(
            "display-brightness-symbolic", _("Brightness"),
            (pct) => this._onCustomSliderChanged("brightness", pct)
        );
        this._contrastSlider = new ControlSlider(
            "preferences-desktop-display-symbolic", _("Contrast"),
            (pct) => this._onCustomSliderChanged("contrast", pct)
        );
        this._volumeSlider = new ControlSlider(
            ICON_VOLUME, _("Volume"),
            (pct) => this._onCustomSliderChanged("volume", pct)
        );

        let savedBrightness = this.customBrightness;
        if (savedBrightness === undefined || savedBrightness === null) savedBrightness = 50;
        this._brightnessSlider.setValue(savedBrightness / 100.0);

        let savedContrast = this.customContrast;
        if (savedContrast === undefined || savedContrast === null) savedContrast = 50;
        this._contrastSlider.setValue(savedContrast / 100.0);

        let savedVolume = this.volumeLevel;
        if (savedVolume === undefined || savedVolume === null) savedVolume = 50;
        this._volumeSlider.setValue(savedVolume / 100.0);

        this._applet_context_menu.addMenuItem(this._brightnessSlider, 0);
        this._applet_context_menu.addMenuItem(this._contrastSlider, 1);
        this._applet_context_menu.addMenuItem(this._volumeSlider, 2);
        this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), 3);

        // Apply saved mode on startup
        this._updateIcon();
        this._updateTooltip();
        this._scheduleProfileApply();
        this._scheduleVolumeApply();
    }

    _bindTranslations() {
        let userLocaleDir = GLib.build_filenamev([GLib.get_home_dir(), ".local", "share", "locale"]);
        let localeDir = userLocaleDir;

        if ((this._metadata && this._metadata.path &&
             this._metadata.path.indexOf("/usr/share/cinnamon/applets/") === 0) ||
            !GLib.file_test(userLocaleDir, GLib.FileTest.IS_DIR)) {
            localeDir = "/usr/share/locale";
        }

        Gettext.bindtextdomain(UUID, localeDir);
    }

    on_applet_clicked() {
        if (this.currentMode === "day") {
            this.currentMode = "night";
        } else {
            this.currentMode = "day";
        }
        this._updateIcon();
        this._updateTooltip();

        this._queueProfileApply(true);
    }

    on_applet_removed_from_panel() {
        this._operationToken += 1;
        if (this._modeTimeoutId) {
            Mainloop.source_remove(this._modeTimeoutId);
            this._modeTimeoutId = 0;
        }
        if (this._volumeTimeoutId) {
            Mainloop.source_remove(this._volumeTimeoutId);
            this._volumeTimeoutId = 0;
        }
        if (this._retryTimeoutId) {
            Mainloop.source_remove(this._retryTimeoutId);
            this._retryTimeoutId = 0;
        }
        this._activeOperation = null;
        this._profilePending = false;
        this._volumePending = false;
        this._busy = false;
    }

    _onCustomSliderChanged(which, pct) {
        if (which === "brightness") {
            this.customBrightness = pct;
        } else if (which === "contrast") {
            this.customContrast = pct;
            this.currentMode = "custom";
            this._updateTooltip();
            this._queueProfileApply();
            return;
        } else if (which === "volume") {
            this.volumeLevel = pct;
            this._updateTooltip();
            this._queueVolumeApply();
            return;
        } else {
            this.legacyCustomCompat = pct;
        }
        this.currentMode = "custom";
        this._updateTooltip();
        this._queueProfileApply();
    }

    _getModeValues() {
        if (this.currentMode === "night") {
            return [this.nightBrightness, this.nightContrast, this.volumeLevel];
        } else if (this.currentMode === "custom") {
            return [this.customBrightness, this.customContrast, this.volumeLevel];
        }
        return [this.dayBrightness, this.dayContrast, this.volumeLevel];
    }

    _scheduleProfileApply() {
        this._queueProfileApply(false);
    }

    _scheduleVolumeApply() {
        this._queueVolumeApply();
    }

    _queueProfileApply(immediate = false) {
        this._profilePending = true;
        if (immediate) {
            if (this._modeTimeoutId) {
                Mainloop.source_remove(this._modeTimeoutId);
                this._modeTimeoutId = 0;
            }
            this._modeTimeoutId = Mainloop.timeout_add(this.modeDebounce || 750, () => {
                this._modeTimeoutId = 0;
                this._pumpOperationQueue();
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        this._pumpOperationQueue();
    }

    _queueVolumeApply() {
        this._volumePending = true;
        this._pumpOperationQueue();
    }

    _pumpOperationQueue() {
        if (this._activeOperation) return;

        if (this._profilePending) {
            this._profilePending = false;
            this._startOperation("profile");
            return;
        }

        if (this._volumePending) {
            this._volumePending = false;
            this._startOperation("volume");
        }
    }

    _startOperation(kind) {
        let token = ++this._operationToken;
        this._activeOperation = { kind, token };
        this._busy = true;
        this.set_applet_icon_symbolic_name(ICON_BUSY);
        this.set_applet_tooltip(_("Applying settings..."));

        if (this._retryTimeoutId) {
            Mainloop.source_remove(this._retryTimeoutId);
            this._retryTimeoutId = 0;
        }

        if (kind === "profile") {
            this._startProfileOperation(token);
        } else {
            this._startVolumeOperation(token);
        }
    }

    _finishOperation(kind, token, ok) {
        if (!this._activeOperation || this._activeOperation.token !== token || this._activeOperation.kind !== kind) {
            return;
        }
        if (!ok) {
            global.logError("easy-brightness: operation failed: " + kind);
        }
        this._activeOperation = null;
        this._busy = false;
        this._updateIcon();
        this._updateTooltip();
        this._pumpOperationQueue();
    }

    _displayKind(display) {
        if (display && display.kind) {
            return String(display.kind);
        }
        if (display && display.supports_volume) {
            return DISPLAY_KIND.AUDIO;
        }
        if (display && display.supports_legacy) {
            return DISPLAY_KIND.LEGACY;
        }
        return DISPLAY_KIND.GENERIC;
    }

    _buildProfileStages(display) {
        let kind = this._displayKind(display);
        let brightness = this._getModeBrightness();

        if (kind === DISPLAY_KIND.AUDIO) {
            return [
                {
                    state: PROFILE_FSM_STATE.SET_BRIGHTNESS,
                    command: "set-bus",
                    field: "brightness",
                    target: brightness
                },
                {
                    state: PROFILE_FSM_STATE.SET_CONTRAST,
                    command: "set-contrast-bus",
                    field: "contrast",
                    target: this._getModeContrast()
                }
            ];
        }

        if (display && display.supports_contrast && !display.supports_legacy) {
            return [
                {
                    state: PROFILE_FSM_STATE.SET_BRIGHTNESS,
                    command: "set-bus",
                    field: "brightness",
                    target: brightness
                },
                {
                    state: PROFILE_FSM_STATE.SET_CONTRAST,
                    command: "set-contrast-bus",
                    field: "contrast",
                    target: this._getModeContrast()
                }
            ];
        }

        return [
            {
                state: PROFILE_FSM_STATE.SET_BRIGHTNESS,
                command: "set-bus",
                field: "brightness",
                target: brightness
            },
            {
                state: PROFILE_FSM_STATE.SET_LEGACY,
                command: "set-legacy-bus",
                field: "legacy",
                target: this._getLegacyCompat()
            }
        ];
    }

    _buildVolumeStages(display, target) {
        let supportsMute = !display || display.supports_mute !== false;
        if (target <= 0) {
            let stages = [
                {
                    state: VOLUME_FSM_STATE.SET_VOLUME,
                    command: "set-volume-bus",
                    field: "volume",
                    target: 0
                }
            ];
            if (supportsMute) {
                stages.push({
                    state: VOLUME_FSM_STATE.SET_MUTE,
                    command: "set-mute-bus",
                    field: "mute",
                    target: 1
                });
            }
            return stages;
        }

        let stages = [
            {
                state: VOLUME_FSM_STATE.SET_VOLUME,
                command: "set-volume-bus",
                field: "volume",
                target: target
            }
        ];
        if (supportsMute) {
            stages.push({
                state: VOLUME_FSM_STATE.SET_MUTE,
                command: "set-mute-bus",
                field: "mute",
                target: 0
            });
        }
        return stages;
    }

    _getModeBrightness() {
        if (this.currentMode === "night") {
            return this.nightBrightness;
        } else if (this.currentMode === "custom") {
            return this.customBrightness;
        }
        return this.dayBrightness;
    }

    _getModeContrast() {
        if (this.currentMode === "night") {
            return this.nightContrast;
        } else if (this.currentMode === "custom") {
            return this.customContrast;
        }
        return this.dayContrast;
    }

    _getLegacyCompat() {
        if (this.currentMode === "night") {
            return this.legacyNightCompat;
        } else if (this.currentMode === "custom") {
            return this.legacyCustomCompat;
        }
        return this.legacyDayCompat;
    }

    _startProfileOperation(token) {
        this._runHelperJson(["detect"], (displays) => {
            if (!this._isCurrentOperation("profile", token)) return;
            if (!Array.isArray(displays) || displays.length === 0) {
                this._finishOperation("profile", token, true);
                return;
            }

            let index = 0;
            let allOk = true;
            let runNext = () => {
                if (!this._isCurrentOperation("profile", token)) return;
                if (index >= displays.length) {
                    this._finishOperation("profile", token, allOk);
                    return;
                }

                let display = displays[index];
                this._runDisplayStages(token, display, this._buildProfileStages(display), (ok) => {
                    if (!this._isCurrentOperation("profile", token)) return;
                    if (!ok) {
                        allOk = false;
                        global.logError("easy-brightness: profile apply failed: " + JSON.stringify(display));
                    }
                    index += 1;
                    runNext();
                });
            };
            runNext();
        });
    }

    _startVolumeOperation(token) {
        this._runHelperJson(["detect"], (displays) => {
            if (!this._isCurrentOperation("volume", token)) return;
            if (!Array.isArray(displays) || displays.length === 0) {
                this._finishOperation("volume", token, true);
                return;
            }

            let target = this.volumeLevel || 0;
            let audioDisplays = displays.filter((display) => this._displayKind(display) === DISPLAY_KIND.AUDIO);
            if (audioDisplays.length === 0) {
                this._finishOperation("volume", token, true);
                return;
            }

            let index = 0;
            let allOk = true;

            let runNext = () => {
                if (!this._isCurrentOperation("volume", token)) return;
                if (index >= audioDisplays.length) {
                    this._finishOperation("volume", token, allOk);
                    return;
                }

                let display = audioDisplays[index];
                this._runDisplayStages(token, display, this._buildVolumeStages(display, target), (ok) => {
                    if (!this._isCurrentOperation("volume", token)) return;
                    if (!ok) {
                        allOk = false;
                        global.logError("easy-brightness: volume apply failed: " + JSON.stringify(display));
                    }
                    index += 1;
                    runNext();
                });
            };
            runNext();
        });
    }

    _runDisplayStages(token, display, stages, onDone) {
        let bus = Number(display.bus);
        let serial = display && display.serial ? String(display.serial) : "";

        let runStageIndex = 0;
        let runStage = () => {
            if (!this._isOperationTokenActive(token)) return;

            if (runStageIndex >= stages.length) {
                onDone(true);
                return;
            }

            let stage = stages[runStageIndex];
            this._runStageWithRetry(token, bus, serial, stage, (ok) => {
                if (!this._isOperationTokenActive(token)) return;
                if (!ok) {
                    onDone(false);
                    return;
                }
                runStageIndex += 1;
                runStage();
            });
        };

        runStage();
    }

    _runStageWithRetry(token, bus, serial, stage, onDone) {
        let attempt = 0;
        let tryOnce = () => {
            if (!this._isOperationTokenActive(token)) return;
            attempt += 1;

            this._runHelperJson([stage.command, String(bus), String(stage.target)], (payload) => {
                if (!this._isOperationTokenActive(token)) return;

                let ok = payload && payload.ok === true;
                let value = ok && payload[stage.field] !== undefined ? Number(payload[stage.field]) : -1;
                if (ok && !isNaN(value) && value !== stage.target) {
                    ok = false;
                }

                if (ok) {
                    onDone(true);
                    return;
                }

                if (attempt < MAX_RETRIES) {
                    this._retryTimeoutId = Mainloop.timeout_add(RETRY_DELAY_MS, () => {
                        this._retryTimeoutId = 0;
                        tryOnce();
                        return GLib.SOURCE_REMOVE;
                    });
                    return;
                }

                global.logError("easy-brightness: stage failed on bus " + bus + " serial " + serial + " command " + stage.command);
                onDone(false);
            });
        };

        tryOnce();
    }

    _runHelperJson(args, callback) {
        this._runHelper(args, (output) => {
            if (!output) {
                callback(null);
                return;
            }
            try {
                callback(JSON.parse(output));
            } catch (e) {
                global.logError("easy-brightness: invalid helper JSON: " + e.message);
                callback(null);
            }
        });
    }

    _isOperationTokenActive(token) {
        return this._activeOperation && this._activeOperation.token === token;
    }

    _isCurrentOperation(kind, token) {
        return this._isOperationTokenActive(token) && this._activeOperation.kind === kind;
    }

    _updateIcon() {
        if (this.currentMode === "night") {
            this.set_applet_icon_symbolic_name(ICON_NIGHT);
        } else if (this.currentMode === "custom") {
            this.set_applet_icon_symbolic_name(ICON_CUSTOM);
        } else {
            this.set_applet_icon_symbolic_name(ICON_DAY);
        }
    }

    _updateTooltip() {
        let [brightness, contrast, volume] = this._getModeValues();
        let mode = this.currentMode || "day";
        let modeLabel = _("Day");
        if (mode === "night") {
            modeLabel = _("Night");
        } else if (mode === "custom") {
            modeLabel = _("Custom");
        }

        this.set_applet_tooltip(
            _("%s | Brightness: %d%% | Contrast: %d%% | Volume: %d%%")
                .format(modeLabel, brightness, contrast, volume)
        );
    }

    _runHelper(args, callback) {
        try {
            let argv = [this._helperPath].concat(args);
            let [, pid, stdinFd, stdoutFd, stderrFd] = GLib.spawn_async_with_pipes(
                null, argv, null,
                GLib.SpawnFlags.DO_NOT_REAP_CHILD | GLib.SpawnFlags.SEARCH_PATH,
                null
            );

            let stdoutStream = new Gio.DataInputStream({
                base_stream: new Gio.UnixInputStream({ fd: stdoutFd, close_fd: true })
            });

            let stderrStream = new Gio.UnixInputStream({ fd: stderrFd, close_fd: true });
            stderrStream.close(null);

            let stdinStream = new Gio.UnixOutputStream({ fd: stdinFd, close_fd: true });
            stdinStream.close(null);

            GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (pid, status) => {
                let output = "";
                try {
                    let [line] = stdoutStream.read_line_utf8(null);
                    if (line) output = line;
                    stdoutStream.close(null);
                } catch (e) {}
                GLib.spawn_close_pid(pid);
                if (callback) callback(output, status);
            });
        } catch (e) {
            global.logError("easy-brightness: helper spawn error: " + e.message);
            if (callback) callback("", -1);
        }
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new EasyBrightnessApplet(metadata, orientation, panelHeight, instanceId);
}
