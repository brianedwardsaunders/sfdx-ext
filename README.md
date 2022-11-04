
sfdx-ext
==========

sfdx extensions

[![Version](https://img.shields.io/npm/v/sfdx-ext.svg)](https://npmjs.org/package/sfdx-ext)
[![CircleCI](https://circleci.com/gh/brian.edward.saunders/sfdx-ext/tree/master.svg?style=shield)](https://circleci.com/gh/brian.edward.saunders/sfdx-ext/tree/master)
[![Appveyor CI](https://ci.appveyor.com/api/projects/status/github/brian.edward.saunders/sfdx-ext?branch=master&svg=true)](https://ci.appveyor.com/project/heroku/sfdx-ext/branch/master)
[![Greenkeeper](https://badges.greenkeeper.io/brian.edward.saunders/sfdx-ext.svg)](https://greenkeeper.io/)
[![Known Vulnerabilities](https://snyk.io/test/github/brian.edward.saunders/sfdx-ext/badge.svg)](https://snyk.io/test/github/brian.edward.saunders/sfdx-ext)
[![Downloads/week](https://img.shields.io/npm/dw/sfdx-ext.svg)](https://npmjs.org/package/sfdx-ext)
[![License](https://img.shields.io/npm/l/sfdx-ext.svg)](https://github.com/brian.edward.saunders/sfdx-ext/blob/master/package.json)

<!-- toc -->
* [Debugging your plugin](#debugging-your-plugin)
<!-- tocstop -->
<!-- install -->
<!-- usage -->
```sh-session
$ npm install -g sfdx-ext
$ sfdx COMMAND
running command...
$ sfdx (--version)
sfdx-ext/0.0.1 win32-x64 node-v16.13.0
$ sfdx --help [COMMAND]
USAGE
  $ sfdx COMMAND
...
```
<!-- usagestop -->
<!-- commands -->
* [`sfdx hello:org [-n <string>] [-f] [-v <string>] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]`](#sfdx-helloorg--n-string--f--v-string--u-string---apiversion-string---json---loglevel-tracedebuginfowarnerrorfataltracedebuginfowarnerrorfatal)
* [`sfdx mdapi:changeset [-s <string>] [-x] [-r <string>] [-t <string>] [-c] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]`](#sfdx-mdapichangeset--s-string--x--r-string--t-string--c--u-string---apiversion-string---json---loglevel-tracedebuginfowarnerrorfataltracedebuginfowarnerrorfatal)
* [`sfdx mdapi:retrieve [-b] [-i] [-n] [-d] [-f] [-s] [-x] [-z] [-t] [-c] [-r <array>] [-w <array>] [-y <array>] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]`](#sfdx-mdapiretrieve--b--i--n--d--f--s--x--z--t--c--r-array--w-array--y-array--u-string---apiversion-string---json---loglevel-tracedebuginfowarnerrorfataltracedebuginfowarnerrorfatal)
* [`sfdx package:sync [-s <string>] [-c] [-e] [-i] [-x] [-z] [-v] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]`](#sfdx-packagesync--s-string--c--e--i--x--z--v--u-string---apiversion-string---json---loglevel-tracedebuginfowarnerrorfataltracedebuginfowarnerrorfatal)

## `sfdx hello:org [-n <string>] [-f] [-v <string>] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]`

print a greeting and your org IDs

```
USAGE
  $ sfdx hello:org [-n <string>] [-f] [-v <string>] [-u <string>] [--apiversion <string>] [--json] [--loglevel
    trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

FLAGS
  -f, --force                                                                       example boolean flag
  -n, --name=<value>                                                                name to print
  -u, --targetusername=<value>                                                      username or alias for the target
                                                                                    org; overrides default target org
  -v, --targetdevhubusername=<value>                                                username or alias for the dev hub
                                                                                    org; overrides default dev hub org
  --apiversion=<value>                                                              override the api version used for
                                                                                    api requests made by this command
  --json                                                                            format output as json
  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for
                                                                                    this command invocation

DESCRIPTION
  print a greeting and your org IDs

EXAMPLES
  $ sfdx hello:org --targetusername myOrg@example.com --targetdevhubusername devhub@org.com

  $ sfdx hello:org --name myname --targetusername myOrg@example.com
```

_See code: [src/commands/hello/org.ts](https://github.com/brian.edward.saunders/sfdx-ext/blob/v0.0.1/src/commands/hello/org.ts)_

## `sfdx mdapi:changeset [-s <string>] [-x] [-r <string>] [-t <string>] [-c] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]`

Generates a detailed changeset by comparing differences between two mdapi staged source directory files or source control commit versions.

```
USAGE
  $ sfdx mdapi:changeset [-s <string>] [-x] [-r <string>] [-t <string>] [-c] [-u <string>] [--apiversion <string>]
    [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

FLAGS
  -c, --createcsv                                                                   Create diff list in csv format
  -r, --revisionfrom=<value>                                                        base revision to generate the diff
                                                                                    e.g. 84965e9e or feature/SprintX or
                                                                                    feature/FeatureX
  -s, --sourceusername=<value>                                                      (Required) source org username or
                                                                                    alias
  -t, --revisionto=<value>                                                          base revision to generate the diff
                                                                                    e.g. 84965e9e or feature/SprintX or
                                                                                    feature/FeatureX
  -u, --targetusername=<value>                                                      username or alias for the target
                                                                                    org; overrides default target org
  -x, --ignorecomments                                                              Ignore compare differences comments
                                                                                    in deployment package.xml
  --apiversion=<value>                                                              override the api version used for
                                                                                    api requests made by this command
  --json                                                                            format output as json
  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for
                                                                                    this command invocation

DESCRIPTION
  Generates a detailed changeset by comparing differences between two mdapi staged source directory files or source
  control commit versions.

EXAMPLES
      $ sfdx ext:mdapi:changeset --sourceusername user@source.com --targetusername user@target.com --apiversion 46.0 --ignorecomments
    

      $ sfdx ext:mdapi:changeset --sourceusername user@source.com --targetusername user@target.com
    

      $ sfdx ext:mdapi:changeset --sourceusername user@source.com --targetusername user@target.com --revisionfrom 9b834dbeec28b21f39756ad4b0183e8568ef7a7c --revisionto feature/SprintX
    

      $ sfdx ext:mdapi:changeset -s DevOrg -u ReleaseOrg -r dd7f8491f5e897d6b637915affb7ebac66ff4623 -t feature/Sprint6
```

_See code: [src/commands/mdapi/changeset.ts](https://github.com/brian.edward.saunders/sfdx-ext/blob/v0.0.1/src/commands/mdapi/changeset.ts)_

## `sfdx ext:mdapi:retrieve [-b] [-i] [-n] [-d] [-f] [-s] [-x] [-z] [-t] [-c] [-r <array>] [-w <array>] [-y <array>] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]`

Retrieve and refresh org metadata to local directory (i.e. retrieve all metadata from org).

```
USAGE
  $ sfdx ext:mdapi:retrieve [-b] [-i] [-n] [-d] [-f] [-s] [-x] [-z] [-t] [-c] [-r <array>] [-w <array>] [-y <array>] [-u
    <string>] [--apiversion <string>] [--json] [--loglevel
    trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

FLAGS
  -b, --ignorebackup                                                                flag to ignore creating a local
                                                                                    backup of retrieved files
  -c, --createcsv                                                                   create csv flag to create csv file
                                                                                    to easily compare metadata items in
                                                                                    excel
  -d, --ignorehidden                                                                (Recommended) flag to ignore
                                                                                    retrieving hidden or non-editable
                                                                                    managed files such as managed
                                                                                    ApexClasses
  -f, --ignorefolders                                                               flag to ignore retrieving folder
                                                                                    e.g. email, reports, dashboards and
                                                                                    documents
  -i, --ignoreinstalled                                                             flag to ignore retrieving installed
                                                                                    (or managed) package files (excludes
                                                                                    all installed metadata)
  -n, --ignorenamespaces                                                            flag to ignore retrieving namespace
                                                                                    prefixed package files (excludes all
                                                                                    namespaced metadata)
  -r, --containsfilters=<value>                                                     filters (case sensitive) for only
                                                                                    meta components containing text e.g.
                                                                                    -r ABC_,Xyz
  -s, --ignorestaticresources                                                       flag to ignore retrieving all static
                                                                                    resources
  -t, --split                                                                       flag to split package.xml into
                                                                                    package1.xml and package2.xml to
                                                                                    address 10000 file download limit
                                                                                    per request
  -u, --targetusername=<value>                                                      username or alias for the target
                                                                                    org; overrides default target org
  -w, --startswithfilters=<value>                                                   filters (case sensitive) for only
                                                                                    meta components such as lwc starting
                                                                                    with text e.g. -w xyz
  -x, --manifestonly                                                                flag to only create
                                                                                    manifest/package.xml and don't
                                                                                    download meta data files
  -y, --includetypes=<value>                                                        filters (case sensitive and whole
                                                                                    words) for only meta types such as
                                                                                    Settings
  -z, --stagemode                                                                   stage mode (default is false)
                                                                                    otherwise dev mode (default is true)
                                                                                    e.g. src
  --apiversion=<value>                                                              override the api version used for
                                                                                    api requests made by this command
  --json                                                                            format output as json
  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for
                                                                                    this command invocation

DESCRIPTION
  Retrieve and refresh org metadata to local directory (i.e. retrieve all metadata from org).

EXAMPLES
      $ sfdx ext:mdapi:retrieve --targetusername user@example.com --apiversion 53.0 --ignorebackup --ignoreinstalled --ignorenamespaces --ignorehidden --ignorefolders --ignorestaticresources --manifestonly --stagemode --split
    

      $ sfdx ext:mdapi:retrieve -u user@example.com -b -i -n -d -f -s -x -t
    

      $ sfdx ext:mdapi:retrieve -u user@example.com -z
    

      $ sfdx ext:mdapi:retrieve --targetusername user@example.com
```

_See code: [src/commands/mdapi/retrieve.ts](https://github.com/brian.edward.saunders/sfdx-ext/blob/v0.0.1/src/commands/mdapi/retrieve.ts)_

## `sfdx ext:package:sync [-s <string>] [-c] [-e] [-i] [-x] [-z] [-v] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]`

Compare package versions between two orgs and/or sync (install or uninstall) packages in target org based on package version(s) in the source org. This command needs to be run from within project folder (sfdx dependancy).

```
USAGE
  $ sfdx ext:package:sync [-s <string>] [-c] [-e] [-i] [-x] [-z] [-v] [-u <string>] [--apiversion <string>] [--json]
    [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

FLAGS
  -c, --compareonly                                                                 flag to check package version(s)
                                                                                    differences between orgs (Default)
  -e, --compareerror                                                                flag to check package version(s)
                                                                                    differences between orgs and an
                                                                                    throw error if different
  -i, --installonly                                                                 flag to only install package
                                                                                    versions detected as missing or
                                                                                    different from source org to target
                                                                                    org
  -s, --sourceusername=<value>                                                      (Required) source org username or
                                                                                    alias
  -u, --targetusername=<value>                                                      username or alias for the target
                                                                                    org; overrides default target org
  -v, --createcsv                                                                   create csv flag to create csv file
                                                                                    of sync comparison in excel.
                                                                                    Recommend using with check flag
  -x, --uninstallonly                                                               flag to only uninstall package
                                                                                    versions detected as present in
                                                                                    target org but not present in source
                                                                                    org
  -z, --syncpackages                                                                flag to sync all package versions
                                                                                    from source org to target org (i.e.
                                                                                    both install and uninstall in target
                                                                                    if necessary)
  --apiversion=<value>                                                              override the api version used for
                                                                                    api requests made by this command
  --json                                                                            format output as json
  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for
                                                                                    this command invocation

DESCRIPTION
  Compare package versions between two orgs and/or sync (install or uninstall) packages in target org based on package
  version(s) in the source org. This command needs to be run from within project folder (sfdx dependancy).

EXAMPLES
      $ sfdx ext:package:sync --sourceusername user@sourceorg.com --targetusername user@targetorg.com
    

      $ sfdx ext:package:sync --sourceusername user@sourceorg.com --targetusername user@targetorg.com --compareerror
    

      $ sfdx ext:package:sync --sourceusername user@sourceorg.com --targetusername user@targetorg.com --compareonly --installonly --uninstallonly --syncpackages
```

_See code: [src/commands/package/sync.ts](https://github.com/brian.edward.saunders/sfdx-ext/blob/v0.0.1/src/commands/package/sync.ts)_
<!-- commandsstop -->
<!-- debugging-your-plugin -->
# Debugging your plugin
We recommend using the Visual Studio Code (VS Code) IDE for your plugin development. Included in the `.vscode` directory of this plugin is a `launch.json` config file, which allows you to attach a debugger to the node process when running your commands.

To debug the `hello:org` command: 
1. Start the inspector
  
If you linked your plugin to the sfdx cli, call your command with the `dev-suspend` switch: 
```sh-session
$ sfdx hello:org -u myOrg@example.com --dev-suspend
```
  
Alternatively, to call your command using the `bin/run` script, set the `NODE_OPTIONS` environment variable to `--inspect-brk` when starting the debugger:
```sh-session
$ NODE_OPTIONS=--inspect-brk bin/run hello:org -u myOrg@example.com
```

2. Set some breakpoints in your command code
3. Click on the Debug icon in the Activity Bar on the side of VS Code to open up the Debug view.
4. In the upper left hand corner of VS Code, verify that the "Attach to Remote" launch configuration has been chosen.
5. Hit the green play button to the left of the "Attach to Remote" launch configuration window. The debugger should now be suspended on the first line of the program. 
6. Hit the green play button at the top middle of VS Code (this play button will be to the right of the play button that you clicked in step #5).
<br><img src=".images/vscodeScreenshot.png" width="480" height="278"><br>
Congrats, you are debugging!
