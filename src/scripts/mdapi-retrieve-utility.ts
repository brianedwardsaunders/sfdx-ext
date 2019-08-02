/**
 * @name MdapiRetrieveUtility
 * @author brianewardsaunders 
 * @date 2019-07-10
 * @acknowledgement amtrack/force-dev-tool (author acknowledgement)
 */

import {
    existsSync, mkdirSync, removeSync, unlinkSync, mkdirp, createWriteStream, copyFileSync, copySync, rename
} from 'fs-extra';
import {
    ListMetadataQuery, FileProperties
} from 'jsforce';

import path = require('path');
import yauzl = require('yauzl');
import { Org } from '@salesforce/core';
import { UX } from '@salesforce/command';
import { MdapiConfig, IConfig, ISettings } from './mdapi-config';
import { MdapiCommon } from './mdapi-common';

export interface BatchCtrl {
    counter: number;
    resolve: Function;
    reject: Function;
}

export interface Params {
    metaType: string;
    folder?: string;
}

export class MdapiRetrieveUtility {

    constructor(
        protected org: Org,
        protected ux: UX,
        protected orgAlias: string,
        protected apiVersion: string,
        protected ignoreBackup: boolean,
        protected ignoreInstalled: boolean,
        protected ignoreNamespaces: boolean,
        protected ignoreHiddenOrNonEditable: boolean,
        protected ignoreFolders: boolean,
        protected ignoreStaticResources: boolean,
        protected manifestOnly: boolean,
        protected devMode: boolean) {
        // noop
    }// end constructor

