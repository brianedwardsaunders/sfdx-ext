/**
 * @name PackageSyncUtility
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

import { UX } from "@salesforce/command";
import { MdapiCommon } from './mdapi-common';

export interface PackageVersion {
    SubscriberPackageName: string;
    SubscriberPackageId: string;
    SubscriberPackageVersionId: string;
    SubscriberPackageVersionNumber: string;
    action?: string; // injected
}

export class PackageSyncUtility {

    protected leftPackageList: Array<PackageVersion> = [];
    protected rightPackageList: Array<PackageVersion> = [];
    protected diffPackageList: Array<PackageVersion> = [];
    protected matchPackageList: Array<PackageVersion> = [];

    // works on principle left migrates to right so descructive rules should also apply.
    protected actionInstall = "install";
    protected actionUninstall = "uninstall";
    protected actionNone = "none";

    constructor(
        protected ux: UX,
        protected sourceOrgAlias: string, // left
        protected targetOrgAlias: string, // right
        protected flagCheckOnly: boolean,
        protected flagInstallOnly: boolean,
        protected flagUninstallOnly: boolean,
        protected flagSync: boolean) {
        // noop
    }// end constructor

    // compare the packages
    protected comparePackageList(): void {

        // left to right
        for (let i: number = 0; i < this.leftPackageList.length; i++) {

            let leftPackage: PackageVersion = this.leftPackageList[i];
            let found: boolean = false;

            for (let j: number = 0; j < this.rightPackageList.length; j++) {

                let rightPackage = this.rightPackageList[j];

                if (leftPackage.SubscriberPackageId === rightPackage.SubscriberPackageId) {
                    if (leftPackage.SubscriberPackageVersionId === rightPackage.SubscriberPackageVersionId) {
                        found = true;
                        break;
                    }// end if
                }// end if
            }// end for

            if (!found) {
                leftPackage.action = this.actionInstall;
                this.diffPackageList.push(leftPackage);
            } else {
                leftPackage.action = this.actionNone;
                this.matchPackageList.push(leftPackage);
            } // end else 

        }// end for

        // right to left
        for (let x: number = 0; x < this.rightPackageList.length; x++) {

            let rightPackage: PackageVersion = this.rightPackageList[x];
            let found: boolean = false;

            for (let y: number = 0; y < this.leftPackageList.length; y++) {

                let leftPackage = this.leftPackageList[y];

                if (rightPackage.SubscriberPackageId === leftPackage.SubscriberPackageId) {
                    found = true;
                    break;
                }// end if

            }// end for

            if (!found) {
                rightPackage.action = this.actionUninstall;
                this.diffPackageList.push(rightPackage);
            }// end if 

        }// end for

    }// end method

    // syncPackage by installing or uninstalling
    protected async syncPackages(): Promise<string> {

        return new Promise((resolve, reject) => {

            let counter: number = 0;
            counter = this.diffPackageList.length;
            let total: number = counter;

            if (total === 0) {
                resolve("check/update of (" + total + ") package(s) complete");
                return;
            }// end if

            this.diffPackageList.forEach(diffPackage => {

                let canInstall: boolean = (!this.flagCheckOnly && (this.flagInstallOnly || this.flagSync));
                let canUninstall: boolean = (!this.flagCheckOnly && (this.flagUninstallOnly || this.flagSync));
                let commandSfdxPackageUpdate: string = null;
                let executeCommand: boolean = true;

                if ((diffPackage.action === this.actionInstall) && canInstall) {
                    this.ux.log('installing ' + diffPackage.SubscriberPackageName + ' (' + diffPackage.SubscriberPackageVersionNumber + ') in ' + this.targetOrgAlias + ' please standby...');
                    commandSfdxPackageUpdate = "sfdx force:package:install --package " + diffPackage.SubscriberPackageVersionId + " -u " + this.targetOrgAlias + " -w 10 --json";
                }// end if
                else if ((diffPackage.action === this.actionUninstall) && canUninstall) {
                    this.ux.log('uninstalling ' + diffPackage.SubscriberPackageName + ' (' + diffPackage.SubscriberPackageVersionNumber + ') in ' + this.targetOrgAlias + ' please standby...');
                    commandSfdxPackageUpdate = "sfdx force:package:uninstall --package " + diffPackage.SubscriberPackageVersionId + " -u " + this.targetOrgAlias + " -w 10 --json";
                } // end else if
                else {
                    this.ux.log('ignoring action (' + diffPackage.action + ') ' + diffPackage.SubscriberPackageName + ' (' + diffPackage.SubscriberPackageVersionNumber + ') in ' + this.targetOrgAlias + ' please standby...');
                    executeCommand = false;
                    if (--counter <= 0) {
                        resolve("check/update of (" + total + ") package(s) complete");
                    }// end if
                }// end else

                // execute resolved command
                if (executeCommand) {
                    this.ux.log(commandSfdxPackageUpdate);
                    MdapiCommon.command(commandSfdxPackageUpdate).then((result: any) => {
                        this.ux.log(result);
                        if (--counter <= 0) {
                            resolve("check/update of (" + total + ") package(s) complete");
                        }// end if
                    }, (error: any) => {
                        reject(error);
                    });
                }
            });
        });
    }// end method

    // process compareSyncPackages
    protected async compareSyncPackages(): Promise<void> {

        return new Promise((resolve, reject) => {
            // get packagelist on left as json
            let commandSfdxLeftPackageList: string = 'sfdx force:package:installed:list -u ' + this.sourceOrgAlias + ' --json';
            //this.ux.log(commandSfdxLeftPackageList);
            //commandSfdxLeftPackageList 
            this.ux.startSpinner('retrieving installed packages from ' + this.sourceOrgAlias);

            MdapiCommon.command(commandSfdxLeftPackageList).then((result: any) => {

                this.ux.stopSpinner();
                this.ux.log(result);
                let jsonObject: Object = JSON.parse(result);
                this.leftPackageList = jsonObject["result"];

                // commandSfdxRightPackageList 
                let commandSfdxRightPackageList: string = 'sfdx force:package:installed:list -u ' + this.targetOrgAlias + ' --json';
                //this.ux.log(commandSfdxRightPackageList);
                this.ux.startSpinner('retrieving installed packages from ' + this.targetOrgAlias);

                MdapiCommon.command(commandSfdxRightPackageList).then((result: any) => {

                    this.ux.stopSpinner();
                    this.ux.log(result);
                    let jsonObject: Object = JSON.parse(result);
                    this.rightPackageList = jsonObject["result"];

                    this.comparePackageList();
                    if (this.diffPackageList.length > 0) {
                        this.ux.logJson(this.diffPackageList);
                    }// end if
                    this.ux.log('(' + this.diffPackageList.length + ') installed package version difference(s) found');

                    // syncPackages
                    this.ux.startSpinner('syncPackages');
                    this.syncPackages().then((result: string) => {
                        this.ux.stopSpinner();
                        this.ux.log(result);
                        resolve();
                    }, (error: any) => {
                        this.ux.error(error);
                        reject(error);
                    });

                }, (error: any) => {
                    this.ux.error(error);
                    reject(error);
                });

            }, (error: any) => {
                this.ux.error(error);
                reject(error);
            });

        });

    }// end method

    public async process(): Promise<any> {
        await this.compareSyncPackages();
    }// end process

}// end class
