/**
 * @name FlowsActivation (deactivate or activate all flows and process builders in target org)
 * @author brianewardsaunders
 * @date 2019-07-10
 */

import {SfdxCommand, flags} from "@salesforce/command";
import {Messages, SfdxError} from "@salesforce/core";
import {FlowsActivationUtility} from "../../../scripts/flows-activation-utility";

Messages.importMessagesDirectory(__dirname);

let messages = Messages.loadMessages(
    "sfdx-ext",
    "flows-activation"
);

export default class Activation extends SfdxCommand {

    public static description = messages.getMessage("commandDescription");

    public static examples = [
        `
    $ sfdx ext:flows:activation --targetusername user@targetorg.com --deactivate
    `,
        `
    $ sfdx ext:flows:activation --targetusername user@targetorg.com --activate
    `,
        `
    $ sfdx ext:flows:activation -u ReleaseOrg --activate
    `
    ];

    protected static flagsConfig = {
        "activate": flags.boolean({"char": "a",
            "description": messages.getMessage("activateFlagDescription")}),
        "deactivate": flags.boolean({"char": "d",
            "description": messages.getMessage("deactivateFlagDescription")})
    };

    // Requires user alias
    protected static requiresUsername = true;

    protected static requiresProject = false;

    public async run (): Promise<any> {

        let defaultApiVersion: string = await this.org.retrieveMaxApiVersion(),
            {targetusername} = this.flags,
            activate: boolean = this.flags.activate || false,
            deactivate: boolean = this.flags.deactivate || false;

        if (activate && deactivate) {

            throw new SfdxError(messages.getMessage("errorActivateOrDeactivateRequired"));

        }// End else

        if (!activate && !deactivate) {

            throw new SfdxError(messages.getMessage("errorActivateOrDeactivateRequired"));

        }// End else

        this.ux.log("-----------------------------");
        this.ux.log("sfdx ext:flows:activation");
        this.ux.log("-----------------------------");
        this.ux.log(`targetusername  : ${targetusername}`);
        this.ux.log(`apiversion      : ${defaultApiVersion}`);
        this.ux.log(`activate        : ${activate}`);
        this.ux.log(`deactivate      : ${deactivate}`);
        this.ux.log("-----------------------------");

        let util = new FlowsActivationUtility(
            this.org,
            this.ux,
            targetusername,
            defaultApiVersion,
            deactivate
        );

        util.process().then(
            () => {

                this.ux.log("success.");

                return {"status": "success"};

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