    // define working folders
    protected stageOrgAliasDirectoryPath: string = (MdapiCommon.stageRoot + MdapiCommon.PATH_SEP + this.orgAlias);
    protected retrievePath: string = (this.stageOrgAliasDirectoryPath + MdapiCommon.PATH_SEP + MdapiCommon.retrieveRoot);
    protected zipFilePath: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip);
    protected targetDirectoryUnpackaged: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedFolder);
    protected targetDirectorySource: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);
    protected manifestDirectory: string = (this.stageOrgAliasDirectoryPath + MdapiCommon.PATH_SEP + MdapiConfig.manifestFolder);
    protected filePackageXmlPath = (this.manifestDirectory + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);

    protected config: IConfig;
    protected settings: ISettings;

    protected BATCH_SIZE: number = 30;
    protected transientMetadataTypes: Array<string> = [];

    protected listMetadataFolderBatch(config: IConfig, metaType: string): Promise<void> {

        return new Promise((resolve, reject) => {

            try {

                let folderType: string = MdapiConfig.metadataTypeFolderLookup[metaType];
                let folderArray: Array<FileProperties> = config.metadataObjectMembersLookup[folderType];

                let counter: number = 0;

                let batchCtrl = <BatchCtrl>{
                    "counter": counter,
                    "resolve": resolve,
                    "reject": reject
                };

                if (folderArray && (folderArray.length > 0)) {

                    for (let x: number = 0; x < folderArray.length; x++) {

                        let folderName: string = folderArray[x].fullName;

                        let params = <Params>{
                            "metaType": metaType,
                            "folder": folderName
                        };

                        batchCtrl.counter = ++counter;

                        // inject the folder before
                        config.metadataObjectMembersLookup[metaType].push(
                            folderArray[x]
                        );

                        this.queryListMetadata(params, batchCtrl);

                    }// end for

                }// end if
                else {
                    batchCtrl.resolve();
                }// end else

            } catch (exception) {
                this.ux.log(exception);
                reject(exception);
            };

        });// end promse

    }// end method

    // create backup of retrieve meta in-case needed later
    protected backup(): void {

        let iso: string = new Date().toISOString();
        iso = iso.replace(/:/g, MdapiCommon.DASH).split(MdapiCommon.DOT)[0];

        let backupFolder: string = (MdapiCommon.backupRoot + MdapiCommon.PATH_SEP + this.orgAlias); // e.g. backup/DevOrg
        let backupOrgFolder: string = (backupFolder + MdapiCommon.PATH_SEP + iso); // e.g. backup/DevOrg/2000-00-00T11-11-11
        let backupProjectFile: string = (backupOrgFolder + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip);
        let sourceProjectFile: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip);

        if (!this.ignoreBackup) {

            if (!existsSync(MdapiCommon.backupRoot)) {
                mkdirSync(MdapiCommon.backupRoot);
            }// end if

            if (!existsSync(backupFolder)) {
                mkdirSync(backupFolder);
            }// end if

            if (!existsSync(backupOrgFolder)) {
                mkdirSync(backupOrgFolder);
            }// end if

            this.ux.log('backing up from ' + sourceProjectFile + ' to ' + backupProjectFile);
            copyFileSync(sourceProjectFile, backupProjectFile);
            this.ux.log('backup finished to file ' + backupProjectFile);

        }// end if

        if (existsSync(sourceProjectFile)) {
            unlinkSync(sourceProjectFile);
            this.ux.log('deleting file ' + sourceProjectFile);
        }// end if

    }// end method

    protected async unzipUnpackaged(): Promise<void> {

        return new Promise((resolve, reject) => {

            this.ux.log('unzipping ' + this.zipFilePath);

            yauzl.open(this.zipFilePath, { lazyEntries: true }, (openErr, zipfile) => {

                if (openErr) {
                    return reject(openErr);
                }// end if

                zipfile.readEntry();

                zipfile.once("close", () => {
                    this.ux.log('unzipping complete');
                    resolve();
                });// end close

                zipfile.on("entry", (entry: any) => {
                    zipfile.openReadStream(entry, (unzipErr, readStream) => {
                        if (unzipErr) {
                            return reject(unzipErr);
                        }// end if
                        else if (/\/$/.test(entry.fileName)) { // read directory
                            zipfile.readEntry();
                            return;
                        }// end else if
                        let outputDir = path.join(this.targetDirectoryUnpackaged, path.dirname(entry.fileName));
                        let outputFile = path.join(this.targetDirectoryUnpackaged, entry.fileName);
                        mkdirp(outputDir, (mkdirErr: any) => {
                            if (mkdirErr) {
                                return reject(mkdirErr);
                            }// end if
                            readStream.pipe(createWriteStream(outputFile));
                            readStream.on("end", () => {
                                zipfile.readEntry();
                            });
                        }); // end mkdirp
                    }); // end open stream 
                }); // end on
            }); // end open
        }); // end promise 

    }// end method

    protected async setupRetrieveDirectory(): Promise<void> {

        this.ux.log('refreshing retrieve directory: ' + this.retrievePath);

        if (existsSync(this.retrievePath)) {
            removeSync(this.retrievePath);
        }// end if

        mkdirSync(this.retrievePath);

        this.ux.log('retrieve directory created');

    }// end method.

    protected async retrieveMetadata(): Promise<void> {

        await this.setupRetrieveDirectory();

        return new Promise((resolve, reject) => {

            let retrieveCommand: string = ('sfdx force:mdapi:retrieve -s -k ' + this.filePackageXmlPath
                + ' -r ' + this.retrievePath + ' -w -1 -u ' + this.orgAlias);

            MdapiCommon.command(retrieveCommand).then((result: any) => {

                this.ux.log(result);
                resolve();

            }, (error: any) => {
                this.ux.error(error);
                reject(error);
            });

        }); // end promise

    }// end method

    protected packageFile(): void {

        if (!existsSync(this.manifestDirectory)) {
            mkdirSync(this.manifestDirectory);
            this.ux.log('created manifest directory: ' + this.manifestDirectory);
        }// end if

        MdapiConfig.createPackageFile(this.config, this.settings, this.filePackageXmlPath);

    }// end method

    protected init(): void {

        // setup config and setting properties
        this.config = MdapiConfig.createConfig();
        this.settings = MdapiConfig.createSettings();

        this.settings.ignoreHiddenOrNonEditable = this.ignoreHiddenOrNonEditable;
        this.settings.ignoreInstalled = this.ignoreInstalled;
        this.settings.ignoreNamespaces = this.ignoreNamespaces;
        this.settings.ignoreStaticResources = this.ignoreStaticResources;
        this.settings.ignoreFolders = this.ignoreFolders;
        this.settings.apiVersion = this.apiVersion;

        if (!existsSync(MdapiCommon.stageRoot)) {
            mkdirSync(MdapiCommon.stageRoot);
            this.ux.log('staging ' + MdapiCommon.stageRoot + ' directory created');
        }// end if

        // check if working directory exists
        if (!existsSync(this.stageOrgAliasDirectoryPath)) {
            mkdirSync(this.stageOrgAliasDirectoryPath);
            this.ux.log('staging alias ' + this.stageOrgAliasDirectoryPath + ' directory created');
        }// end if

    }// end method

    protected async unzip(): Promise<void> {

        if (existsSync(this.targetDirectorySource)) {
            removeSync(this.targetDirectorySource);
        }// end if

        await MdapiConfig.unzipUnpackaged(this.zipFilePath, this.targetDirectoryUnpackaged);

        // rename unmanaged to src
        await rename(this.targetDirectoryUnpackaged, this.targetDirectorySource);

    }// end method

    protected queryListMetadata(params: Params, batchCtrl: BatchCtrl): void {

        let metaQueries: Array<ListMetadataQuery>;

        const metaType: string = params.metaType;
        const folderName: string = params.folder;

        if (folderName) { metaQueries = [{ type: metaType, folder: folderName }]; }
        else { metaQueries = [{ type: metaType }]; }

        this.org.getConnection().metadata.list(metaQueries, this.apiVersion).then((result: Array<FileProperties>) => {

            result = MdapiCommon.objectToArray(result);

            for (let x: number = 0; x < result.length; x++) {

                let metaItem: FileProperties = result[x];

                if (metaItem.manageableState === MdapiConfig.deleted ||
                    metaItem.manageableState === MdapiConfig.deprecated) {
                    this.ux.log('ignoring ' + metaType + ' ' + metaItem.manageableState + ' item ' + metaItem.fullName);
                    continue;
                }// end if

                if (!MdapiConfig.ignoreInstalled(this.settings, metaItem) &&
                    !MdapiConfig.ignoreNamespaces(this.settings, metaItem) &&
                    !MdapiConfig.ignoreHiddenOrNonEditable(this.settings, metaItem)) {
                    this.config.metadataObjectMembersLookup[metaType].push(metaItem);
                }// end if

            }// end for

            if (--batchCtrl.counter <= 0) {
                batchCtrl.resolve();
            }// end if

        }, (error: any) => {
            this.ux.error(error);
            batchCtrl.reject(error);
        });// end promise

    }// end method

    protected listMetadataBatch(): Promise<void> {

        return new Promise((resolve, reject) => {

            let counter: number = 0;

            let batchCtrl = <BatchCtrl>{
                "counter": counter,
                "resolve": resolve,
                "reject": reject
            };

            for (let x: number = 0; x < this.BATCH_SIZE; x++) {

                let metaType: string = this.transientMetadataTypes.pop();

                if (!metaType) {
                    if (batchCtrl.counter <= 0) {
                        resolve();
                        return;
                    } else { continue; }
                }// end if

                batchCtrl.counter = ++counter;

                let params = <Params>{
                    "metaType": metaType
                };

                this.queryListMetadata(params, batchCtrl);

            }// end for

        });// end promse

    }// end method

    protected async listMetadata(): Promise<void> {

        this.transientMetadataTypes = [...this.config.metadataTypes]; // create queue

        while (this.transientMetadataTypes.length > 0) {

            await this.listMetadataBatch();

        }// end while

    }// end method

    protected async listMetadataFolders(): Promise<void> {

        if (!this.ignoreFolders) {

            await this.listMetadataFolderBatch(this.config, MdapiConfig.Dashboard);
            await this.listMetadataFolderBatch(this.config, MdapiConfig.Document);
            await this.listMetadataFolderBatch(this.config, MdapiConfig.EmailTemplate);
            await this.listMetadataFolderBatch(this.config, MdapiConfig.Report);

        }// end if

    }// end method

    protected checkStageOrDevModePackageXml(): void {

        if (this.devMode) {

            copySync(this.filePackageXmlPath, MdapiConfig.packageXml);
            this.ux.log('copied ' + MdapiConfig.packageXml);

        }// end if

    }// end method

    protected checkStageOrDevModeFiles(): void {

        if (this.devMode) {

            if (existsSync(MdapiConfig.srcFolder)) {
                removeSync(MdapiConfig.srcFolder);
            }// end if

            mkdirSync(MdapiConfig.srcFolder);

            copySync(this.targetDirectorySource, MdapiConfig.srcFolder);
            this.ux.log('copied to ' + MdapiConfig.srcFolder);

            if (existsSync(MdapiCommon.stageRoot)) {
                removeSync(MdapiCommon.stageRoot);
                this.ux.log('deleted ' + MdapiCommon.stageRoot);
            }// end if

            removeSync(MdapiCommon.stageRoot);

            if (existsSync(MdapiCommon.backupRoot)) {
                removeSync(MdapiCommon.backupRoot);
                this.ux.log('deleted ' + MdapiCommon.backupRoot);
            }// end if

        }// end if

    }// end method

    public async process(): Promise<void> {

        try {

            // init
            this.ux.startSpinner('initialising');
            this.init();
            this.ux.stopSpinner();

            // async calls
            this.ux.startSpinner('describe metadata');
            await MdapiConfig.describeMetadata(this.org, this.config, this.settings);
            this.ux.stopSpinner();

            this.ux.startSpinner('list metadata');
            await this.listMetadata();
            this.ux.stopSpinner();

            this.ux.startSpinner('list folders');
            await this.listMetadataFolders();
            this.ux.stopSpinner();

            this.ux.startSpinner('resolve personaccount recordtypes');
            await MdapiConfig.resolvePersonAccountRecordTypes(this.org, this.config);
            this.ux.stopSpinner();

            // sync calls
            MdapiConfig.setStandardValueSets(this.config);
            MdapiConfig.repositionSettings(this.config);

            // create package.xml
            this.ux.startSpinner('create package.xml file');
            this.packageFile();
            this.ux.stopSpinner();

            this.checkStageOrDevModePackageXml();

            if (!this.manifestOnly) {

                // retrieve metadata files
                this.ux.startSpinner('retrieve metadata (please standby)');
                await this.retrieveMetadata();
                this.ux.stopSpinner();

                // unzip retrieved zip
                this.ux.startSpinner('unzipping package');
                await this.unzip();
                this.ux.stopSpinner();

                // backup zip
                this.ux.startSpinner('backup zip');
                await this.backup();
                this.ux.stopSpinner();

                // check if staging only or clean for src dev only
                this.ux.startSpinner('finishing up');
                this.checkStageOrDevModeFiles();
                this.ux.stopSpinner();

            }// end client

        } catch (exception) {
            this.ux.error(exception);
        }// end catch

    }// end process

}// end class
