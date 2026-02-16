/* SPDX-License-Identifier: GPL-2.0-or-later */

/*
 * easy-brightness-helper - DDC/CI monitor control via libddcutil4
 *
 * The helper performs only single low-level commands.
 * Display state machine and retries are handled by the applet.
 *
 * Commands:
 *   detect                        - JSON array of monitors
 *   get-bus <bus>                 - read brightness for one display
 *   set-bus <bus> <value>         - set brightness for one display
 *   get-contrast-bus <bus>        - read contrast for one display
 *   set-contrast-bus <bus> <val>  - set contrast for one display
 *   get-blue-bus <bus>            - read blue gain for one display
 *   set-blue-bus <bus> <value>    - set blue gain for one display
 */

#define _DEFAULT_SOURCE
#include <ddcutil_c_api.h>
#include <ddcutil_types.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define VCP_BRIGHTNESS 0x10
#define VCP_CONTRAST 0x12
#define VCP_BLUE_GAIN 0x1A

static void init_ddcutil(void) {
  ddca_set_fout(NULL);
  ddca_set_ferr(NULL);
  ddca_enable_verify(true);
  ddca_enable_force_slave_address(true);
  ddca_set_max_tries(DDCA_WRITE_ONLY_TRIES, 10);
  ddca_set_max_tries(DDCA_WRITE_READ_TRIES, 10);
  ddca_set_sleep_multiplier(2.0);
}

static const char *safe_str(const char *value) {
  return value == NULL ? "" : value;
}

static int read_vcp(DDCA_Display_Handle dh, uint8_t code) {
  DDCA_Non_Table_Vcp_Value valrec;
  DDCA_Status rc = ddca_get_non_table_vcp_value(dh, code, &valrec);
  if (rc != 0)
    return -1;
  return (valrec.sh << 8) | valrec.sl;
}

static const DDCA_Display_Info *
find_display_by_bus(const DDCA_Display_Info_List *dlist, int bus) {
  for (int i = 0; i < dlist->ct; i++) {
    const DDCA_Display_Info *di = &dlist->info[i];
    if (di->path.path.i2c_busno == bus)
      return di;
  }
  return NULL;
}

static int cmd_detect(void) {
  DDCA_Display_Info_List *dlist = NULL;
  DDCA_Status rc = ddca_get_display_info_list2(false, &dlist);
  if (rc != 0)
    return 1;

  printf("[");
  for (int i = 0; i < dlist->ct; i++) {
    const DDCA_Display_Info *di = &dlist->info[i];
    if (i > 0)
      printf(",");
    printf("{\"bus\":%d,\"serial\":\"%s\",\"model\":\"%s\",\"dispno\":%d}",
           di->path.path.i2c_busno, safe_str(di->sn), safe_str(di->model_name),
           di->dispno);
  }
  printf("]\n");

  ddca_free_display_info_list(dlist);
  return 0;
}

static int cmd_get_bus(uint8_t vcp_code, const char *field_name, int bus) {
  DDCA_Display_Info_List *dlist = NULL;
  DDCA_Status rc = ddca_get_display_info_list2(false, &dlist);
  if (rc != 0)
    return 1;

  const DDCA_Display_Info *di = find_display_by_bus(dlist, bus);
  if (di == NULL) {
    printf("{\"bus\":%d,\"serial\":\"\",\"ok\":false,\"%s\":-1}\n", bus,
           field_name);
    ddca_free_display_info_list(dlist);
    return 1;
  }

  DDCA_Display_Handle dh = NULL;
  rc = ddca_open_display2(di->dref, true, &dh);
  if (rc != 0) {
    printf("{\"bus\":%d,\"serial\":\"%s\",\"ok\":false,\"%s\":-1}\n", bus,
           safe_str(di->sn), field_name);
    ddca_free_display_info_list(dlist);
    return 1;
  }

  int value = read_vcp(dh, vcp_code);
  int ok = value >= 0;
  printf("{\"bus\":%d,\"serial\":\"%s\",\"ok\":%s,\"%s\":%d}\n", bus,
         safe_str(di->sn), ok ? "true" : "false", field_name, value);

  ddca_close_display(dh);
  ddca_free_display_info_list(dlist);
  return ok ? 0 : 1;
}

