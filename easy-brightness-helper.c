/* SPDX-License-Identifier: GPL-2.0-or-later */

/*
 * easy-brightness-helper - DDC/CI monitor control via libddcutil4
 *
 * Simple executor: one attempt per monitor, no retries.
 * Retries are managed by the applet.
 *
 * Commands:
 *   detect              - JSON array of monitors
 *   get                 - read brightness (VCP 0x10)
 *   set <value>         - set brightness (VCP 0x10)
 *   get-blue            - read blue gain (VCP 0x1A)
 *   set-blue <value>    - set blue gain (VCP 0x1A)
 */

#define _DEFAULT_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <ddcutil_c_api.h>
#include <ddcutil_types.h>

#define VCP_BRIGHTNESS 0x10
#define VCP_BLUE_GAIN  0x1A

static void init_ddcutil(void) {
    ddca_set_fout(NULL);
    ddca_set_ferr(NULL);
    ddca_enable_verify(true);
    ddca_enable_force_slave_address(true);
    ddca_set_max_tries(DDCA_WRITE_ONLY_TRIES, 10);
    ddca_set_max_tries(DDCA_WRITE_READ_TRIES, 10);
    ddca_set_sleep_multiplier(2.0);
}

static int read_vcp(DDCA_Display_Handle dh, uint8_t code) {
    DDCA_Non_Table_Vcp_Value valrec;
    DDCA_Status rc = ddca_get_non_table_vcp_value(dh, code, &valrec);
    if (rc != 0) return -1;
    return (valrec.sh << 8) | valrec.sl;
}

static int cmd_detect(void) {
    DDCA_Display_Info_List *dlist = NULL;
    DDCA_Status rc = ddca_get_display_info_list2(false, &dlist);
    if (rc != 0) return 1;

    printf("[");
    for (int i = 0; i < dlist->ct; i++) {
        DDCA_Display_Info *di = &dlist->info[i];
        if (i > 0) printf(",");
        printf("{\"bus\":%d,\"serial\":\"%s\",\"model\":\"%s\",\"dispno\":%d}",
               di->path.path.i2c_busno, di->sn, di->model_name, di->dispno);
    }
    printf("]\n");

    ddca_free_display_info_list(dlist);
    return 0;
}

static int cmd_get(uint8_t vcp_code, const char *field_name) {
    DDCA_Display_Info_List *dlist = NULL;
    DDCA_Status rc = ddca_get_display_info_list2(false, &dlist);
    if (rc != 0) return 1;

    printf("[");
    for (int i = 0; i < dlist->ct; i++) {
        DDCA_Display_Info *di = &dlist->info[i];
        DDCA_Display_Handle dh = NULL;
        rc = ddca_open_display2(di->dref, true, &dh);
        int value = -1;
        if (rc == 0) {
            value = read_vcp(dh, vcp_code);
            ddca_close_display(dh);
        }
        if (i > 0) printf(",");
        printf("{\"bus\":%d,\"serial\":\"%s\",\"%s\":%d}",
               di->path.path.i2c_busno, di->sn, field_name, value);
    }
    printf("]\n");

    ddca_free_display_info_list(dlist);
    return 0;
}

static int cmd_set(uint8_t vcp_code, const char *field_name, int target) {
    DDCA_Display_Info_List *dlist = NULL;
    DDCA_Status rc = ddca_get_display_info_list2(false, &dlist);
    if (rc != 0) return 1;

    int all_ok = 1;
    printf("[");
    for (int i = 0; i < dlist->ct; i++) {
        DDCA_Display_Info *di = &dlist->info[i];
        int bus = di->path.path.i2c_busno;
        const char *serial = di->sn;

        if (i > 0) printf(",");

        DDCA_Display_Handle dh = NULL;
        rc = ddca_open_display2(di->dref, true, &dh);
        if (rc != 0) {
            printf("{\"bus\":%d,\"serial\":\"%s\",\"ok\":false,\"%s\":-1}",
                   bus, serial, field_name);
            all_ok = 0;
            continue;
        }

        int before = read_vcp(dh, vcp_code);
        if (before == target) {
            printf("{\"bus\":%d,\"serial\":\"%s\",\"ok\":true,\"%s\":%d}",
                   bus, serial, field_name, target);
            ddca_close_display(dh);
            continue;
        }

        rc = ddca_set_non_table_vcp_value(dh, vcp_code, 0, (uint8_t)target);
        int after = read_vcp(dh, vcp_code);
        int ok = (after == target);
        if (!ok) all_ok = 0;

        printf("{\"bus\":%d,\"serial\":\"%s\",\"ok\":%s,\"%s\":%d}",
               bus, serial, ok ? "true" : "false", field_name, after);

        ddca_close_display(dh);
    }
    printf("]\n");

    ddca_free_display_info_list(dlist);
    return all_ok ? 0 : 1;
}

static int parse_value(const char *str) {
    int value = atoi(str);
    if (value < 0 || value > 100) return -1;
    return value;
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: easy-brightness-helper <detect|get|set|get-blue|set-blue> [value]\n");
        return 1;
    }

    init_ddcutil();

    if (strcmp(argv[1], "detect") == 0) {
        return cmd_detect();
    } else if (strcmp(argv[1], "get") == 0) {
        return cmd_get(VCP_BRIGHTNESS, "brightness");
    } else if (strcmp(argv[1], "set") == 0) {
        if (argc < 3) return 1;
        int v = parse_value(argv[2]);
        return v < 0 ? 1 : cmd_set(VCP_BRIGHTNESS, "brightness", v);
    } else if (strcmp(argv[1], "get-blue") == 0) {
        return cmd_get(VCP_BLUE_GAIN, "blue");
    } else if (strcmp(argv[1], "set-blue") == 0) {
        if (argc < 3) return 1;
        int v = parse_value(argv[2]);
        return v < 0 ? 1 : cmd_set(VCP_BLUE_GAIN, "blue", v);
    }
    return 1;
}
