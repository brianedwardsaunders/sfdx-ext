sfdx-ext
========

# Name
Sfdx Extensions (for Developers, Admin and DevOps) which includes common tasks when using sfdx-cli and working on enterprise projects.
Additional commands may be added to this project as it evolves.

## `ext:flows:activation`

Activate or deactivate all flows (i.e. flows and process builders whilst maintaining latest version).

```
USAGE
  $ sfdx ext:flows:activation [-a] [-d] [-u <string>] [--apiversion <string>] [--json] [--loglevel
  trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

OPTIONS
  -a, --activate                                                                    flag activate all flows
  -d, --deactivate                                                                  flag to deactivate all flows

  -u, --targetusername=targetusername                                               username or alias for the target
                                                                                    org; overrides default target org

  --apiversion=apiversion                                                           override the api version used for
                                                                                    api requests made by this command

  --json                                                                            format output as json

  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for
                                                                                    this command invocation

EXAMPLES

       $ sfdx ext:flows:activation --targetusername user@targetorg.com --deactivate


       $ sfdx ext:flows:activation --targetusername user@targetorg.com --activate


       $ sfdx ext:flows:activation -u ReleaseOrg --activate
```

## `ext:mdapi:changeset`

Generates a detailed changeset by comparing differences between two mdapi staged source directory files or source control commit versions.

```
USAGE
  $ sfdx ext:mdapi:changeset [-s <string>] [-x] [-i <string>] [-r <string>] [-t <string>] [-u <string>] [--apiversion <string>] [--json] [--loglevel
  trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

OPTIONS
  -i, --ignorepath=ignorepath                                                       (Optional) file path override to changeset-exclude.json including mdapi directory and files to exclude from changeset
  -r, --revisionfrom=revisionfrom                                                   base revision to generate the diff e.g. 84965e9e or feature/SprintX or feature/FeatureX
  -s, --sourceusername=sourceusername                                               (Required) source org username or alias
  -t, --revisionto=revisionto                                                       base revision to generate the diff e.g. 84965e9e or feature/SprintX or feature/FeatureX
  -u, --targetusername=targetusername                                               username or alias for the target org; overrides default target org
  -x, --ignorecomments                                                              Ignore compare differences comments in deployment package.xml
  --apiversion=apiversion                                                           override the api version used for api requests made by this command
  --json                                                                            format output as json
  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for this command invocation

EXAMPLES

       $ sfdx ext:mdapi:changeset --sourceusername user@source.com --targetusername user@target.com --apiversion 53.0 --ignorecomments


       $ sfdx ext:mdapi:changeset --sourceusername user@source.com --targetusername user@target.com


       $ sfdx ext:mdapi:changeset --sourceusername user@source.com --targetusername user@target.com --revisionfrom 9b834dbeec28b21f39756ad4b0183e8568ef7a7c --revisionto feature/SprintX


       $ sfdx ext:mdapi:changeset -s DevOrg -u ReleaseOrg -r dd7f8491f5e897d6b637915affb7ebac66ff4623 -t feature/Sprint6


       $ sfdx ext:mdapi:changeset -s DevOrg -u ReleaseOrg -i config/changeset-exclude.json -r dd7f8491f5e897d6b637915affb7ebac66ff4623 -t feature/Sprint6

         -i FILE EXAMPLE: config/changeset-exclude.json =
         {
             "directoryExcludes": ["flowDefinitions"],
             "fileExcludes": ["appMenus/AppSwitcher.appMenu"]
         }
```

## `ext:mdapi:convert`

Convert from mdapi to sfdx (and exclude currently non-sfdx supported metatypes).

```
USAGE
  $ sfdx ext:mdapi:convert [-r <string>] [-d <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

OPTIONS
  -d, --targetdirectory=targetdirectory                                             (Required) target sfdx root directory e.g. sfdx-project and not sfdx-project/force-app
  -r, --sourcedirectory=sourcedirectory                                             (Required) source mdapi retrieve directory e.g. unpackaged/src
  --json                                                                            format output as json
  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for this command invocation

EXAMPLE

       $ sfdx ext:mdapi:convert --sourcedirectory mdapi/src --targetdirectory ../sfdx
```

## `ext:mdapi:retrieve`

Retrieve and refresh org metadata to local directory (i.e. retrieve all metadata from org).

