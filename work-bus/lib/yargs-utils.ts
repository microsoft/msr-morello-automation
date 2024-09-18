import type { Argv, Arguments } from "yargs"

export function multiconfig(yargs: Argv) {
  return yargs
  .config("config", "Configuration JSON file name")
  .config("config2", "Configuration JSON file name")
}