static int cmd_set_bus(uint8_t vcp_code, const char *field_name, int bus,
                       int target) {
  DDCA_Display_Info_List *dlist = NULL;
  DDCA_Status rc = ddca_get_display_info_list2(false, &dlist);
  if (rc != 0)
    return 1;

  const DDCA_Display_Info *di = find_display_by_bus(dlist, bus);
  if (di == NULL) {
    printf("{\"bus\":%d,\"serial\":\"\",\"ok\":false,\"%s\":-1}\n", bus,
           field_name);
    ddca_free_display_info_list(dlist);
    return 1;
  }

  DDCA_Display_Handle dh = NULL;
  rc = ddca_open_display2(di->dref, true, &dh);
  if (rc != 0) {
    printf("{\"bus\":%d,\"serial\":\"%s\",\"ok\":false,\"%s\":-1}\n", bus,
           safe_str(di->sn), field_name);
    ddca_free_display_info_list(dlist);
    return 1;
  }

  int before = read_vcp(dh, vcp_code);
  int after = before;
  if (before != target) {
    rc = ddca_set_non_table_vcp_value(dh, vcp_code, 0, (uint8_t)target);
    if (rc == 0)
      after = read_vcp(dh, vcp_code);
    else
      after = -1;
  }

  int ok = (after == target);
  printf("{\"bus\":%d,\"serial\":\"%s\",\"ok\":%s,\"%s\":%d}\n", bus,
         safe_str(di->sn), ok ? "true" : "false", field_name, after);

  ddca_close_display(dh);
  ddca_free_display_info_list(dlist);
  return ok ? 0 : 1;
}

static int parse_value(const char *str) {
  int value = atoi(str);
  if (value < 0 || value > 100)
    return -1;
  return value;
}

static int parse_bus(const char *str) {
  char *end = NULL;
  long bus = strtol(str, &end, 10);
  if (str == end || *end != '\0' || bus < 0 || bus > 65535)
    return -1;
  return (int)bus;
}

int main(int argc, char *argv[]) {
  if (argc < 2) {
    fprintf(stderr, "Usage: easy-brightness-helper "
                    "<detect|get-bus|set-bus|get-contrast-bus|set-contrast-bus|"
                    "get-blue-bus|"
                    "set-blue-bus> [args]\n");
    return 1;
  }

  init_ddcutil();

  if (strcmp(argv[1], "detect") == 0) {
    return cmd_detect();
  }

  if (strcmp(argv[1], "get-bus") == 0) {
    if (argc < 3)
      return 1;
    int bus = parse_bus(argv[2]);
    return bus < 0 ? 1 : cmd_get_bus(VCP_BRIGHTNESS, "brightness", bus);
  }
  if (strcmp(argv[1], "set-bus") == 0) {
    if (argc < 4)
      return 1;
    int bus = parse_bus(argv[2]);
    int v = parse_value(argv[3]);
    return bus < 0 || v < 0 ? 1
                            : cmd_set_bus(VCP_BRIGHTNESS, "brightness", bus, v);
  }

  if (strcmp(argv[1], "get-contrast-bus") == 0) {
    if (argc < 3)
      return 1;
    int bus = parse_bus(argv[2]);
    return bus < 0 ? 1 : cmd_get_bus(VCP_CONTRAST, "contrast", bus);
  }
  if (strcmp(argv[1], "set-contrast-bus") == 0) {
    if (argc < 4)
      return 1;
    int bus = parse_bus(argv[2]);
    int v = parse_value(argv[3]);
    return bus < 0 || v < 0 ? 1 : cmd_set_bus(VCP_CONTRAST, "contrast", bus, v);
  }

  if (strcmp(argv[1], "get-blue-bus") == 0) {
    if (argc < 3)
      return 1;
    int bus = parse_bus(argv[2]);
    return bus < 0 ? 1 : cmd_get_bus(VCP_BLUE_GAIN, "blue", bus);
  }
  if (strcmp(argv[1], "set-blue-bus") == 0) {
    if (argc < 4)
      return 1;
    int bus = parse_bus(argv[2]);
    int v = parse_value(argv[3]);
    return bus < 0 || v < 0 ? 1 : cmd_set_bus(VCP_BLUE_GAIN, "blue", bus, v);
  }

  return 1;
}
