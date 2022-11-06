/**
 * @name Retrieve (mdapi)
 * @author brianewardsaunders
 * @date 2019-07-10
 */
import * as os from 'os';
import { SfdxCommand, flags } from "@salesforce/command";
import { Messages } from "@salesforce/core";
import { MdapiRetrieveUtility } from "../../../scripts/mdapi-retrieve-utility";

Messages.importMessagesDirectory(__dirname);

let messages = Messages.loadMessages(
  "sfdx-ext",
  "mdapi-retrieve"
);

export default class Retrieve extends SfdxCommand {

  public static description = messages.getMessage("commandDescription");

  public static examples = messages.getMessage('examples').split(os.EOL);

  protected static flagsConfig = {
    "ignorebackup": flags.boolean({
      "char": "b",
      "description": messages.getMessage("ignorebackupFlagDescription")
    }),
    "ignoreinstalled": flags.boolean({
      "char": "i",
      "description": messages.getMessage("ignoreinstalledFlagDescription")
    }),
    "ignorenamespaces": flags.boolean({
      "char": "n",
      "description": messages.getMessage("ignorenamespacesFlagDescription")
    }),
    "ignorehidden": flags.boolean({
      "char": "d",
      "description": messages.getMessage("ignorehiddenFlagDescription")
    }),
    "ignorefolders": flags.boolean({
      "char": "f",
      "description": messages.getMessage("ignorefoldersFlagDescription")
    }),
    "ignorestaticresources": flags.boolean({
      "char": "s",
      "description": messages.getMessage("ignorestaticresourcesFlagDescription")
    }),
    "manifestonly": flags.boolean({
      "char": "x",
      "description": messages.getMessage("manifestonlyFlagDescription")
    }),
    "stagemode": flags.boolean({
      "char": "z",
      "description": messages.getMessage("stagemodeFlagDescription")
    }),
    "split": flags.boolean({
      "char": "t",
      "description": messages.getMessage("splitFlagDescription")
    }),
    "createcsv": flags.boolean({
      "char": "c",
      "description": messages.getMessage("createcsvFlagDescription")
    }),
    "containsfilters": flags.array({
      "char": "r",
      "description": messages.getMessage("containsFiltersFlagDescription")
    }),
    "startswithfilters": flags.array({
      "char": "w",
      "description": messages.getMessage("startsWithFiltersFlagDescription")
    }),
    "endswithfilters": flags.array({
      "char": "j",
      "description": messages.getMessage("endsWithFiltersFlagDescription")
    }),
    "matchfilters": flags.array({
      "char": "m",
      "description": messages.getMessage("matchFiltersFlagDescription")
    }),
    "includetypes": flags.array({
      "char": "y",
      "description": messages.getMessage("includeTypesFiltersFlagDescription")
    }),
    "excludecontainsfilters": flags.array({
      "char": "q",
      "description": messages.getMessage("excludecontainsFiltersFlagDescription")
    }),
    "excludestartswithfilters": flags.array({
      "char": "e",
      "description": messages.getMessage("excludestartsWithFiltersFlagDescription")
    }),
    "excludeendswithfilters": flags.array({
      "char": "o",
      "description": messages.getMessage("excludeendsWithFiltersFlagDescription")
    }),
    "excludematchfilters": flags.array({
      "char": "p",
      "description": messages.getMessage("excludematchFiltersFlagDescription")
    }),
    "excludetypes": flags.array({
      "char": "k",
      "description": messages.getMessage("excludeTypesFiltersFlagDescription")
    })
  };

  protected static requiresUsername = true;

  protected static requiresProject = false;

