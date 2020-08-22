/**
 * @name PackageSyncUtility
 * @author brianewardsaunders
 * @date 2019-07-10
 */

import {UX} from "@salesforce/command";
import {MdapiCommon} from "./mdapi-common";

export interface PackageVersion {
    SubscriberPackageName: string;
    SubscriberPackageId: string;
    SubscriberPackageVersionId: string;
    SubscriberPackageVersionNumber: string;
    action?: string; // Injected
}

export class PackageSyncUtility {

    protected leftPackageList: Array<PackageVersion> = [];

    protected rightPackageList: Array<PackageVersion> = [];

    protected diffPackageList: Array<PackageVersion> = [];

    protected matchPackageList: Array<PackageVersion> = [];

    // Works on principle left migrates to right so descructive rules should also apply.
    protected actionInstall = "install";

    protected actionUninstall = "uninstall";

    protected actionNone = "none";

    constructor (
        protected ux: UX,
        protected sourceOrgAlias: string, // Left
        protected targetOrgAlias: string, // Right
        protected flagCheckOnly: boolean, // Return result if diff
        protected flagCheckError: boolean, // Throw error if diff
        protected flagInstallOnly: boolean,
        protected flagUninstallOnly: boolean,
        protected flagSync: boolean
    ) {
        // Noop
    }// End constructor

    // Compare the packages
    protected comparePackageList (): void {

        // Left to right
        for (let i = 0; i < this.leftPackageList.length; i++) {

            let leftPackage: PackageVersion = this.leftPackageList[i],
                found = false;

            for (let j = 0; j < this.rightPackageList.length; j++) {

                let rightPackage = this.rightPackageList[j];

                if (leftPackage.SubscriberPackageId === rightPackage.SubscriberPackageId) {

                    if (leftPackage.SubscriberPackageVersionId === rightPackage.SubscriberPackageVersionId) {

                        found = true;
                        break;

                    }// End if

                }// End if

            }// End for

            if (!found) {

                leftPackage.action = this.actionInstall;
                this.diffPackageList.push(leftPackage);

            } else {

                leftPackage.action = this.actionNone;
                this.matchPackageList.push(leftPackage);

            } // End else

        }// End for

        // Right to left
        for (let x = 0; x < this.rightPackageList.length; x++) {

            let rightPackage: PackageVersion = this.rightPackageList[x],
                found = false;

            for (let y = 0; y < this.leftPackageList.length; y++) {

                let leftPackage = this.leftPackageList[y];

                if (rightPackage.SubscriberPackageId === leftPackage.SubscriberPackageId) {

                    found = true;
                    break;

                }// End if

            }// End for

            if (!found) {

                rightPackage.action = this.actionUninstall;
                this.diffPackageList.push(rightPackage);

            }// End if

        }// End for

    }// End method

