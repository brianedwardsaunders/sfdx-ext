/**
 * @name Changeset
 * @author brianewardsaunders
 * @date 2019-07-10
 */
import * as os from 'os';
import { SfdxCommand, flags } from "@salesforce/command";
import { Messages, SfError } from "@salesforce/core";
import { MdapiChangesetUtility } from "../../../scripts/mdapi-changeset-utility";
import { AnyJson } from '@salesforce/ts-types';

Messages.importMessagesDirectory(__dirname);

let messages = Messages.loadMessages(
  "sfdx-ext",
  "mdapi-changeset"
);

export default class Changeset extends SfdxCommand {

  public static description = messages.getMessage("commandDescription");

  public static examples = messages.getMessage('examples').split(os.EOL);

  protected static flagsConfig = {
    "sourceusername": flags.string({
      "char": "s",
      "description": messages.getMessage("sourceusernameFlagDescription")
    }),
    "ignorecomments": flags.boolean({
      "char": "x",
      "description": messages.getMessage("ignorecommentsFlagDescription")
    }),
    "revisionfrom": flags.string({
      "char": "r",
      "description": messages.getMessage("revisionfromFlagDescription")
    }),
    "revisionto": flags.string({
      "char": "t",
      "description": messages.getMessage("revisionfromFlagDescription")
    }),
    "createcsv": flags.boolean({
      "char": "c",
      "description": messages.getMessage("createcsvFlagDescription")
    })

  };

  // Requires user alias
  protected static requiresUsername = true;

  protected static requiresProject = false;

  public async run(): Promise<AnyJson> {

    let defaultApiVersion: string = await this.org.retrieveMaxApiVersion(),
      ignorecomments: boolean = this.flags.ignorecomments || false,
      { targetusername } = this.flags,
      { sourceusername } = this.flags,
      revisionfrom: string = this.flags.revisionfrom || null,
      revisionto: string = this.flags.revisionto || null,
      apiversion: string = this.flags.apiversion || defaultApiVersion,
      createcsv: boolean = this.flags.createcsv || false;

    if (sourceusername === undefined) {

      throw new SfError(messages.getMessage("errorSourceusernameRequired"));

    }// End if
    else if (revisionfrom === null && revisionto !== null || revisionfrom !== null && revisionto === null) {

      throw new SfError(messages.getMessage("errorBothRevisionsRequired"));

    }// End if

    this.ux.log("-----------------------------");
    this.ux.log("sfdx ext:mdapi:changeset");
    this.ux.log("-----------------------------");
    this.ux.log(`sourceusername   : ${sourceusername}`);
    this.ux.log(`targetusername   : ${targetusername}`);
    this.ux.log(`apiversion       : ${apiversion}`);
    this.ux.log(`ignorecomments   : ${ignorecomments}`);
    this.ux.log(`revisionfrom     : ${revisionfrom}`);
    this.ux.log(`revisionto       : ${revisionto}`);
    this.ux.log(`createcsv        : ${createcsv}`);
    this.ux.log("-----------------------------");

    let util = new MdapiChangesetUtility(
      this.org,
      this.ux,
      sourceusername,
      targetusername,
      apiversion,
      ignorecomments,
      revisionfrom,
      revisionto,
      createcsv
    );

    return new Promise((resolve, reject) => {

      util.process().then(
        () => {

          this.ux.log("success.");
          resolve({ "status": "success" });

        },
        (error: any) => {

          this.ux.error(error);
          reject({
            "status": "error",
            error
          });

        }
      );

    });

  }// End method

}// End class
