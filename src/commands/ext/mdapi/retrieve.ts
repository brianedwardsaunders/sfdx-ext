import { SfdxCommand, flags } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import { MdapiRetrieveUtility } from '../../../scripts/mdapi-retrieve-utility';

Messages.importMessagesDirectory(__dirname);

const messages = Messages.loadMessages('sfdx-ext', 'mdapi-retrieve');

export default class Retrieve extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `
    $ sfdx ext:mdapi:retrieve --targetusername user@example.com --apiversion 46.0 --ignorebackup --ignoremanaged --ignorenamespaces --manifestonly
    `,
    `
    $ sfdx ext:mdapi:retrieve --targetusername user@example.com --stagedirectory .
    `,
    `
    $ sfdx ext:mdapi:retrieve --targetusername user@example.com
    `
  ];

  protected static flagsConfig = {
    stagedirectory: flags.string({ char: 'd', description: messages.getMessage('stageDirectoryFlagDescription') }),
    ignorebackup: flags.boolean({ char: 'b', description: messages.getMessage('ignorebackupFlagDescription') }),
    ignoremanaged: flags.boolean({ char: 'm', description: messages.getMessage('ignoremanagedFlagDescription') }),
    ignorenamespaces: flags.boolean({ char: 'n', description: messages.getMessage('ignorenamespacesFlagDescription') }),
    manifestonly: flags.boolean({ char: 'x', description: messages.getMessage('manifestonlyFlagDescription') })
  };

  // requires user alias
  protected static requiresUsername = true;
  protected static requiresProject = false;

  public async run(): Promise<any> {

    let defaultApiVersion: string = '46.0';
    let defaultStageDirectory: string = 'stage';
    let username: string = this.flags.targetusername;
    let apiversion: string = this.flags.apiversion || defaultApiVersion;
    let ignorebackup: boolean = this.flags.ignorebackup || false;
    let ignoremanaged: boolean = this.flags.ignoremanaged || false;
    let ignorenamespaces: boolean = this.flags.ignorenamespaces || false;
    let manifestonly: boolean = this.flags.manifestonly || false;
    let stagedirectory: string = this.flags.stagedirectory || defaultStageDirectory;

    console.log("-----------------------------");
    console.log("sfdx ext:mdapi:retrieve");
    console.log("-----------------------------");
    console.log("targetusername   : " + username);
    console.log("stagedirectory   : " + stagedirectory);
    console.log("apiversion       : " + apiversion);
    console.log("ignorebackup     : " + ignorebackup);
    console.log("ignoremanaged    : " + ignoremanaged);
    console.log("ignorenamespaces : " + ignorenamespaces);
    console.log("manifestonly     : " + manifestonly);
    console.log("-----------------------------");

    let util = new MdapiRetrieveUtility(
      this.org,
      username,
      stagedirectory,
      apiversion,
      ignorebackup,
      ignoremanaged,
      ignorenamespaces,
      manifestonly);

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