    // SyncPackage by installing or uninstalling
    protected async syncPackages (): Promise<string> {

        return new Promise((resolve, reject) => {

            let counter = 0;

            counter = this.diffPackageList.length;
            let total: number = counter;

            if (total === 0) {

                resolve(`check/update of (${total}) package(s) complete`);

                return;

            }// End if

            this.diffPackageList.forEach((diffPackage) => {

                // Making sure flags are set correctly
                let canInstall: boolean = !(this.flagCheckOnly || this.flagCheckError) && (this.flagInstallOnly || this.flagSync),
                    canUninstall: boolean = !(this.flagCheckOnly || this.flagCheckError) && (this.flagUninstallOnly || this.flagSync);
                let commandSfdxPackageUpdate: string = null,
                    executeCommand = true;

                if (diffPackage.action === this.actionInstall && canInstall) {

                    this.ux.log(`installing ${diffPackage.SubscriberPackageName} (${diffPackage.SubscriberPackageVersionNumber}) in ${this.targetOrgAlias} please standby...`);
                    commandSfdxPackageUpdate = `sfdx force:package:install --package ${diffPackage.SubscriberPackageVersionId} -u ${this.targetOrgAlias} -w 10 --json`;

                }// End if
                else if (diffPackage.action === this.actionUninstall && canUninstall) {

                    this.ux.log(`uninstalling ${diffPackage.SubscriberPackageName} (${diffPackage.SubscriberPackageVersionNumber}) in ${this.targetOrgAlias} please standby...`);
                    commandSfdxPackageUpdate = `sfdx force:package:uninstall --package ${diffPackage.SubscriberPackageVersionId} -u ${this.targetOrgAlias} -w 10 --json`;

                } // End else if
                else {

                    this.ux.log(`ignoring action (${diffPackage.action}) ${diffPackage.SubscriberPackageName} (${diffPackage.SubscriberPackageVersionNumber}) in ${this.targetOrgAlias} please standby...`);
                    executeCommand = false;
                    if (--counter <= 0) {

                        resolve(`check/update of (${total}) package(s) complete`);

                    }// End if

                }// End else

                // Execute resolved command
                if (executeCommand) {

                    this.ux.log(commandSfdxPackageUpdate);
                    MdapiCommon.command(commandSfdxPackageUpdate).then(
                        (result: any) => {

                            this.ux.log(result);
                            if (--counter <= 0) {

                                resolve(`check/update of (${total}) package(s) complete`);

                            }// End if

                        },
                        (error: any) => {

                            reject(error);

                        }
                    );

                }

            });

        });

    }// End method

    // Process compareSyncPackages
    protected async compareSyncPackages (): Promise<number> {

        return new Promise((resolve, reject) => {

            // Get packagelist on left as json
            let commandSfdxLeftPackageList = `sfdx force:package:installed:list -u ${this.sourceOrgAlias} --json`;

            /*
             * This.ux.log(commandSfdxLeftPackageList);
             * commandSfdxLeftPackageList
             */

            this.ux.startSpinner(`retrieving installed packages from ${this.sourceOrgAlias}`);

            MdapiCommon.command(commandSfdxLeftPackageList).then(
                (result: any) => {

                    this.ux.stopSpinner();
                    this.ux.log(result);
                    let jsonObject: object = JSON.parse(result);

                    this.leftPackageList = jsonObject.result;

                    // CommandSfdxRightPackageList
                    let commandSfdxRightPackageList = `sfdx force:package:installed:list -u ${this.targetOrgAlias} --json`;
                    // This.ux.log(commandSfdxRightPackageList);

                    this.ux.startSpinner(`retrieving installed packages from ${this.targetOrgAlias}`);

                    MdapiCommon.command(commandSfdxRightPackageList).then(
                        (result: any) => {

                            this.ux.stopSpinner();
                            this.ux.log(result);
                            let jsonObject: object = JSON.parse(result);

                            this.rightPackageList = jsonObject.result;

                            this.comparePackageList();
                            if (this.diffPackageList.length > 0) {

                                this.ux.logJson(this.diffPackageList);

                            }// End if
                            this.ux.log(`(${this.diffPackageList.length}) installed package version difference(s) found`);
                            let diffCount: number = this.diffPackageList.length;

                            if (diffCount > 0 && this.flagCheckError) {

                                this.ux.error("throwing diff package check not zero error and flag checkerror is true");
                                reject(diffCount);

                            }// End if
                            else {

                                // SyncPackages
                                this.ux.startSpinner("syncPackages");
                                this.syncPackages().then(
                                    (result: string) => {

                                        this.ux.stopSpinner();
                                        this.ux.log(result);
                                        resolve(diffCount);

                                    },
                                    (error: any) => {

                                        this.ux.error(error);
                                        reject(error);

                                    }
                                );

                            }// End else

                        },
                        (error: any) => {

                            this.ux.error(error);
                            reject(error);

                        }
                    );

                },
                (error: any) => {

                    this.ux.error(error);
                    reject(error);

                }
            );

        });

    }// End method

    public async process (): Promise<any> {

        return new Promise((resolve, reject) => {

            this.compareSyncPackages().then(
                (result) => {

                    resolve(result);

                },
                (error) => {

                    reject(error);

                }
            );

        });

    }// End process

}// End class