```
USAGE
  $ sfdx ext:mdapi:retrieve [-b] [-i] [-n] [-h] [-f] [-s] [-x] [-z] [-t] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

OPTIONS
  -b, --ignorebackup                                                                flag to ignore creating a local backup of retrieved files
  -f, --ignorefolders                                                               flag to ignore retrieving folder e.g. email, reports, dashboards and documents
  -h, --ignorehidden                                                                (Recommended) flag to ignore retrieving hidden or non-editable managed files such as managed ApexClasses
  -i, --ignoreinstalled                                                             flag to ignore retrieving installed (or managed) package files (excludes all installed metadata)
  -n, --ignorenamespaces                                                            flag to ignore retrieving namespace prefixed package files (excludes all namespaced metadata)
  -s, --ignorestaticresources                                                       flag to ignore retrieving all static resources
  -t, --split                                                                       flag to split package.xml into package1.xml and package2.xml to address 10000 file download limit per request
  -u, --targetusername=targetusername                                               username or alias for the target org; overrides default target org
  -x, --manifestonly                                                                flag to only create manifest/package.xml and don't download meta data files
  -z, --stagemode                                                                   stage mode (default is false) otherwise dev mode (default is true) e.g. src
  --apiversion=apiversion                                                           override the api version used for api requests made by this command
  --json                                                                            format output as json
  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for this command invocation

EXAMPLES

       $ sfdx ext:mdapi:retrieve --targetusername user@example.com --apiversion 53.0 --ignorebackup --ignoreinstalled --ignorenamespaces --ignorehidden --ignorefolders --ignorestaticresources --manifestonly --stagemode --split


       $ sfdx ext:mdapi:retrieve -u user@example.com -b -i -n -h -f -s -x -t


       $ sfdx ext:mdapi:retrieve -u user@example.com -z


       $ sfdx ext:mdapi:retrieve --targetusername user@example.com
```

## `ext:package:sync`

Compare package versions between two orgs and/or sync (install or uninstall) packages in target org based on package version(s) in the source org. This command needs to be run from within project folder (sfdx dependancy).

```
USAGE
  $ sfdx ext:package:sync [-s <string>] [-c] [-e] [-i] [-x] [-z] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

OPTIONS
  -c, --compareonly                                                                 flag to check package version(s) differences between orgs (Default)
  -e, --compareerror                                                                flag to check package version(s) differences between orgs and an throw error if different
  -i, --installonly                                                                 flag to only install package versions detected as missing or different from source org to target org
  -s, --sourceusername=sourceusername                                               (Required) source org username or alias
  -u, --targetusername=targetusername                                               username or alias for the target org; overrides default target org
  -x, --uninstallonly                                                               flag to only uninstall package versions detected as present in target org but not present in source org
  -z, --syncpackages                                                                flag to sync all package versions from source org to target org (i.e. both install and uninstall in target if necessary)
  --apiversion=apiversion                                                           override the api version used for api requests made by this command
  --json                                                                            format output as json
  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for this command invocation

EXAMPLES

       $ sfdx ext:package:sync --sourceusername user@sourceorg.com --targetusername user@targetorg.com


       $ sfdx ext:package:sync --sourceusername user@sourceorg.com --targetusername user@targetorg.com --compareerror


       $ sfdx ext:package:sync --sourceusername user@sourceorg.com --targetusername user@targetorg.com --compareonly --installonly --uninstallonly --syncpackages
```

## `ext:source:convert`

Convert from sfdx to mdapi src (and update target src package.xml files).

```
USAGE
  $ sfdx ext:source:convert [-r <string>] [-d <string>] [-u <string>] [--apiversion <string>] [--json] [--loglevel trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

OPTIONS
  -d, --targetdirectory=targetdirectory                                             (Required) target sfdx root directory e.g. ../unpackaged
  -r, --sourcedirectory=sourcedirectory                                             (Required Default force-app) source mdapi retrieve directory within sfdx-project directory e.g. ./force-app
  -u, --targetusername=targetusername                                               username or alias for the target org; overrides default target org
  --apiversion=apiversion                                                           override the api version used for api requests made by this command
  --json                                                                            format output as json
  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for this command invocation

EXAMPLES

       $ sfdx ext:mdapi:convert --targetusername user@target.com --sourcedirectory force-app --targetdirectory ../unmanaged


       $ sfdx ext:mdapi:convert -u user@target.com -r force-app -d ../unmanaged
```

### Install npm dependencies and plugin libraries
``` 
  npm install --global sfdx-cli 
  npm install --global sfdx-ext 
```

### Install the sfdx-ext plugin
``` 
  sfdx plugins:install sfdx-ext  
```

### Confirm the installation
``` 
    sfdx plugins
    > sfdx-ext
```

# More information
``` 
    brian.saunders
    Accenture (2019) 
```

# Published steps
``` 
    npm login
    npm publish 
    
    publisher email brian.edward.saunders@gmail.com 
    github brianedwardsaunders 
```
