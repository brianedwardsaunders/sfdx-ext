import { existsSync, mkdirSync, removeSync, copySync } from "fs-extra";

const exec = require('child_process').exec;

/* export interface PackageVersion {
    SubscriberPackageName: string;
    SubscriberPackageId: string;
    SubscriberPackageVersionId: string;
    SubscriberPackageVersionNumber: string;
    action?: string; // injected
} */

export class SourceChangesetUtility {

    //const force_app = 'force-app'; // for pilot sticking to default
    protected stageRoot: string = 'stage';
    protected configDir: string = 'config';
    protected deployDir: string = 'deploy';
    protected srcDir: string = 'src';
    protected backupExt: string = '.backup';

    protected sourceBaseDir: string;
    protected targetBaseDir: string;
    protected sourceSfdxDir: string;
    protected sourceSfdxDirBackup: string;
    protected sourceConfigDir: string;
    protected targetSfdxDir: string;
    protected sourceDeployDir: string;
    protected sourceDeployDirTarget: string;

    protected UTF8 = 'utf8';
    protected convertOptions: Object = { compact: true, spaces: 4 };
    protected bufferOptions: Object = { maxBuffer: 10 * 1024 * 1024 };

    constructor(
        protected sourceOrgAlias: string, // left
        protected targetOrgAlias: string, // right
        protected apiVersion: string,
        protected projectDirectory: string,
        protected sfdxDirectory: string) {
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

    // because diff is left sfdx destructive return left to original state
    protected checkLocalBackupAndRestore() {
        console.log('checking for local backup [' + this.sourceSfdxDirBackup + '] ...');
        if (!existsSync(this.sourceSfdxDirBackup)) { // first time
            mkdirSync(this.sourceSfdxDirBackup);
            copySync(this.sourceSfdxDir, this.sourceSfdxDirBackup);
            console.log('Initial backup [' + this.sourceSfdxDirBackup + '] created.');
        }
        else {
            console.log('restoring [' + this.sourceSfdxDir + '] from local backup ' + this.sourceSfdxDirBackup);
            removeSync(this.sourceSfdxDir);
            mkdirSync(this.sourceSfdxDir);
            copySync(this.sourceSfdxDirBackup, this.sourceSfdxDir);
            console.log('backup [' + this.sourceSfdxDir + '] restored.');
        }
    }

    protected setupFolders(): void {

        // e.g. stage/DevOrg/MyProject
        this.sourceBaseDir = (this.stageRoot + '/' + this.sourceOrgAlias + '/' + this.projectDirectory);

        // e.g. stage/ReleaseOrg/MyProject
        this.targetBaseDir = (this.stageRoot + '/' + this.targetOrgAlias + '/' + this.projectDirectory);

        // e.g. stage/DevOrg/MyProject/force-app
        this.sourceSfdxDir = (this.sourceBaseDir + '/' + this.sfdxDirectory);

        // e.g. stage/DevOrg/MyProject/force-app.backup
        this.sourceSfdxDirBackup = (this.sourceSfdxDir + this.backupExt);

        // e.g. stage/DevOrg/MyProject/config
        this.sourceConfigDir = (this.sourceBaseDir + '/' + this.configDir);

        // e.g. stage/ReleaseOrg/MyProject/force-app
        this.targetSfdxDir = (this.targetBaseDir + '/' + this.sfdxDirectory);

        // e.g. stage/DevOrg/MyProject/deploy
        this.sourceDeployDir = (this.sourceBaseDir + '/' + this.deployDir);

        // e.g. stage/DevOrg/MyProject/deploy/
        this.sourceDeployDirTarget = (this.sourceDeployDir + '/' + this.targetOrgAlias);

        // check deploy exists else create
        if (!existsSync(this.sourceDeployDir)) {
            mkdirSync(this.sourceDeployDir);
        }

        // delete old staging deploy folder
        if (existsSync(this.sourceDeployDirTarget)) {
            removeSync(this.sourceDeployDirTarget);
            console.info('source deploy target directory: [' + this.sourceDeployDirTarget + '] cleaned.');
        }

        // create staging deploy folder
        mkdirSync(this.sourceDeployDirTarget);
        console.info(this.sourceDeployDirTarget + ' directory created.');

    }// end method

    public async process(): Promise<any> {

        this.setupFolders();

        this.checkLocalBackupAndRestore();

        // await this.compareSyncPackages();
    }// end process
};
