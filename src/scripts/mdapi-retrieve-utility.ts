/**
 * @name MdapiRetrieveUtility
 * @author brianewardsaunders
 * @date 2019-07-10
 * @acknowledgement amtrack/force-dev-tool (author acknowledgement)
 */

import {
    copyFileSync, copySync, createWriteStream, existsSync, mkdirSync, mkdirp, removeSync, rename, unlinkSync
} from "fs-extra";
import {
    FileProperties, ListMetadataQuery
} from "jsforce";

import path = require("path");
import yauzl = require("yauzl");
import {Org} from "@salesforce/core";
import {UX} from "@salesforce/command";
import {IConfig, ISettings, MdapiConfig} from "./mdapi-config";
import {MdapiCommon} from "./mdapi-common";

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

    constructor (
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
        protected devMode: boolean
    ) {
        // Noop
    }// End constructor

    // Define working folders
    protected stageOrgAliasDirectoryPath: string = (MdapiCommon.stageRoot + MdapiCommon.PATH_SEP + this.orgAlias);

    protected retrievePath: string = (this.stageOrgAliasDirectoryPath + MdapiCommon.PATH_SEP + MdapiCommon.retrieveRoot);

    protected zipFilePath: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip);

    protected targetDirectoryUnpackaged: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedFolder);

    protected targetDirectorySource: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);

    protected manifestDirectory: string = (this.stageOrgAliasDirectoryPath + MdapiCommon.PATH_SEP + MdapiConfig.manifestFolder);

    protected filePackageXmlPath = (this.manifestDirectory + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);

    protected config: IConfig;

    protected settings: ISettings;

    protected BATCH_SIZE = 30;

    protected transientMetadataTypes: Array<string> = [];

    protected listMetadataFolderBatch (config: IConfig, metaType: string): Promise<void> {

        return new Promise((resolve, reject) => {

            try {

                let folderType: string = MdapiConfig.metadataTypeFolderLookup[metaType],
                    folderArray: Array<FileProperties> = config.metadataObjectMembersLookup[folderType],
                    counter = 0,

                    batchCtrl = <BatchCtrl>{
                        counter,
                        resolve,
                        reject
                    };

                if (folderArray && folderArray.length > 0) {

                    for (let x = 0; x < folderArray.length; x++) {

                        let folderName: string = folderArray[x].fullName,

                            params = <Params>{
                                metaType,
                                "folder": folderName
                            };

                        batchCtrl.counter = ++counter;

                        // Inject the folder before
                        config.metadataObjectMembersLookup[metaType].push(folderArray[x]);

                        this.queryListMetadata(
                            params,
                            batchCtrl
                        );

                    }// End for

                }// End if
                else {

                    batchCtrl.resolve();

                }// End else

            } catch (exception) {

                this.ux.log(exception);
                reject(exception);

            }

        });// End promse

    }// End method

    // Create backup of retrieve meta in-case needed later
    protected backup (): void {

        let iso: string = new Date().toISOString();

        iso = iso.replace(
            /:/g,
            MdapiCommon.DASH
        ).split(MdapiCommon.DOT)[0];

        let backupFolder: string = MdapiCommon.backupRoot + MdapiCommon.PATH_SEP + this.orgAlias, // E.g. backup/DevOrg
            backupOrgFolder: string = backupFolder + MdapiCommon.PATH_SEP + iso, // E.g. backup/DevOrg/2000-00-00T11-11-11
            backupProjectFile: string = backupOrgFolder + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip,
            sourceProjectFile: string = this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip;

        if (!this.ignoreBackup) {

            if (!existsSync(MdapiCommon.backupRoot)) {

                mkdirSync(MdapiCommon.backupRoot);

            }// End if

            if (!existsSync(backupFolder)) {

                mkdirSync(backupFolder);

            }// End if

            if (!existsSync(backupOrgFolder)) {

                mkdirSync(backupOrgFolder);

            }// End if

            this.ux.log(`backing up from ${sourceProjectFile} to ${backupProjectFile}`);
            copyFileSync(
                sourceProjectFile,
                backupProjectFile
            );
            this.ux.log(`backup finished to file ${backupProjectFile}`);

        }// End if

        if (existsSync(sourceProjectFile)) {

            unlinkSync(sourceProjectFile);
            this.ux.log(`deleting file ${sourceProjectFile}`);

        }// End if

    }// End method

    protected async unzipUnpackaged (): Promise<void> {

        return new Promise((resolve, reject) => {

            this.ux.log(`unzipping ${this.zipFilePath}`);

            yauzl.open(
                this.zipFilePath,
                {"lazyEntries": true},
                (openErr, zipfile) => {

                    if (openErr) {

                        return reject(openErr);

                    }// End if

                    zipfile.readEntry();

                    zipfile.once(
                        "close",
                        () => {

                            this.ux.log("unzipping complete");
                            resolve();

                        }
                    );// End close

                    zipfile.on(
                        "entry",
                        (entry: any) => {

                            zipfile.openReadStream(
                                entry,
                                (unzipErr, readStream) => {

                                    if (unzipErr) {

                                        return reject(unzipErr);

                                    }// End if
                                    else if ((/\/$/).test(entry.fileName)) { // Read directory

                                        zipfile.readEntry();

                                        return;

                                    }// End else if
                                    let outputDir = path.join(
                                            this.targetDirectoryUnpackaged,
                                            path.dirname(entry.fileName)
                                        ),
                                        outputFile = path.join(
                                            this.targetDirectoryUnpackaged,
                                            entry.fileName
                                        );

                                    mkdirp(
                                        outputDir,
                                        (mkdirErr: any) => {

                                            if (mkdirErr) {

                                                return reject(mkdirErr);

                                            }// End if
                                            readStream.pipe(createWriteStream(outputFile));
                                            readStream.on(
                                                "end",
                                                () => {

                                                    zipfile.readEntry();

                                                }
                                            );

                                        }
                                    ); // End mkdirp

                                }
                            ); // End open stream

                        }
                    ); // End on

                }
            ); // End open

        }); // End promise

    }// End method

    protected async setupRetrieveDirectory (): Promise<void> {

        this.ux.log(`refreshing retrieve directory: ${this.retrievePath}`);

        if (existsSync(this.retrievePath)) {

            removeSync(this.retrievePath);

        }// End if

        mkdirSync(this.retrievePath);

        this.ux.log("retrieve directory created");

    }// End method.

    protected async retrieveMetadata (): Promise<void> {

        await this.setupRetrieveDirectory();

        return new Promise((resolve, reject) => {

            let retrieveCommand = `sfdx force:mdapi:retrieve -s -k ${this.filePackageXmlPath
            } -r ${this.retrievePath} -w -1 -u ${this.orgAlias}`;

            /*
             * Let retrieveCommand: string = ('sfdx force:mdapi:retrieve -k ' + this.filePackageXmlPath
             *     + ' -r ' + this.retrievePath + ' -w -1 -u ' + this.orgAlias);
             */

            MdapiCommon.command(retrieveCommand).then(
                (result: any) => {

                    this.ux.log(result);
                    resolve();

                },
                (error: any) => {

                    this.ux.error(error);
                    reject(error);

                }
            );

        }); // End promise

    }// End method

    protected packageFile (): void {

        if (!existsSync(this.manifestDirectory)) {

            mkdirSync(this.manifestDirectory);
            this.ux.log(`created manifest directory: ${this.manifestDirectory}`);

        }// End if

        MdapiConfig.createPackageFile(
            this.config,
            this.settings,
            this.filePackageXmlPath
        );

    }// End method

    protected init (): void {

        // Setup config and setting properties
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
            this.ux.log(`staging ${MdapiCommon.stageRoot} directory created`);

        }// End if

        // Check if working directory exists
        if (!existsSync(this.stageOrgAliasDirectoryPath)) {

            mkdirSync(this.stageOrgAliasDirectoryPath);
            this.ux.log(`staging alias ${this.stageOrgAliasDirectoryPath} directory created`);

        }// End if

    }// End method

    protected async unzip (): Promise<void> {

        if (existsSync(this.targetDirectorySource)) {

            removeSync(this.targetDirectorySource);

        }// End if

        await MdapiConfig.unzipUnpackaged(
            this.zipFilePath,
            this.targetDirectoryUnpackaged
        );

        // Rename unmanaged to src
        await rename(
            this.targetDirectoryUnpackaged,
            this.targetDirectorySource
        );

    }// End method

    protected queryListMetadata (params: Params, batchCtrl: BatchCtrl): void {

        let metaQueries: Array<ListMetadataQuery>;

        let {metaType} = params,
            folderName: string = params.folder;

        if (folderName) {

            metaQueries = [
                {"type": metaType,
                    "folder": folderName}
            ];

        } else {

            metaQueries = [{"type": metaType}];

        }

        this.org.getConnection().metadata.list(
            metaQueries,
            this.apiVersion
        ).then(
            (result: Array<FileProperties>) => {

                result = MdapiCommon.objectToArray(result);

                for (let x = 0; x < result.length; x++) {

                    let metaItem: FileProperties = result[x];

                    if (metaItem.manageableState === MdapiConfig.deleted ||
                    metaItem.manageableState === MdapiConfig.deprecated) {

                        this.ux.log(`ignoring ${metaType} ${metaItem.manageableState} item ${metaItem.fullName}`);
                        continue;

                    }// End if

                    if (!MdapiConfig.ignoreInstalled(
                        this.settings,
                        metaItem
                    ) &&
                    !MdapiConfig.ignoreNamespaces(
                        this.settings,
                        metaItem
                    ) &&
                    !MdapiConfig.ignoreHiddenOrNonEditable(
                        this.settings,
                        metaItem
                    )) {

                        this.config.metadataObjectMembersLookup[metaType].push(metaItem);

                    }// End if

                }// End for

                if (--batchCtrl.counter <= 0) {

                    batchCtrl.resolve();

                }// End if

            },
            (error: any) => {

                this.ux.error(error);
                batchCtrl.reject(error);

            }
        );// End promise

    }// End method

    protected listMetadataBatch (): Promise<void> {

        return new Promise((resolve, reject) => {

            let counter = 0,

                batchCtrl = <BatchCtrl>{
                    counter,
                    resolve,
                    reject
                };

            for (let x = 0; x < this.BATCH_SIZE; x++) {

                let metaType: string = this.transientMetadataTypes.pop();

                if (!metaType) {

                    if (batchCtrl.counter <= 0) {

                        resolve();

                        return;

                    } continue;

                }// End if

                batchCtrl.counter = ++counter;

                let params = <Params>{
                    metaType
                };

                this.queryListMetadata(
                    params,
                    batchCtrl
                );

            }// End for

        });// End promse

    }// End method

    protected async listMetadata (): Promise<void> {

        this.transientMetadataTypes = [...this.config.metadataTypes]; // Create queue

        while (this.transientMetadataTypes.length > 0) {

            await this.listMetadataBatch();

        }// End while

    }// End method

    protected async listMetadataFolders (): Promise<void> {

        if (!this.ignoreFolders) {

            await this.listMetadataFolderBatch(
                this.config,
                MdapiConfig.Dashboard
            );
            await this.listMetadataFolderBatch(
                this.config,
                MdapiConfig.Document
            );
            await this.listMetadataFolderBatch(
                this.config,
                MdapiConfig.EmailTemplate
            );
            await this.listMetadataFolderBatch(
                this.config,
                MdapiConfig.Report
            );

        }// End if

    }// End method

    protected checkStageOrDevModePackageXml (): void {

        if (this.devMode) {

            copySync(
                this.filePackageXmlPath,
                MdapiConfig.packageXml
            );
            this.ux.log(`copied ${MdapiConfig.packageXml}`);

        }// End if

    }// End method

    protected checkStageOrDevModeFiles (): void {

        if (this.devMode) {

            if (existsSync(MdapiConfig.srcFolder)) {

                removeSync(MdapiConfig.srcFolder);

            }// End if

            mkdirSync(MdapiConfig.srcFolder);

            copySync(
                this.targetDirectorySource,
                MdapiConfig.srcFolder
            );
            this.ux.log(`copied to ${MdapiConfig.srcFolder}`);

            if (existsSync(MdapiCommon.stageRoot)) {

                removeSync(MdapiCommon.stageRoot);
                this.ux.log(`deleted ${MdapiCommon.stageRoot}`);

            }// End if

            removeSync(MdapiCommon.stageRoot);

            if (existsSync(MdapiCommon.backupRoot)) {

                removeSync(MdapiCommon.backupRoot);
                this.ux.log(`deleted ${MdapiCommon.backupRoot}`);

            }// End if

        }// End if

    }// End method

    public async process (): Promise<void> {

        try {

            // Init
            this.ux.startSpinner("initialising");
            this.init();
            this.ux.stopSpinner();

            // Async calls
            this.ux.startSpinner("describe metadata");
            await MdapiConfig.describeMetadata(
                this.org,
                this.config,
                this.settings
            );
            this.ux.stopSpinner();

            this.ux.startSpinner("list metadata");
            await this.listMetadata();
            this.ux.stopSpinner();

            this.ux.startSpinner("list folders");
            await this.listMetadataFolders();
            this.ux.stopSpinner();

            this.ux.startSpinner("resolve personaccount recordtypes");
            await MdapiConfig.resolvePersonAccountRecordTypes(
                this.org,
                this.config
            );
            this.ux.stopSpinner();

            // Sync calls
            MdapiConfig.setStandardValueSets(this.config);
            MdapiConfig.repositionSettings(this.config);

            // Create package.xml
            this.ux.startSpinner("create package.xml file");
            this.packageFile();
            this.ux.stopSpinner();

            this.checkStageOrDevModePackageXml();

            if (!this.manifestOnly) {

                // Retrieve metadata files
                this.ux.startSpinner("retrieve metadata (please standby)");
                await this.retrieveMetadata();
                this.ux.stopSpinner();

                // Unzip retrieved zip
                this.ux.startSpinner("unzipping package");
                await this.unzip();
                this.ux.stopSpinner();

                // Backup zip
                this.ux.startSpinner("backup zip");
                await this.backup();
                this.ux.stopSpinner();

                // Check if staging only or clean for src dev only
                this.ux.startSpinner("finishing up");
                this.checkStageOrDevModeFiles();
                this.ux.stopSpinner();

            }// End client

        } catch (exception) {

            this.ux.error(exception);

        }// End catch

    }// End process

}// End class
