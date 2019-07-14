/**
 * @name Convert (from mdapi to sfdx source)
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

import { SfdxCommand, flags } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import { MdapiConvertUtility } from '../../../scripts/mdapi-convert-utility';

Messages.importMessagesDirectory(__dirname);

const messages = Messages.loadMessages('sfdx-ext', 'mdapi-convert');

export default class Convert extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `
    $ sfdx ext:mdapi:convert --sourcedirectory mdapi/src --targetdirectory ../sfdx
    `
  ];

  protected static flagsConfig = {
    sourcedirectory: flags.string({ char: 'r', description: messages.getMessage('sourcedirectoryFlagDescription') }),
    targetdirectory: flags.string({ char: 'd', description: messages.getMessage('targetdirectoryFlagDescription') }),
  };

  protected static requiresUsername = false;
  protected static requiresProject = false;

  public async run(): Promise<any> {

    let sourcedirectory: string = this.flags.sourcedirectory;
    let targetdirectory: string = this.flags.targetdirectory;

    if (sourcedirectory === undefined) {
      throw new SfdxError(messages.getMessage('errorSourceDirectoryRequired', []));
    }// end if
    else if (targetdirectory === undefined) {
      throw new SfdxError(messages.getMessage('errorTargetDirectoryRequired', []));
    }// end else if

    this.ux.log("-----------------------------");
    this.ux.log("sfdx ext:mdapi:convert");
    this.ux.log("-----------------------------");
    this.ux.log("sourcedirectory  : " + sourcedirectory);
    this.ux.log("targetdirectory  : " + targetdirectory);
    this.ux.log("-----------------------------");

    let util = new MdapiConvertUtility(
      this.org,
      this.ux,
      sourcedirectory,
      targetdirectory);

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
