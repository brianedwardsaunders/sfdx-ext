/**
 * @name Changeset
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

import { SfdxCommand, flags } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import { MdapiChangesetUtility } from '../../../scripts/mdapi-changeset-utility';

Messages.importMessagesDirectory(__dirname);

const messages = Messages.loadMessages('sfdx-ext', 'mdapi-changeset');

export default class Changeset extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

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
  ];

  protected static flagsConfig = {
    sourceusername: flags.string({ char: 's', description: messages.getMessage('sourceusernameFlagDescription') }),
    ignorecomments: flags.boolean({ char: 'x', description: messages.getMessage('ignorecommentsFlagDescription') }),
    revisionfrom: flags.string({ char: 'r', description: messages.getMessage('revisionfromFlagDescription') }),
    revisionto: flags.string({ char: 't', description: messages.getMessage('revisionfromFlagDescription') })
  };

  // requires user alias
  protected static requiresUsername = true;
  protected static requiresProject = false;

  public async run(): Promise<any> {

    let defaultApiVersion: string = await this.org.retrieveMaxApiVersion();
    let ignorecomments: boolean = this.flags.ignorecomments || false;
    let targetusername: string = this.flags.targetusername;
    let sourceusername: string = this.flags.sourceusername;
    let revisionfrom: string = this.flags.revisionfrom || null;
    let revisionto: string = this.flags.revisionto || null;
    let apiversion: string = this.flags.apiversion || defaultApiVersion;

    if (sourceusername === undefined) {
      throw new SfdxError(messages.getMessage('errorSourceusernameRequired'));
    }// end if
    else if ((revisionfrom === null && revisionto !== null) || (revisionfrom !== null && revisionto === null)) {
      throw new SfdxError(messages.getMessage('errorBothRevisionsRequired'));
    }// end if

    this.ux.log("-----------------------------");
    this.ux.log("sfdx ext:mdapi:changeset");
    this.ux.log("-----------------------------");
    this.ux.log("sourceusername   : " + sourceusername);
    this.ux.log("targetusername   : " + targetusername);
    this.ux.log("apiversion       : " + apiversion);
    this.ux.log("ignorecomments   : " + ignorecomments);
    this.ux.log("revisionfrom     : " + revisionfrom);
    this.ux.log("revisionto       : " + revisionto);
    this.ux.log("-----------------------------");

    let util = new MdapiChangesetUtility(
      this.org,
      this.ux,
      sourceusername,
      targetusername,
      apiversion,
      ignorecomments,
      revisionfrom,
      revisionto);

    util.process().then(() => {
      this.ux.log('success.');
      return { "status": 'success' };
    }, (error: any) => {
      this.ux.error(error);
      return {
        "status": 'error',
        "error": error
      };
    });
  }// end method

}// end class
