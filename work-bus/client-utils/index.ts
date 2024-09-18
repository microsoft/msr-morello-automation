#!/usr/bin/env node

import * as fs from 'fs'
import yargs from "yargs"
import { Octokit, App } from "octokit"

import * as lib from "@msr-morello-work-bus/lib"

(async () => {
  const vp = lib.YargsUtils.multiconfig(yargs)
    .scriptName("msr-morello-wbclient")
    // .config("config", "JSON configuration file")
    .commandDir("cmds")
    .demandCommand(1)
    .help()

  const v = await vp.parseAsync(process.argv.slice(2))

  // if (v.thunk) { await (<async () => ()>(v.thunk))() }
})()
