import { SfdxCommand } from '@salesforce/command';
import { Messages } from '@salesforce/core';
// import { MdapiRetrieveUtility } from '../../../scripts/mdapi-retrieve-utility';

Messages.importMessagesDirectory(__dirname);

const messages = Messages.loadMessages('sfdx-ext', 'mdapi-convert');

export default class Convert extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `
    $ sfdx ext:mdapi:convert --targetusername user@example.com --apiversion 46.0
    `,
    `
    $ sfdx ext:mdapi:convert --targetusername user@example.com
    `
  ];

  protected static flagsConfig = {
  };

  // requires user alias
  protected static requiresUsername = false;
  protected static requiresProject = false;

  public async run(): Promise<any> {

    let default_api_version: string = '46.0';
    let apiversion: string = this.flags.apiversion || default_api_version;

    /* if (projectDirectory === undefined) {
      throw new SfdxError(messages.getMessage('errorProjectDirectoryRequired', []));
    } */

    console.log("-----------------------------");
    console.log("sfdx ext:mdapi:convert");
    console.log("-----------------------------");
    console.log("apiversion       : " + apiversion);
    console.log("-----------------------------");

    /* let refreshUtil = new MdapiRefreshUtility(
      username,
      apiversion,
      ignorebackup,
      ignoremanaged,
      ignorenamespaces,
      manifestonly);

    refreshUtil.process().then(() => {
      this.ux.log('success');
      return { "status": 'success' };
    }, (error: any) => {
      this.ux.error(error);
      return {
        "status": 'error',
        "error": error
      };
    }); */
  }
}
