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
    `
  ];

  protected static flagsConfig = {
    sourceusername: flags.string({ char: 's', description: messages.getMessage('sourceusernameFlagDescription') }),
    ignorecomments: flags.boolean({ char: 'x', description: messages.getMessage('ignorecommentsFlagDescription') })
  };

  // requires user alias
  protected static requiresUsername = true;
  protected static requiresProject = false;

  public async run(): Promise<any> {

    let defaultApiVersion: string = '46.0';
    let ignorecomments: boolean = this.flags.ignorecomments || false;
    let sourceusername: string = this.flags.sourceusername;
    let targetusername: string = this.flags.targetusername;
    let apiversion: string = this.flags.apiversion || defaultApiVersion;

    if (sourceusername === undefined) {
      throw new SfdxError(messages.getMessage('errorSourceusernameRequired'));
    }

    console.log("-----------------------------");
    console.log("sfdx ext:mdapi:changeset");
    console.log("-----------------------------");
    console.log("sourceusername   : " + sourceusername);
    console.log("targetusername   : " + targetusername);
    console.log("apiversion       : " + apiversion);
    console.log("ignorecomments   : " + ignorecomments);
    console.log("-----------------------------");

    let util = new MdapiChangesetUtility(
      this.org,
      sourceusername,
      targetusername,
      apiversion,
      ignorecomments);

    util.process().then(() => {
      this.ux.log('success');
      return { "status": 'success' };
    }, (error: any) => {
      this.ux.error(error);
      return {
        "status": 'error',
        "error": error
      };
    });
  }
}
