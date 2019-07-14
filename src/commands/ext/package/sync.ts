/**
 * @name Sync (package versions between orgs)
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

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
    compareonly: flags.boolean({ char: 'c', description: messages.getMessage('compareonlyFlagDescription') }),
    installonly: flags.boolean({ char: 'i', description: messages.getMessage('installonlyFlagDescription') }),
    uninstallonly: flags.boolean({ char: 'x', description: messages.getMessage('uninstallonlyFlagDescription') }),
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

    this.ux.log("-----------------------------");
    this.ux.log("sfdx ext:package:sync");
    this.ux.log("-----------------------------");
    this.ux.log("sourceusername  : " + sourceusername);
    this.ux.log("targetusername  : " + targetusername);
    this.ux.log("compareonly     : " + compareonly);
    this.ux.log("installonly     : " + installonly);
    this.ux.log("uninstallonly   : " + uninstallonly);
    this.ux.log("syncpackages    : " + syncpackages);
    this.ux.log("-----------------------------");

    let util = new PackageSyncUtility(
      this.ux,
      sourceusername,
      targetusername,
      compareonly,
      installonly,
      uninstallonly,
      syncpackages);

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
  }
}// end class
