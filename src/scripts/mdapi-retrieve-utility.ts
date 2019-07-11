/**
 * @name MdapiRetrieveUtility
 * @author brianewardsaunders 
 * @date 2019-07-10
 * @acknowledgement amtrack/force-dev-tool (author acknowledgement)
 */

import {
    existsSync, mkdirSync, removeSync, unlinkSync, mkdirp, createWriteStream, writeFileSync, copyFileSync, renameSync, copySync
} from 'fs-extra';
import {
    QueryResult, ListMetadataQuery, FileProperties, DescribeMetadataResult, MetadataObject
} from 'jsforce';

import path = require('path');
import yauzl = require('yauzl');
import { Org } from '@salesforce/core';
import { UX } from '@salesforce/command';
import { MdapiConfig } from './mdapi-config';
import { Common } from './common';

export interface BatchCtrl {
    counter: number;
    resolve: any;
    reject: any;
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
        protected ignoreHidden: boolean,
        protected ignoreFolders: boolean,
        protected ignoreStaticResources: boolean,
        protected manifestOnly: boolean,
        protected devMode: boolean) {
        // noop
    }// end constructor

    protected MetadataListBatchSize: number = 30;

    // define working folders
    protected stageOrgAliasDirectoryPath: string = (Common.stageRoot + Common.PATH_SEP + this.orgAlias);
    protected retrievePath: string = (this.stageOrgAliasDirectoryPath + Common.PATH_SEP + Common.retrieveRoot);
    protected zipFilePath: string = (this.retrievePath + Common.PATH_SEP + MdapiConfig.unpackagedZip);
    protected targetDirectoryUnpackaged: string = (this.retrievePath + Common.PATH_SEP + MdapiConfig.unpackagedFolder);
    protected targetDirectorySource: string = (this.retrievePath + Common.PATH_SEP + MdapiConfig.srcFolder);
    protected manifestDirectory: string = (this.stageOrgAliasDirectoryPath + Common.PATH_SEP + MdapiConfig.manifestFolder);
    protected filePackageXmlPath = (this.manifestDirectory + Common.PATH_SEP + MdapiConfig.packageXml);

    protected metadataTypes: Array<string> = [];
    protected retainedMetadataTypes: Array<string> = [];

    protected metadataObjectLookup: Record<string, MetadataObject> = {};
    protected metadataObjectMembersLookup: Record<string, Array<FileProperties>> = {};

    protected metadataFolders: Array<string> = [];
    protected metadataTypeChildren: Array<string> = [];

    protected describeMetadataArray(metaTypeNameArray: Array<string>) {

        for (var x: number = 0; x < metaTypeNameArray.length; x++) {

            let metaTypeName: string = metaTypeNameArray[x];
            this.metadataTypes.push(metaTypeName);
            this.metadataObjectMembersLookup[metaTypeName] = [];

            this.metadataObjectLookup[metaTypeName] = (<MetadataObject>
                {
                    directoryName: null,
                    inFolder: false,
                    metaFile: false,
                    suffix: null,
                    xmlName: metaTypeName,
                    childXmlNames: null
                });
        }// end for

    }// end method

    protected describeMetadata(): Promise<any> {

        return new Promise((resolve, reject) => {

            this.org.getConnection().metadata.describe(this.apiVersion).then((result: DescribeMetadataResult) => {

                let metadataObjects: Array<MetadataObject> = result.metadataObjects;

                for (var x: number = 0; x < metadataObjects.length; x++) {

                    let metadataObject: MetadataObject = metadataObjects[x];
                    let metaTypeName: string = metadataObject.xmlName;

                    if (MdapiConfig.isUnsupportedMetaType(metaTypeName)) { continue; }

                    if (this.ignoreStaticResources && (metaTypeName === MdapiConfig.StaticResource)) {
                        continue;
                    }// end if

                    if (this.ignoreFolders && metadataObject.inFolder) {
                        continue;
                    }// end if

                    this.metadataTypes.push(metaTypeName);
                    this.metadataObjectMembersLookup[metaTypeName] = [];
                    this.metadataObjectLookup[metaTypeName] = metadataObject;

                    if (metadataObject.inFolder) {
                        let metaTypeFolderName: string = MdapiConfig.metadataTypeFolderLookup[metaTypeName];
                        this.metadataFolders.push(metaTypeFolderName); // e.g. ReportFolder
                    }// end if

                    if (metadataObject.childXmlNames && (metadataObject.childXmlNames instanceof Array)) {

                        for (var y: number = 0; y < metadataObject.childXmlNames.length; y++) {
                            let childXmlName = metadataObject.childXmlNames[y];
                            if (MdapiConfig.isUnsupportedMetaType(childXmlName)) { continue; }
                            this.metadataTypeChildren.push(childXmlName);
                        }// end for

                    }// end if

                }// end for

                this.describeMetadataArray(this.metadataFolders);

                this.describeMetadataArray(this.metadataTypeChildren);

                this.metadataTypes.sort();

                resolve();

            }, (error: any) => {
                reject(error);
            });// end describe

        }); // end promise

    }// end method

    protected checkIgnoreNamespaces(metaItem: FileProperties): boolean {

        if (!this.ignoreNamespaces) {
            return false;
        }// end if
        else if (metaItem.namespacePrefix &&
            (metaItem.namespacePrefix !== null) &&
            (metaItem.namespacePrefix !== '')) { // pi or Finserv etc.
            return true;
        }// end else if
        return false;

    }// end method 

    protected checkIgnoreInstalled(metaItem: FileProperties): boolean {

        if (!this.ignoreInstalled) {
            return false;
        }// end if
        else if (metaItem.manageableState &&
            (metaItem.manageableState === 'installed')) { //installed 
            return true;
        }// end else if
        return false;

    }// end method 

    protected checkIgnoreHiddenOrNonEditable(metaItem: FileProperties): boolean {

        if (!this.ignoreHidden) {
            return false;
        }// end if
        else if (metaItem.manageableState &&
            (metaItem.manageableState === 'installed')) {
            for (var x: number = 0; x < MdapiConfig.hiddenOrNonEditableInstalledMetaTypes.length; x++) {
                let hiddenMetaType: string = MdapiConfig.hiddenOrNonEditableInstalledMetaTypes[x];
                if (hiddenMetaType === metaItem.type) {
                    return true;
                }// end if
            }// end for
        }// end if
        return false;

    }// end method

    protected listMetadataFolderBatch(metaType: string): Promise<any> {

        return new Promise((resolve, reject) => {

            let folderType: string = MdapiConfig.metadataTypeFolderLookup[metaType];
            let folderArray: Array<FileProperties> = this.metadataObjectMembersLookup[folderType];

            let counter: number = 0;

            let batchCtrl = <BatchCtrl>{
                "counter": counter,
                "resolve": resolve,
                "reject": reject
            };

            for (var x: number = 0; x < folderArray.length; x++) {

                let folderName: string = folderArray[x].fullName;

                var params = <Params>{
                    "metaType": metaType,
                    "folder": folderName
                };

                batchCtrl.counter = ++counter;

                // inject the folder before
                this.metadataObjectMembersLookup[metaType].push(
                    folderArray[x]
                );
                this.queryListMetadata(params, batchCtrl);

            }// end for

        });// end promse

    }// end method

    protected setStandardValueSets(): void {

        for (var x: number = 0; x < MdapiConfig.standardValueSets.length; x++) {
            this.metadataObjectMembersLookup[MdapiConfig.StandardValueSet].push(
                (<FileProperties>{
                    "type": MdapiConfig.StandardValueSet,
                    "createdById": null,
                    "createdByName": null,
                    "createdDate": null,
                    "fileName": null,
                    "fullName": MdapiConfig.standardValueSets[x],
                    "id": null,
                    "lastModifiedById": null,
                    "lastModifiedByName": null,
                    "lastModifiedDate": null,
                    "manageableState": null,
                    "namespacePrefix": null,
                })
            );
        }// end for

    }// end function

    protected repositionSettings(): void {

        let found: boolean = false;
        for (var x: number = 0; x < this.retainedMetadataTypes.length; x++) {
            if (this.retainedMetadataTypes[x] === MdapiConfig.Settings) {
                this.retainedMetadataTypes.splice(x, 1);
                found = true;
                break;
            }// end if
        }// end if
        if (found) {
            this.retainedMetadataTypes.push(MdapiConfig.Settings);
        }// end if

    }// end method

    protected async resolvePersonAccountRecordTypes(): Promise<any> {

        return new Promise((resolve, reject) => {

            this.org.getConnection().query("SELECT DeveloperName, SobjectType, IsPersonType FROM RecordType " +
                " WHERE SobjectType = 'Account' AND IsPersonType = true").then((result: QueryResult<any>) => {

                    if (result.records) {
                        for (var x: number = 0; x < result.records.length; x++) {

                            let record: Object = result.records[x];
                            let personRecordType: string = (MdapiConfig.PersonAccount + '.' + record["DeveloperName"]);

                            this.metadataObjectMembersLookup[MdapiConfig.RecordType].push(
                                (<FileProperties>{
                                    "type": MdapiConfig.RecordType,
                                    "createdById": null,
                                    "createdByName": null,
                                    "createdDate": null,
                                    "fileName": null,
                                    "fullName": personRecordType,
                                    "id": null,
                                    "lastModifiedById": null,
                                    "lastModifiedByName": null,
                                    "lastModifiedDate": null,
                                    "manageableState": null,
                                    "namespacePrefix": null,
                                })
                            );
                        }// end for
                    }// end if
                    resolve();
                }, (error: any) => {
                    reject(error);
                });

        });// end promise

    }// end method

    protected createPackageFile(packageFile: string): void {

        let xmlContent: string = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xmlContent += '<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';

        this.retainedMetadataTypes.reverse();

        this.repositionSettings();

        for (var x: number = 0; x < this.retainedMetadataTypes.length; x++) {

            let metaType: string = this.retainedMetadataTypes[x];

            if (this.metadataObjectMembersLookup[metaType].length === 0) { continue; }

            let metaItems: Array<FileProperties> = this.metadataObjectMembersLookup[metaType];

            let sortedMembers: Array<string> = MdapiConfig.toSortedMembers(metaItems);

            xmlContent += (Common.TWO_SPACE + '<types>\n');

            for (var y: number = 0; y < sortedMembers.length; y++) {
                let item: string = sortedMembers[y];
                xmlContent += (Common.FOUR_SPACE + '<members>' + item + '</members>\n');
            }// end for

            xmlContent += (Common.FOUR_SPACE + '<name>' + metaType + '</name>\n');
            xmlContent += (Common.TWO_SPACE + '</types>\n');

        }// end for

        xmlContent += (Common.TWO_SPACE + '<version>' + this.apiVersion + '</version>\n');
        xmlContent += '</Package>\n';

        writeFileSync(packageFile, xmlContent);
        this.ux.log(packageFile + ' file successfully saved.');

    }// end function

    // create backup of retrieve meta in-case needed later
    protected createBackup(): void {

        let iso: string = new Date().toISOString();
        iso = iso.replace(/:/g, '-').split('.')[0];

        let backupFolder: string = (Common.backupRoot + Common.PATH_SEP + this.orgAlias); // e.g. backup/DevOrg
        let backupOrgFolder: string = (backupFolder + Common.PATH_SEP + iso); // e.g. backup/DevOrg/2000-00-00T11-11-11
        let backupProjectFile: string = (backupOrgFolder + Common.PATH_SEP + MdapiConfig.unpackagedZip);
        let sourceProjectFile: string = (this.retrievePath + Common.PATH_SEP + MdapiConfig.unpackagedZip);

        if (this.ignoreBackup) {
            this.ux.log('ignoring backup.');
            unlinkSync(sourceProjectFile);
            this.ux.log('deleting temp file: ' + sourceProjectFile);
            return;
        }// end if

        if (!existsSync(Common.backupRoot)) {
            mkdirSync(Common.backupRoot);
        }// end if

        if (!existsSync(backupFolder)) {
            mkdirSync(backupFolder);
        }// end if

        if (!existsSync(backupOrgFolder)) {
            mkdirSync(backupOrgFolder);
        }// end if

        this.ux.log('backing up from: ' + sourceProjectFile + ' to: ' + backupProjectFile);

        copyFileSync(sourceProjectFile, backupProjectFile);
        this.ux.log('backup finished to file: ' + backupProjectFile);

        unlinkSync(sourceProjectFile);
        this.ux.log('deleting temp file: ' + sourceProjectFile);

    }// end method

    protected async unzipUnpackaged(): Promise<any> {

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

    protected async retrieveMetadata(): Promise<any> {

        this.ux.log('retrieve directory: ' + this.retrievePath);

        return new Promise((resolve, reject) => {

            if (existsSync(this.retrievePath)) {
                removeSync(this.retrievePath);
            }// end if

            mkdirSync(this.retrievePath);

            var retrieveCommand: string = ('sfdx force:mdapi:retrieve -s -k ' + this.filePackageXmlPath
                + ' -r ' + this.retrievePath + ' -w -1 -u ' + this.orgAlias);

            Common.command(retrieveCommand).then((result: any) => {

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
            this.ux.log('created manifest directory [' + this.manifestDirectory + '].');
        }// end if

        this.createPackageFile(this.filePackageXmlPath);

    }// end method

    protected init(): void {

        if (!existsSync(Common.stageRoot)) {
            mkdirSync(Common.stageRoot);
            this.ux.log('staging [' + Common.stageRoot + '] directory created.');
        }// end if

        // check if working directory exists
        if (!existsSync(this.stageOrgAliasDirectoryPath)) {
            mkdirSync(this.stageOrgAliasDirectoryPath);
            this.ux.log('staging alias [' + this.stageOrgAliasDirectoryPath + '] directory created.');
        }// end if

    }// end method

    protected async unzipAndBackup(): Promise<any> {

        return new Promise((resolve, reject) => {

            if (existsSync(this.targetDirectorySource)) {
                removeSync(this.targetDirectorySource);
            }// end if

            this.unzipUnpackaged().then(() => {

                // rename unmanaged to src
                renameSync(this.targetDirectoryUnpackaged, this.targetDirectorySource);

                this.createBackup();

                resolve();

            }, (error: any) => {
                this.ux.error(error);
                reject(error);
            });// end unzipUnpackaged

        }); // end promise

    }// end method

    protected objectToArray<T>(objectOrArray: T | Array<T>): Array<T> {
        let returned: Array<T> = [];
        if (objectOrArray) {
            if (objectOrArray instanceof Array) { return objectOrArray; }
            else { returned.push(objectOrArray); }// end else
        }// end if
        return returned;
    }// end method

    protected queryListMetadata(params: Params, batchCtrl: BatchCtrl): void {

        var metaQueries: Array<ListMetadataQuery>;

        const metaType: string = params.metaType;
        const folder: string = params.folder;

        if (folder) { metaQueries = [{ "type": metaType, "folder": folder }]; }
        else { metaQueries = [{ "type": metaType }]; }

        this.org.getConnection().metadata.list(metaQueries, this.apiVersion).then((result: Array<FileProperties>) => {

            result = this.objectToArray(result);

            for (var x: number = 0; x < result.length; x++) {

                let metaItem: FileProperties = result[x];

                if (!this.checkIgnoreInstalled(metaItem) &&
                    !this.checkIgnoreNamespaces(metaItem) &&
                    !this.checkIgnoreHiddenOrNonEditable(metaItem)) {
                    this.metadataObjectMembersLookup[metaType].push(metaItem);
                }// end if

            }// end for

            if (--batchCtrl.counter <= 0) {
                batchCtrl.resolve();
            }// end if

        }, (error: any) => {
            batchCtrl.reject(error);
        });// end promise

    }// end method

    protected listMetadataBatch(): Promise<any> {

        return new Promise((resolve, reject) => {

            let counter: number = 0;

            let batchCtrl = <BatchCtrl>{
                "counter": counter,
                "resolve": resolve,
                "reject": reject
            };

            for (var x: number = 0; x < this.MetadataListBatchSize; x++) {

                let metaType: string = this.metadataTypes.pop();

                if ((metaType === undefined) || (metaType === null)) {
                    if (batchCtrl.counter <= 0) {
                        resolve(this.metadataObjectMembersLookup);
                        return;
                    } else { continue; }
                }// end if

                this.retainedMetadataTypes.push(metaType);

                batchCtrl.counter = ++counter;

                let params = <Params>{
                    "metaType": metaType
                };

                this.queryListMetadata(params, batchCtrl);

            }// end for

        });// end promse

    }// end method

    protected async listMetadata(): Promise<any> {

        while (this.metadataTypes.length > 0) {
            await this.listMetadataBatch();
        }// end while

    }// end method

    protected async listMetadataFolders(): Promise<void> {

        if (!this.ignoreFolders) {
            await this.listMetadataFolderBatch(MdapiConfig.Dashboard);
            await this.listMetadataFolderBatch(MdapiConfig.Document);
            await this.listMetadataFolderBatch(MdapiConfig.EmailTemplate);
            await this.listMetadataFolderBatch(MdapiConfig.Report);
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
            this.ux.log('copied ' + MdapiConfig.srcFolder);

            if (existsSync(Common.stageRoot)) {
                removeSync(Common.stageRoot);
                this.ux.log('deleted ' + Common.stageRoot);
            }// end if

            removeSync(Common.stageRoot);

            if (existsSync(Common.backupRoot)) {
                removeSync(Common.backupRoot);
                this.ux.log('deleted ' + Common.backupRoot);
            }// end if

        }// end if

    }// end method

    public async process(): Promise<any> {

        // init
        this.ux.startSpinner('initialising');
        this.init();
        this.ux.stopSpinner();

        // async calls
        this.ux.startSpinner('describe metadata');
        await this.describeMetadata();
        this.ux.stopSpinner();

        this.ux.startSpinner('list metadata');
        await this.listMetadata();
        this.ux.stopSpinner();

        this.ux.startSpinner('list metadata folders');
        await this.listMetadataFolders();

        this.ux.startSpinner('resolve PersonAccount RecordTypes');
        await this.resolvePersonAccountRecordTypes();
        this.ux.stopSpinner();

        // sync call
        this.setStandardValueSets();

        // create package.xml
        this.ux.startSpinner('create package.xml file');
        this.packageFile();
        this.ux.stopSpinner();

        this.checkStageOrDevModePackageXml();

        if (!this.manifestOnly) {

            // retrieve metadata files
            this.ux.startSpinner('retrieve metadata files');
            await this.retrieveMetadata();
            this.ux.stopSpinner();

            // unzip retrieve and backup zip
            this.ux.startSpinner('unzipping');
            await this.unzipAndBackup();
            this.ux.stopSpinner();

            // check if staging only or clean for src dev only
            this.ux.startSpinner('finalising');
            this.checkStageOrDevModeFiles();
            this.ux.stopSpinner();

        } else {
            this.ux.log('only created manifest package.xml, process completed.');
        }// end else

    }// end process

}// end class
