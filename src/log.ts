import { log as laraLog } from "@concord-consortium/lara-interactive-api";
import { createLogWrapper } from "@concord-consortium/log-monitor";
import { getUrlConfig } from "./config";

const { logMonitor } = getUrlConfig();

export const log = logMonitor
  ? createLogWrapper(laraLog)
  : laraLog;
