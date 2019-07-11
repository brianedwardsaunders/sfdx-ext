/**
 * @name Retrieve (mdapi)
 * @author brianewardsaunders 
 * @date 2019-07-10
 */
import { SfdxCommand, flags } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import { MdapiRetrieveUtility } from '../../../scripts/mdapi-retrieve-utility';

Messages.importMessagesDirectory(__dirname);

const messages = Messages.loadMessages('sfdx-ext', 'mdapi-retrieve');

export default class Retrieve extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `
    $ sfdx ext:mdapi:retrieve --targetusername user@example.com --apiversion 46.0 --ignorebackup --ignoreinstalled --ignorenamespaces --ignorehidden --ignorefolders --ignorestaticresources --manifestonly --stagemode
    `,
    `
    $ sfdx ext:mdapi:retrieve -u user@example.com -b -i -n -h -f -s -x
    `
    ,
    `
    $ sfdx ext:mdapi:retrieve -u user@example.com -z
    `
    ,
    `
    $ sfdx ext:mdapi:retrieve --targetusername user@example.com
    `
  ];

  protected static flagsConfig = {
    ignorebackup: flags.boolean({ char: 'b', description: messages.getMessage('ignorebackupFlagDescription') }),
    ignoreinstalled: flags.boolean({ char: 'i', description: messages.getMessage('ignoreinstalledFlagDescription') }),
    ignorenamespaces: flags.boolean({ char: 'n', description: messages.getMessage('ignorenamespacesFlagDescription') }),
    ignorehidden: flags.boolean({ char: 'h', description: messages.getMessage('ignorehiddenFlagDescription') }),
    ignorefolders: flags.boolean({ char: 'f', description: messages.getMessage('ignorefoldersFlagDescription') }),
    ignorestaticresources: flags.boolean({ char: 's', description: messages.getMessage('ignorestaticresourcesFlagDescription') }),
    manifestonly: flags.boolean({ char: 'x', description: messages.getMessage('manifestonlyFlagDescription') }),
    stagemode: flags.boolean({ char: 'z', description: messages.getMessage('stagemodeFlagDescription') })
  };

  protected static requiresUsername = true;
  protected static requiresProject = false;

  public async run(): Promise<any> {

    let defaultApiVersion: string = await this.org.retrieveMaxApiVersion();
    let username: string = this.flags.targetusername;
    let apiversion: string = this.flags.apiversion || defaultApiVersion;
    let ignorebackup: boolean = this.flags.ignorebackup || false;
    let ignoreinstalled: boolean = this.flags.ignoreinstalled || false;
    let ignorenamespaces: boolean = this.flags.ignorenamespaces || false;
    let ignorehidden: boolean = this.flags.ignorehidden || false;
    let ignorefolders: boolean = this.flags.ignorefolders || false;
    let ignorestaticresources: boolean = this.flags.ignorestaticresources || false;
    let manifestonly: boolean = this.flags.manifestonly || false;
    let stagemode: boolean = this.flags.stagemode || false; // default
    let devmode: boolean = !stagemode;

    this.ux.log("-----------------------------");
    this.ux.log("sfdx ext:mdapi:retrieve");
    this.ux.log("-----------------------------");
    this.ux.log("targetusername        : " + username);
    this.ux.log("apiversion            : " + apiversion);
    this.ux.log("ignorebackup          : " + ignorebackup);
    this.ux.log("ignoreinstalled       : " + ignoreinstalled);
    this.ux.log("ignorenamespaces      : " + ignorenamespaces);
    this.ux.log("ignorehidden          : " + ignorehidden);
    this.ux.log("ignorefolders         : " + ignorefolders);
    this.ux.log("ignorestaticresources : " + ignorestaticresources);
    this.ux.log("manifestonly          : " + manifestonly);
    this.ux.log("retrievemode          : " + (devmode ? 'dev': 'stage'));
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
      devmode);

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
