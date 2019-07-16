/**
 * @name Convert (from sfdx to mdapi source)
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

import { SfdxCommand, flags } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import { SourceConvertUtility } from '../../../scripts/source-convert-utility';

Messages.importMessagesDirectory(__dirname);

const messages = Messages.loadMessages('sfdx-ext', 'source-convert');

export default class Convert extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `
    $ sfdx ext:mdapi:convert --targetusername user@target.com --sourcedirectory force-app --targetdirectory ../unmanaged
    `,
    `
    $ sfdx ext:mdapi:convert -u user@target.com -r force-app -d ../unmanaged
    `
  ];

  protected static flagsConfig = {
    sourcedirectory: flags.string({ char: 'r', description: messages.getMessage('sourcedirectoryFlagDescription') }),
    targetdirectory: flags.string({ char: 'd', description: messages.getMessage('targetdirectoryFlagDescription') }),
  };

  protected static requiresUsername = true;
  protected static requiresProject = true;

  public async run(): Promise<any> {

    let defaultSourceDirectory: string = 'force-app';
    let defaultApiVersion: string = await this.org.retrieveMaxApiVersion();
    let targetusername: string = this.flags.targetusername;
    let sourcedirectory: string = this.flags.sourcedirectory || defaultSourceDirectory;
    let targetdirectory: string = this.flags.targetdirectory;
    let apiVersion: string = this.flags.apiVersion || defaultApiVersion;

    if (targetdirectory === undefined) {
      throw new SfdxError(messages.getMessage('errorTargetDirectoryRequired', []));
    }// end else if

    this.ux.log("-----------------------------");
    this.ux.log("sfdx ext:source:convert");
    this.ux.log("-----------------------------");
    this.ux.log("targetusername    : " + targetusername);
    this.ux.log("sourcedirectory   : " + sourcedirectory);
    this.ux.log("targetdirectory   : " + targetdirectory);
    this.ux.log("apiVersion        : " + apiVersion);
    this.ux.log("-----------------------------");

    let util = new SourceConvertUtility(
      this.org,
      this.ux,
      sourcedirectory,
      targetdirectory,
      apiVersion);

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
