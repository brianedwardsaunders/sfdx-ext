/**
 * @name Changeset
 * @author brianewardsaunders
 * @date 2019-07-10
 */

import {SfdxCommand, flags} from "@salesforce/command";
import {Messages, SfdxError} from "@salesforce/core";
import {MdapiChangesetUtility} from "../../../scripts/mdapi-changeset-utility";

Messages.importMessagesDirectory(__dirname);

let messages = Messages.loadMessages(
    "sfdx-ext",
    "mdapi-changeset"
);

export default class Changeset extends SfdxCommand {

    public static description = messages.getMessage("commandDescription");

    public static examples = [
        `
    $ sfdx ext:mdapi:changeset --sourceusername user@source.com --targetusername user@target.com --apiversion 46.0 --ignorecomments
    `,
        `
    $ sfdx ext:mdapi:changeset --sourceusername user@source.com --targetusername user@target.com
    `,
        `
    $ sfdx ext:mdapi:changeset --sourceusername user@source.com --targetusername user@target.com --revisionfrom 9b834dbeec28b21f39756ad4b0183e8568ef7a7c --revisionto feature/SprintX
    `,
        `
    $ sfdx ext:mdapi:changeset -s DevOrg -u ReleaseOrg -r dd7f8491f5e897d6b637915affb7ebac66ff4623 -t feature/Sprint6
    `,
        `
    $ sfdx ext:mdapi:changeset -s DevOrg -u ReleaseOrg -i config/changeset-exclude.json -r dd7f8491f5e897d6b637915affb7ebac66ff4623 -t feature/Sprint6

      -i FILE EXAMPLE: config/changeset-exclude.json =
      {
          "directoryExcludes": ["flowDefinitions"],
          "fileExcludes": ["appMenus/AppSwitcher.appMenu"]
      }
    `
    ];

    protected static flagsConfig = {
        "sourceusername": flags.string({"char": "s",
            "description": messages.getMessage("sourceusernameFlagDescription")}),
        "ignorecomments": flags.boolean({"char": "x",
            "description": messages.getMessage("ignorecommentsFlagDescription")}),
        "ignorepath": flags.string({"char": "i",
            "description": messages.getMessage("ignorepathFlagDescription")}),
        "revisionfrom": flags.string({"char": "r",
            "description": messages.getMessage("revisionfromFlagDescription")}),
        "revisionto": flags.string({"char": "t",
            "description": messages.getMessage("revisionfromFlagDescription")})
    };

    // Requires user alias
    protected static requiresUsername = true;

    protected static requiresProject = false;

    public async run (): Promise<any> {

        let defaultApiVersion: string = await this.org.retrieveMaxApiVersion(),
            ignorecomments: boolean = this.flags.ignorecomments || false,
            {targetusername} = this.flags,
            {sourceusername} = this.flags,
            excludepath: string = this.flags.excludepath || null,
            revisionfrom: string = this.flags.revisionfrom || null,
            revisionto: string = this.flags.revisionto || null,
            apiversion: string = this.flags.apiversion || defaultApiVersion;

        if (sourceusername === undefined) {

            throw new SfdxError(messages.getMessage("errorSourceusernameRequired"));

        }// End if
        else if (revisionfrom === null && revisionto !== null || revisionfrom !== null && revisionto === null) {

            throw new SfdxError(messages.getMessage("errorBothRevisionsRequired"));

        }// End if

        this.ux.log("-----------------------------");
        this.ux.log("sfdx ext:mdapi:changeset");
        this.ux.log("-----------------------------");
        this.ux.log(`sourceusername   : ${sourceusername}`);
        this.ux.log(`targetusername   : ${targetusername}`);
        this.ux.log(`apiversion       : ${apiversion}`);
        this.ux.log(`ignorecomments   : ${ignorecomments}`);
        this.ux.log(`excludepath      : ${excludepath}`);
        this.ux.log(`revisionfrom     : ${revisionfrom}`);
        this.ux.log(`revisionto       : ${revisionto}`);
        this.ux.log("-----------------------------");

        let util = new MdapiChangesetUtility(
            this.org,
            this.ux,
            sourceusername,
            targetusername,
            apiversion,
            ignorecomments,
            excludepath,
            revisionfrom,
            revisionto
        );

        return new Promise((resolve, reject) => {

            util.process().then(
                () => {

                    this.ux.log("success.");
                    resolve({"status": "success"});

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
