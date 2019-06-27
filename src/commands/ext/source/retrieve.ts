import { SfdxCommand, flags } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import { RetrieveUtility } from '../../../scripts/retrieve-utility';

Messages.importMessagesDirectory(__dirname);

const messages = Messages.loadMessages('sfdx-ext', 'retrieve');

export default class Retrieve extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `
    $ sfdx ext:source:retrieve --projectdirectory MyProject --sfdxdirectory force-app --targetusername user@example.com --apiversion 46.0 --ignorebackup --ignoremanaged --ignorenamespaces
    `,
    `
    $ sfdx ext:source:retrieve --projectdirectory MyProject --targetusername user@example.com
    `
  ];

  protected static flagsConfig = {
    projectdirectory: flags.string({ char: 'p', description: messages.getMessage('projectdirectoryFlagDescription') }),
    sfdxdirectory: flags.string({ char: 'd', description: messages.getMessage('sfdxdirectoryFlagDescription') }),
    ignorebackup: flags.boolean({ char: 'b', description: messages.getMessage('ignorebackupFlagDescription') }),
    ignoremanaged: flags.boolean({ char: 'm', description: messages.getMessage('ignoremanagedFlagDescription') }),
    ignorenamespaces: flags.boolean({ char: 'n', description: messages.getMessage('ignorenamespacesFlagDescription') })
  };

  // requires user alias
  protected static requiresUsername = true;
  protected static supportsDevhubUsername = false;
  protected static requiresProject = false;

  public async run(): Promise<any> {

    let default_force_app: string = 'force-app';
    let default_api_version: string = '46.0';
    let username: string = this.flags.targetusername;
    let projectDirectory: string = this.flags.projectdirectory;
    let apiversion: string = this.flags.apiversion || default_api_version;
    let sfdxDirectory: string = this.flags.sfdxdirectory || default_force_app;
    let ignorebackup: boolean = this.flags.ignorebackup || false;
    let ignoremanaged: boolean = this.flags.ignoremanaged || false;
    let ignorenamespaces: boolean = this.flags.ignorenamespaces || false;

    // throw new SfdxError(messages.getMessage('errorNoOrgResults', [this.org.getOrgId()]));

    console.log("-----------------------------");
    console.log("sfdx ext:source:retrieve");
    console.log("-----------------------------");
    console.log("targetusername   : " + username);
    console.log("apiversion       : " + apiversion);
    console.log("projectdirectory : " + projectDirectory);
    console.log("sfdxdirectory    : " + sfdxDirectory);
    console.log("ignorebackup     : " + ignorebackup);
    console.log("ignoremanaged    : " + ignoremanaged);
    console.log("ignorenamespaces : " + ignorenamespaces);
    console.log("-----------------------------");

    let retrieveUtil = new RetrieveUtility(
      username,
      apiversion,
      projectDirectory,
      sfdxDirectory,
      ignorebackup,
      ignoremanaged,
      ignorenamespaces);

    retrieveUtil.process().then(() => {
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
