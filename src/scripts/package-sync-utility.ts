/**
 * @author brianewardsaunders 
 * @date 2019-07-10
 */
const exec = require('child_process').exec;

export interface PackageVersion {
    SubscriberPackageName: string;
    SubscriberPackageId: string;
    SubscriberPackageVersionId: string;
    SubscriberPackageVersionNumber: string;
    action?: string; // injected
}

export class PackageSyncUtility {

    protected bufferOptions: Object = { maxBuffer: 10 * 1024 * 1024 };

    protected leftPackageList: Array<PackageVersion> = [];
    protected rightPackageList: Array<PackageVersion> = [];
    protected diffPackageList: Array<PackageVersion> = [];
    protected matchPackageList: Array<PackageVersion> = [];

    // works on principle left migrates to right so descructive rules should also apply.
    protected actionInstall = "install";
    protected actionUninstall = "uninstall";
    protected actionNone = "none";

    constructor(
        protected sourceOrgAlias: string, // left
        protected targetOrgAlias: string, // right
        protected flagCheckOnly: boolean,
        protected flagInstallOnly: boolean,
        protected flagUninstallOnly: boolean,
        protected flagSync: boolean) {
        // noop
    }// end constructor

    protected command(cmd: string): Promise<any> {

        return new Promise((resolve, reject) => {
            exec(cmd, this.bufferOptions, (error: any, stdout: any, stderr: any) => {
                if (error) {
                    console.debug(stderr);
                    reject(error);
                }// end if
                else {
                    resolve(stdout);
                }// end else
            });
        });

    }// end method

    // compare the packages
    protected comparePackageList(): void {

        // left to right
        for (var i = 0; i < this.leftPackageList.length; i++) {

            let leftPackage: PackageVersion = this.leftPackageList[i];
            let found: boolean = false;

            for (var j = 0; j < this.rightPackageList.length; j++) {

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
        for (var x = 0; x < this.rightPackageList.length; x++) {

            let rightPackage: PackageVersion = this.rightPackageList[x];
            let found: boolean = false;

            for (var y = 0; y < this.leftPackageList.length; y++) {

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
    protected async syncPackages(): Promise<any> {

        let counter: number = 0;
        let total: number = 0;

        return new Promise((resolve, reject) => {

            total = this.diffPackageList.length;
            counter = total;

            if (total === 0) {
                resolve("Check or Update of (" + total + ") Package(s) complete.");
                return;
            }// end if

            this.diffPackageList.forEach(diffPackage => {

                let canInstall: boolean = (!this.flagCheckOnly && (this.flagInstallOnly || this.flagSync));
                let canUninstall: boolean = (!this.flagCheckOnly && (this.flagUninstallOnly || this.flagSync));
                let commandSfdxPackageUpdate: string = null;
                let executeCommand: boolean = true;

                if ((diffPackage.action === this.actionInstall) && canInstall) {
                    console.info('Installing ' + diffPackage.SubscriberPackageName + ' (' + diffPackage.SubscriberPackageVersionNumber + ') in ' + this.targetOrgAlias + ' please standby ...');
                    commandSfdxPackageUpdate = "sfdx force:package:install --package " + diffPackage.SubscriberPackageVersionId + " -u " + this.targetOrgAlias + " -w 10 --json";
                }// end if
                else if ((diffPackage.action === this.actionUninstall) && canUninstall) {
                    console.info('Uninstalling ' + diffPackage.SubscriberPackageName + ' (' + diffPackage.SubscriberPackageVersionNumber + ') in ' + this.targetOrgAlias + ' please standby ...');
                    commandSfdxPackageUpdate = "sfdx force:package:uninstall --package " + diffPackage.SubscriberPackageVersionId + " -u " + this.targetOrgAlias + " -w 10 --json";
                } // end else if
                else {
                    console.info('Ignoring action (' + diffPackage.action + ') ' + diffPackage.SubscriberPackageName + ' (' + diffPackage.SubscriberPackageVersionNumber + ') in ' + this.targetOrgAlias + ' please standby ...');
                    executeCommand = false;
                    if (--counter <= 0) {
                        resolve("Check/Update of (" + total + ") Package(s) complete.");
                    }
                }// end else

                // execute resolved command
                if (executeCommand) {
                    console.info(commandSfdxPackageUpdate);
                    this.command(commandSfdxPackageUpdate).then((result: any) => {
                        console.info(result);
                        if (--counter <= 0) {
                            resolve("Check/Update of (" + total + ") Package(s) complete.");
                        }
                    }, (error: any) => {
                        reject(error);
                    });
                }
            });
        });
    }// end method

    /* export default extends Command {
      async run() {
        await packageInstalledList.run()
      }
    } */
    // process compareSyncPackages
    protected async compareSyncPackages(): Promise<any> {

        return new Promise((resolve, reject) => {
            // get packagelist on left as json
            const commandSfdxLeftPackageList = 'sfdx force:package:installed:list -u ' + this.sourceOrgAlias + ' --json';

            //commandSfdxLeftPackageList 
            console.info('retrieving installed packages from ' + this.sourceOrgAlias + ' please standby ...');
            console.info(commandSfdxLeftPackageList);

            // packageInstalledList.run(); 

            this.command(commandSfdxLeftPackageList).then((result: any) => {

                console.info(result);
                let jsonObject = JSON.parse(result);
                this.leftPackageList = jsonObject.result;

                // commandSfdxRightPackageList 
                const commandSfdxRightPackageList = 'sfdx force:package:installed:list -u ' + this.targetOrgAlias + ' --json';
                console.info('retrieving installed packages from ' + this.targetOrgAlias + ' please standby ...');
                console.info(commandSfdxRightPackageList);

                this.command(commandSfdxRightPackageList).then((result: any) => {

                    console.info(result);
                    let jsonObject = JSON.parse(result);
                    this.rightPackageList = jsonObject.result;

                    this.comparePackageList();
                    console.log('diffPackageList: ', this.diffPackageList);

                    // syncPackages
                    this.syncPackages().then((result: any) => {
                        console.log(result);
                        resolve(result);
                    }, (error: any) => {
                        console.error(error);
                        reject(error);
                    });

                }, (error: any) => {
                    console.error(error);
                    reject(error);
                });

            }, (error: any) => {
                console.error(error);
                reject(error);
            });

        });

    }// end method

    public async process(): Promise<any> {
        await this.compareSyncPackages();
    }// end process
};
