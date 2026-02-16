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

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;
const DISPLAY_FSM_STATE = {
    INIT: "init",
    SET_BRIGHTNESS: "set_brightness",
    SET_CONTRAST: "set_contrast",
    SET_BLUE: "set_blue",
    DONE: "done",
    FAILED: "failed"
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
        this._applyRunId = 0;

        // Settings
        this.settings = new Settings.AppletSettings(this, UUID, instanceId);
        this.settings.bind("day-brightness", "dayBrightness");
        this.settings.bind("day-contrast", "dayContrast");
        this.settings.bind("day-blue", "dayBlue");
        this.settings.bind("night-brightness", "nightBrightness");
        this.settings.bind("night-contrast", "nightContrast");
        this.settings.bind("night-blue", "nightBlue");
        this.settings.bind("current-mode", "currentMode");
        this.settings.bind("custom-brightness", "customBrightness");
        this.settings.bind("custom-contrast", "customContrast");
        this.settings.bind("custom-blue", "customBlue");
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
        this._blueSlider = new ControlSlider(
            "color-select-symbolic", _("Blue"),
            (pct) => this._onCustomSliderChanged("blue", pct)
        );

        let savedBrightness = this.customBrightness;
        if (savedBrightness === undefined || savedBrightness === null) savedBrightness = 50;
        this._brightnessSlider.setValue(savedBrightness / 100.0);

        let savedContrast = this.customContrast;
        if (savedContrast === undefined || savedContrast === null) savedContrast = 50;
        this._contrastSlider.setValue(savedContrast / 100.0);

        let savedBlue = this.customBlue;
        if (savedBlue === undefined || savedBlue === null) savedBlue = 50;
        this._blueSlider.setValue(savedBlue / 100.0);

        this._applet_context_menu.addMenuItem(this._brightnessSlider, 0);
        this._applet_context_menu.addMenuItem(this._contrastSlider, 1);
        this._applet_context_menu.addMenuItem(this._blueSlider, 2);
        this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), 3);

        // Apply saved mode on startup
        this._updateIcon();
        this._updateTooltip();
        this._applyMode();
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
        if (this._busy) return;

        if (this.currentMode === "day") {
            this.currentMode = "night";
        } else {
            this.currentMode = "day";
        }
        this._updateIcon();
        this._updateTooltip();

        if (this._modeTimeoutId) {
            Mainloop.source_remove(this._modeTimeoutId);
            this._modeTimeoutId = 0;
        }
        let delay = this.modeDebounce || 750;
        this._modeTimeoutId = Mainloop.timeout_add(delay, () => {
            this._modeTimeoutId = 0;
            this._applyMode();
            return GLib.SOURCE_REMOVE;
        });
    }

    on_applet_removed_from_panel() {
        this._applyRunId += 1;
        if (this._modeTimeoutId) {
            Mainloop.source_remove(this._modeTimeoutId);
            this._modeTimeoutId = 0;
        }
        if (this._retryTimeoutId) {
            Mainloop.source_remove(this._retryTimeoutId);
            this._retryTimeoutId = 0;
        }
        this._busy = false;
    }

    _onCustomSliderChanged(which, pct) {
        if (this._busy) return;

        if (which === "brightness") {
            this.customBrightness = pct;
        } else if (which === "contrast") {
            this.customContrast = pct;
        } else {
            this.customBlue = pct;
        }
        this.currentMode = "custom";
        this._updateTooltip();
        this._applyMode();
    }

    _getModeValues() {
        if (this.currentMode === "night") {
            return [this.nightBrightness, this.nightContrast, this.nightBlue];
        } else if (this.currentMode === "custom") {
            return [this.customBrightness, this.customContrast, this.customBlue];
        }
        return [this.dayBrightness, this.dayContrast, this.dayBlue];
    }

    _applyMode() {
        if (this._busy) return;

        let [brightness, contrast, blue] = this._getModeValues();
        let targets = { brightness, contrast, blue };
        let runId = ++this._applyRunId;

        this._busy = true;
        this.set_applet_icon_symbolic_name(ICON_BUSY);
        this.set_applet_tooltip(_("Applying settings..."));

        if (this._retryTimeoutId) {
            Mainloop.source_remove(this._retryTimeoutId);
            this._retryTimeoutId = 0;
        }

        this._applyTargetsWithStateMachine(runId, targets, (allOk) => {
            if (runId !== this._applyRunId) return;
            if (!allOk) {
                global.logError("easy-brightness: apply state machine finished with failures");
            }
            this._busy = false;
            this._updateIcon();
            this._updateTooltip();
        });
    }

    _applyTargetsWithStateMachine(runId, targets, onDone) {
        this._runHelperJson(["detect"], (displays) => {
            if (runId !== this._applyRunId) return;

            if (!Array.isArray(displays)) {
                onDone(false);
                return;
            }

            if (displays.length === 0) {
                onDone(true);
                return;
            }

            let index = 0;
            let allOk = true;

            let runNext = () => {
                if (runId !== this._applyRunId) return;
                if (index >= displays.length) {
                    onDone(allOk);
                    return;
                }

                this._runDisplayStateMachine(runId, displays[index], targets, (result) => {
                    if (runId !== this._applyRunId) return;
                    if (!result.ok) {
                        allOk = false;
                        global.logError("easy-brightness: display apply failed: " + JSON.stringify(result));
                    }
                    index += 1;
                    runNext();
                });
            };

            runNext();
        });
    }

    _runDisplayStateMachine(runId, display, targets, onDone) {
        let bus = Number(display.bus);
        let serial = display && display.serial ? String(display.serial) : "";
        let result = {
            bus,
            serial,
            ok: false,
            state: DISPLAY_FSM_STATE.INIT,
            failed_step: "",
            state_trace: "",
            brightness: this._makeActionResult(targets.brightness),
            contrast: this._makeActionResult(targets.contrast),
            blue: this._makeActionResult(targets.blue)
        };

        this._appendStateTrace(result, DISPLAY_FSM_STATE.INIT);

        let stages = [
            {
                state: DISPLAY_FSM_STATE.SET_BRIGHTNESS,
                command: "set-bus",
                field: "brightness",
                target: targets.brightness
            },
            {
                state: DISPLAY_FSM_STATE.SET_CONTRAST,
                command: "set-contrast-bus",
                field: "contrast",
                target: targets.contrast
            },
            {
                state: DISPLAY_FSM_STATE.SET_BLUE,
                command: "set-blue-bus",
                field: "blue",
                target: targets.blue
            }
        ];

        let stageIndex = 0;
        let runStage = () => {
            if (runId !== this._applyRunId) return;

            if (stageIndex >= stages.length) {
                result.state = DISPLAY_FSM_STATE.DONE;
                result.ok = true;
                this._appendStateTrace(result, DISPLAY_FSM_STATE.DONE);
                onDone(result);
                return;
            }

            let stage = stages[stageIndex];
            result.state = stage.state;
            this._appendStateTrace(result, stage.state);

            this._runStageWithRetry(
                runId, bus, stage.command, stage.field, stage.target, result[stage.field],
                (ok) => {
                    if (runId !== this._applyRunId) return;
                    if (!ok) {
                        result.state = DISPLAY_FSM_STATE.FAILED;
                        result.failed_step = stage.field;
                        this._appendStateTrace(result, DISPLAY_FSM_STATE.FAILED);
                        onDone(result);
                        return;
                    }
                    stageIndex += 1;
                    runStage();
                }
            );
        };

        runStage();
    }

    _makeActionResult(target) {
        return {
            target,
            value: -1,
            attempts: 0,
            ok: false
        };
    }

    _appendStateTrace(result, state) {
        if (result.state_trace.length > 0) {
            result.state_trace += ">";
        }
        result.state_trace += state;
    }

    _runStageWithRetry(runId, bus, command, field, target, actionResult, onDone) {
        let attempt = 0;

        let tryOnce = () => {
            if (runId !== this._applyRunId) return;
            attempt += 1;
            actionResult.attempts = attempt;

            this._runHelperJson([command, String(bus), String(target)], (payload) => {
                if (runId !== this._applyRunId) return;

                if (payload && payload[field] !== undefined && payload[field] !== null) {
                    let value = Number(payload[field]);
                    if (!isNaN(value)) {
                        actionResult.value = value;
                    }
                }

                actionResult.ok = payload && payload.ok === true && actionResult.value === target;
                if (actionResult.ok) {
                    onDone(true);
                    return;
                }

                if (attempt < MAX_RETRIES) {
                    this._retryTimeoutId = Mainloop.timeout_add(RETRY_DELAY_MS, () => {
                        this._retryTimeoutId = 0;
                        tryOnce();
                        return GLib.SOURCE_REMOVE;
                    });
                } else {
                    onDone(false);
                }
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
        let [brightness, contrast, blue] = this._getModeValues();
        let mode = this.currentMode || "day";
        let modeLabel = _("Day");
        if (mode === "night") {
            modeLabel = _("Night");
        } else if (mode === "custom") {
            modeLabel = _("Custom");
        }

        this.set_applet_tooltip(
            _("%s | Brightness: %d%% | Contrast: %d%% | Blue: %d%%")
                .format(modeLabel, brightness, contrast, blue)
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
