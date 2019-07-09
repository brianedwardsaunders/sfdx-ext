import { SfdxCommand, flags } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import { PackageSyncUtility } from '../../../scripts/package-sync-utility';

Messages.importMessagesDirectory(__dirname);

const messages = Messages.loadMessages('sfdx-ext', 'package-sync');

export default class Sync extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `
    $ sfdx ext:package:sync --sourceusername user@sourceorg.com --targetusername user@targetorg.com
    `,
    `
    $ sfdx ext:package:sync --sourceusername user@sourceorg.com --targetusername user@targetorg.com --compareonly --installonly --uninstallonly --syncpackages
    `
  ];

  protected static flagsConfig = {
    sourceusername: flags.string({ char: 's', description: messages.getMessage('sourceusernameFlagDescription') }),
    compareonly: flags.string({ char: 'c', description: messages.getMessage('compareonlyFlagDescription') }),
    installonly: flags.boolean({ char: 'i', description: messages.getMessage('installonlyFlagDescription') }),
    uninstallonly: flags.boolean({ char: 'u', description: messages.getMessage('uninstallonlyFlagDescription') }),
    syncpackages: flags.boolean({ char: 'z', description: messages.getMessage('syncpackagesFlagDescription') })
  };

  // requires user alias
  protected static requiresUsername = true;
  protected static supportsDevhubUsername = false;
  protected static requiresProject = true; // sfdx dependency otherwise don't really need this

  public async run(): Promise<any> {

    let sourceusername: string = this.flags.sourceusername;
    let targetusername: string = this.flags.targetusername;
    let compareonly: boolean = this.flags.compareonly || false;
    let installonly: boolean = this.flags.installonly || false;
    let uninstallonly: boolean = this.flags.uninstallonly || false;
    let syncpackages: boolean = this.flags.syncpackages || false;

    compareonly = !(installonly || uninstallonly || syncpackages);

    if (sourceusername === undefined) {
      throw new SfdxError(messages.getMessage('errorSourceusernameRequired'));
    }// end else

    console.log("-----------------------------");
    console.log("sfdx ext:package:sync");
    console.log("-----------------------------");
    console.log("sourceusername  : " + sourceusername);
    console.log("targetusername  : " + targetusername);
    console.log("compareonly     : " + compareonly);
    console.log("installonly     : " + installonly);
    console.log("uninstallonly   : " + uninstallonly);
    console.log("syncpackages    : " + syncpackages);
    console.log("-----------------------------");

    let packageSyncUtil = new PackageSyncUtility(
      sourceusername,
      targetusername,
      compareonly,
      installonly,
      uninstallonly,
      syncpackages);

    packageSyncUtil.process().then(() => {
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