  public async run(): Promise<any> {

    let defaultApiVersion: string = await this.org.retrieveMaxApiVersion(),
      username: string = this.flags.targetusername,
      apiversion: string = this.flags.apiversion || defaultApiVersion,
      ignorebackup: boolean = this.flags.ignorebackup || false,
      ignoreinstalled: boolean = this.flags.ignoreinstalled || false,
      ignorenamespaces: boolean = this.flags.ignorenamespaces || false,
      ignorehidden: boolean = this.flags.ignorehidden || false,
      ignorefolders: boolean = this.flags.ignorefolders || false,
      ignorestaticresources: boolean = this.flags.ignorestaticresources || false,
      manifestonly: boolean = this.flags.manifestonly || false,
      stagemode: boolean = this.flags.stagemode || false, // default,
      splitmode: boolean = this.flags.split || false,
      createcsv: boolean = this.flags.createcsv || false,
      containsFilters: Array<string> = this.flags.containsfilters || null,
      startsWithFilters: Array<string> = this.flags.startswithfilters || null,
      endsWithFilters: Array<string> = this.flags.endswithfilters || null,
      matchFilters: Array<string> = this.flags.matchfilters || null,
      includeTypes: Array<string> = this.flags.includetypes || null,
      excludeContainsFilters: Array<string> = this.flags.excludecontainsfilters || null,
      excludeStartsWithFilters: Array<string> = this.flags.excludestartswithfilters || null,
      excludeEndsWithFilters: Array<string> = this.flags.excludeendswithfilters || null,
      excludeMatchFilters: Array<string> = this.flags.excludematchfilters || null,
      excludeTypes: Array<string> = this.flags.excludetypes || null,
      devmode = !stagemode;

    this.ux.log("-----------------------------");
    this.ux.log("sfdx ext:mdapi:retrieve");
    this.ux.log("-----------------------------");
    this.ux.log(`targetusername           : ${username}`);
    this.ux.log(`apiversion               : ${apiversion}`);
    this.ux.log(`ignorebackup             : ${ignorebackup}`);
    this.ux.log(`ignoreinstalled          : ${ignoreinstalled}`);
    this.ux.log(`ignorenamespaces         : ${ignorenamespaces}`);
    this.ux.log(`ignorehidden             : ${ignorehidden}`);
    this.ux.log(`ignorefolders            : ${ignorefolders}`);
    this.ux.log(`ignorestaticresources    : ${ignorestaticresources}`);
    this.ux.log(`manifestonly             : ${manifestonly}`);
    this.ux.log(`retrievemode             : ${devmode ? "dev" : "stage"}`);
    this.ux.log(`split                    : ${splitmode}`);
    this.ux.log(`createcsv                : ${createcsv}`);
    this.ux.log(`startswithfilters        : ${startsWithFilters}`);
    this.ux.log(`containsfilters          : ${containsFilters}`);
    this.ux.log(`endswithfilters          : ${endsWithFilters}`);
    this.ux.log(`matchfilters             : ${matchFilters}`);
    this.ux.log(`includetypes             : ${includeTypes}`);
    this.ux.log(`excludestartswithfilters : ${excludeStartsWithFilters}`);
    this.ux.log(`excludecontainsfilters   : ${excludeContainsFilters}`);
    this.ux.log(`excludeendswithfilters   : ${excludeEndsWithFilters}`);
    this.ux.log(`excludematchfilters      : ${excludeMatchFilters}`);
    this.ux.log(`excludetypes             : ${excludeTypes}`);
    this.ux.log("-----------------------------");

    let util = new MdapiRetrieveUtility(
      this.org,
      this.ux,
      username,
      apiversion,
      ignorebackup,
      ignoreinstalled,
      ignorenamespaces,
      ignorehidden,
      ignorefolders,
      ignorestaticresources,
      manifestonly,
      devmode,
      splitmode,
      createcsv,
      startsWithFilters,
      containsFilters,
      endsWithFilters,
      matchFilters,
      includeTypes,
      excludeStartsWithFilters,
      excludeContainsFilters,
      excludeEndsWithFilters,
      excludeMatchFilters,
      excludeTypes
    );

    util.process().then(() => {
        this.ux.log("success.");
        return { "status": "success" };
      },
      (error: any) => {
        this.ux.error(error);
        return {
          "status": "error",
          error
        };
      }
    );

  }// End method

}// End class
