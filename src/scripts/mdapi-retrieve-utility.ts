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
const exec = require('child_process').exec;

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

    protected bufferOptions: Object = { maxBuffer: 10 * 1024 * 1024 };
    protected MetadataListBatchSize: number = 30;
    protected TWO_SPACE: string = '  ';
    protected FOUR_SPACE: string = '    ';

    // defaults
    protected stageRoot: string = 'stage';
    protected backupRoot: string = 'backup';
    protected retrieveRoot: string = 'retrieve';
    protected unpackagedRoot: string = 'unpackaged';
    protected srcFolder: string = 'src';
    protected unpackagedZip: string = 'unpackaged.zip';
    protected manifest: string = 'manifest';
    protected packageXml: string = 'package.xml';

    protected metadataObjects: Array<Object> = [];
    protected sortedMetadataTypes: Array<string> = [];
    protected retainedMetadataTypes: Array<string> = [];
    protected metadataObjectsLookup: Object = {};
    protected metadataObjectsListMap: Object = {};

    protected StaticResource: string = 'StaticResource';
    protected StandardValueSet: string = 'StandardValueSet';
    protected Settings: string = 'Settings';
    protected RecordType: string = 'RecordType';
    protected PersonAccount: string = 'PersonAccount';
    protected Dashboard: string = 'Dashboard';
    protected Document: string = 'Document';
    protected Email: string = 'Email';
    protected EmailTemplate: string = 'EmailTemplate';
    protected Report: string = 'Report';
    protected Folder: string = 'Folder';
    // exception
    protected ManagedTopic: string = 'ManagedTopic';
    // hiddens if managed
    protected ApexClass: string = 'ApexClass';
    protected ApexComponent: string = 'ApexComponent';
    protected ApexPage: string = 'ApexPage';
    protected ApexTrigger: string = 'ApexTrigger';
    protected LightningComponentBundle: string = 'LightningComponentBundle';
    protected AuraDefinitionBundle: string = 'AuraDefinitionBundle';

    protected hiddenManagedMetaTypes = [
        this.ApexClass,
        this.ApexComponent,
        this.ApexPage,
        this.ApexTrigger,
        this.AuraDefinitionBundle,
        this.LightningComponentBundle];

    protected unsupportedMetadataTypes = [
        this.ManagedTopic
    ]; // cannot query listmetadata (error invalid parameter value) with api 46.0

    protected metadataFolders: Array<string> = [];

    protected metadataFoldersLookup: Object = {};

    protected metadataTypeChildren: Array<string> = [];

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/standardvalueset_names.htm
    protected standardValueSets: Array<string> = [
        "AccountContactMultiRoles",
        "AccountContactRole",
        "AccountOwnership",
        "AccountRating",
        "AccountType",
        "AssetStatus",
        "CampaignMemberStatus",
        "CampaignStatus",
        "CampaignType",
        "CaseContactRole",
        "CaseOrigin",
        "CasePriority",
        "CaseReason",
        "CaseStatus",
        "CaseType",
        "ContactRole",
        "ContractContactRole",
        "ContractStatus",
        "EntitlementType",
        "EventSubject",
        "EventType",
        "FiscalYearPeriodName",
        "FiscalYearPeriodPrefix",
        "FiscalYearQuarterName",
        "FiscalYearQuarterPrefix",
        "IdeaCategory1",
        "IdeaMultiCategory",
        "IdeaStatus",
        "IdeaThemeStatus",
        "Industry",
        "LeadSource",
        "LeadStatus",
        "OpportunityCompetitor",
        "OpportunityStage",
        "OpportunityType",
        "OrderStatus",
        "OrderType",
        "PartnerRole",
        "Product2Family",
        "QuestionOrigin1",
        "QuickTextCategory",
        "QuickTextChannel",
        "QuoteStatus",
        "RoleInTerritory2",
        "SalesTeamRole",
        "Salutation",
        "ServiceContractApprovalStatus",
        "SocialPostClassification",
        "SocialPostEngagementLevel",
        "SocialPostReviewedStatus",
        "SolutionStatus",
        "TaskPriority",
        "TaskStatus",
        "TaskSubject",
        "TaskType",
        "WorkOrderLineItemStatus",
        "WorkOrderPriority",
        "WorkOrderStatus"
    ];

    // define working folders
    protected stageOrgAliasDirectoryPath: string = (this.stageRoot + '/' + this.orgAlias);
    protected retrievePath: string = (this.stageOrgAliasDirectoryPath + '/' + this.retrieveRoot);
    protected zipFilePath: string = (this.retrievePath + '/' + this.unpackagedZip);
    protected targetDirectoryUnpackaged: string = (this.retrievePath + '/' + this.unpackagedRoot);
    protected targetDirectorySource: string = (this.retrievePath + '/' + this.srcFolder);
    protected manifestDirectory: string = (this.stageOrgAliasDirectoryPath + '/' + this.manifest);
    protected filePackageXmlPath = (this.manifestDirectory + '/' + this.packageXml);

    protected command(cmd: string): Promise<any> {

        return new Promise((resolve, reject) => {
            exec(cmd, this.bufferOptions, (error: any, stdout: any, stderr: any) => {
                if (error) {
                    this.ux.error(stderr);
                    reject(error);
                }// end if
                else {
                    resolve(stdout);
                }// end else
            });
        });

    }// end method

    protected isUnsupportedMetaType(metaType: string): boolean {

        for (var x: number = 0; x < this.unsupportedMetadataTypes.length; x++) {

            let unsupportedMetadataType: string = this.unsupportedMetadataTypes[x];

            if (unsupportedMetadataType === metaType) {
                // this.ux.log("excluding unsupported metatype: " + metaType);
                return true;
            }// end if

        }// end for

        return false;

    }// end method

    protected describeMetadataChildren(): void {

        this.describeMetadataArray(this.metadataTypeChildren);

    }// end method

    protected describeMetadataFolders(): void {

        this.describeMetadataArray(this.metadataFolders);

    }// end method

    protected describeMetadataArray(metaTypeNameArray: Array<string>) {

        for (var x: number = 0; x < metaTypeNameArray.length; x++) {

            let metaTypeName: string = metaTypeNameArray[x];

            if (this.metadataObjectsLookup[metaTypeName] === undefined) {
                this.metadataObjectsLookup[metaTypeName] = [];
            }// end if

            if (this.metadataObjectsListMap[metaTypeName] === undefined) {
                this.metadataObjectsListMap[metaTypeName] = [];
            }// end if

            this.sortedMetadataTypes.push(metaTypeName);

            this.metadataObjectsLookup[metaTypeName].push({
                directoryName: null,
                inFolder: false,
                metaFile: false,
                suffix: null,
                xmlName: metaTypeName
            });
        }// end for

    }// end method

    protected describeMetadata(): Promise<any> {

        return new Promise((resolve, reject) => {

            this.org.getConnection().metadata.describe(this.apiVersion).then((result: DescribeMetadataResult) => {

                let metadataObjects: Array<MetadataObject> = result.metadataObjects;

                for (var x = 0; x < metadataObjects.length; x++) {

                    let metadataObject: MetadataObject = metadataObjects[x];
                    let metaTypeName: string = metadataObject.xmlName;

                    if (this.isUnsupportedMetaType(metaTypeName)) { continue; }

                    if (this.ignoreStaticResources && (metaTypeName === this.StaticResource)) {
                        // this.ux.log('excluding static resources'); 
                        continue;
                    }// end if

                    if (this.ignoreFolders && metadataObject.inFolder) {
                        // this.ux.log('excluding folder ' + metaTypeName); 
                        continue;
                    }// end if

                    if (this.metadataObjectsLookup[metaTypeName] === undefined) {
                        this.metadataObjectsLookup[metaTypeName] = [];
                    }// end if

                    if (this.metadataObjectsListMap[metaTypeName] === undefined) {
                        this.metadataObjectsListMap[metaTypeName] = [];
                    }// end if

                    this.sortedMetadataTypes.push(metaTypeName);
                    this.metadataObjectsLookup[metaTypeName].push(metadataObject);

                    if (metadataObject.inFolder) {
                        let metaTypeFolderName = (metaTypeName + this.Folder);
                        if (metaTypeName === this.EmailTemplate) { metaTypeFolderName = (this.Email + this.Folder); } // exception
                        this.metadataFolders.push(metaTypeFolderName);
                        this.metadataFoldersLookup[metaTypeName] = metaTypeFolderName;
                    }// end if

                    if (metadataObject.childXmlNames && (metadataObject.childXmlNames instanceof Array)) {

                        for (var y = 0; y < metadataObject.childXmlNames.length; y++) {
                            let childXmlName = metadataObject.childXmlNames[y];
                            if (this.isUnsupportedMetaType(childXmlName)) { continue; }
                            this.metadataTypeChildren.push(childXmlName);
                        }// end for

                    }// end if

                }// end for

                this.describeMetadataFolders();

                this.describeMetadataChildren();

                this.sortedMetadataTypes.sort();

                resolve(this.metadataObjectsLookup);

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

    protected checkIgnoreHidden(metaItem: FileProperties): boolean {

        // if (metaItem.type === this.ApexClass) { console.log(metaItem); }

        if (!this.ignoreHidden) {
            return false;
        }// end if
        else if (metaItem.manageableState &&
            (metaItem.manageableState === 'installed')) {
            for (var x: number = 0; x < this.hiddenManagedMetaTypes.length; x++) {
                let hiddenMetaType: string = this.hiddenManagedMetaTypes[x];
                if (hiddenMetaType === metaItem.type) {
                    return true;
                }// end if
            }// end for
        }// end if
        return false;

    }// end method

    protected listMetadataFolderBatch(metaType: string): Promise<any> {

        return new Promise((resolve, reject) => {

            let folderType: string = this.metadataFoldersLookup[metaType];
            let folderArray: Array<string> = this.metadataObjectsListMap[folderType];

            let counter: number = 0;

            let batchCtrl = <BatchCtrl>{
                "counter": counter,
                "resolve": resolve,
                "reject": reject
            };

            for (var x: number = 0; x < folderArray.length; x++) {

                let folder: string = folderArray[x];

                var params = <Params>{
                    "metaType": metaType,
                    "folder": folder
                };

                batchCtrl.counter = ++counter;

                // inject the folder before
                this.metadataObjectsListMap[metaType].push(folder);
                this.queryListMetadata(params, batchCtrl);

            }// end for

        });// end promse

    }// end method

    protected setStandardValueSets(): void {

        for (var x: number = 0; x < this.standardValueSets.length; x++) {
            this.metadataObjectsListMap[this.StandardValueSet].push(this.standardValueSets[x]);
        }// end for

    }// end function

    protected repositionSettings(): void {

        let found: boolean = false;
        for (var x: number = 0; x < this.retainedMetadataTypes.length; x++) {
            if (this.retainedMetadataTypes[x] === this.Settings) {
                this.retainedMetadataTypes.splice(x, 1);
                found = true;
                break;
            }// end if
        }// end if
        if (found) {
            this.retainedMetadataTypes.push(this.Settings);
        }// end if

    }// end method

    protected async resolvePersonAccountRecordTypes(): Promise<any> {

        return new Promise((resolve, reject) => {

            this.org.getConnection().query("SELECT DeveloperName, SobjectType, IsPersonType FROM RecordType " +
                " WHERE SobjectType = 'Account' AND IsPersonType = true").then((result: QueryResult<any>) => {
                    if (result.records) {
                        for (var x: number = 0; x < result.records.length; x++) {
                            let record: Object = result.records[x];
                            let personRecordType: string = (this.PersonAccount + '.' + record["DeveloperName"]);
                            this.metadataObjectsListMap[this.RecordType].push(personRecordType);
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

            if (this.metadataObjectsListMap[metaType].length === 0) {
                continue;
            }// end if

            let metaItems: Array<string> = this.metadataObjectsListMap[metaType];
            let uniqueMetaItems: Array<string> = [...new Set(metaItems)];

            uniqueMetaItems.sort();

            xmlContent += (this.TWO_SPACE + '<types>\n');

            for (var y: number = 0; y < uniqueMetaItems.length; y++) {
                let item: string = uniqueMetaItems[y];
                xmlContent += (this.FOUR_SPACE + '<members>' + item + '</members>\n');
            }// end for

            xmlContent += (this.FOUR_SPACE + '<name>' + metaType + '</name>\n');
            xmlContent += (this.TWO_SPACE + '</types>\n');

        }// end for

        xmlContent += (this.TWO_SPACE + '<version>' + this.apiVersion + '</version>\n');
        xmlContent += '</Package>\n';

        writeFileSync(packageFile, xmlContent);
        this.ux.log(packageFile + ' file successfully saved.');

    }// end function

    // create backup of retrieve meta in-case needed later
    protected createBackup(): void {

        let iso: string = new Date().toISOString();
        iso = iso.replace(/:/g, '-').split('.')[0];

        let backupFolder: string = (this.backupRoot + '/' + this.orgAlias); // e.g. backup/DevOrg
        let backupOrgFolder: string = (backupFolder + '/' + iso); // e.g. backup/DevOrg/2000-00-00T11-11-11
        let backupProjectFile: string = (backupOrgFolder + '/' + this.unpackagedZip);
        let sourceProjectFile: string = (this.retrievePath + '/' + this.unpackagedZip);

        if (this.ignoreBackup) {
            this.ux.log('ignoring backup.');
            unlinkSync(sourceProjectFile);
            this.ux.log('deleting temp file: ' + sourceProjectFile);
            return;
        }// end if

        if (!existsSync(this.backupRoot)) {
            mkdirSync(this.backupRoot);
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

            var retrieveCommand: string = ('sfdx force:mdapi:retrieve -s -k ' + this.filePackageXmlPath + ' -r ' + this.retrievePath + ' -w -1 -u ' + this.orgAlias);
            this.ux.log('please standby this may take a few minutes ...');

            this.command(retrieveCommand).then((result: any) => {

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

        if (!existsSync(this.stageRoot)) {
            mkdirSync(this.stageRoot);
            this.ux.log('staging [' + this.stageRoot + '] directory created.');
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
                    !this.checkIgnoreHidden(metaItem)) {
                    this.metadataObjectsListMap[metaType].push(metaItem.fullName);
                }// end if

            }// end for

            if (--batchCtrl.counter <= 0) {
                batchCtrl.resolve(this.metadataObjectsListMap);
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

                let metaType: string = this.sortedMetadataTypes.pop();

                if ((metaType === undefined) || (metaType === null)) {
                    if (batchCtrl.counter <= 0) {
                        resolve(this.metadataObjectsListMap);
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

        while (this.sortedMetadataTypes.length > 0) {
            await this.listMetadataBatch();
        }// end while

    }// end method

    protected async listMetadataFolders(): Promise<void> {

        if (!this.ignoreFolders) {
            await this.listMetadataFolderBatch(this.Dashboard);
            await this.listMetadataFolderBatch(this.Document);
            await this.listMetadataFolderBatch(this.EmailTemplate);
            await this.listMetadataFolderBatch(this.Report);
        }// end if

    }// end method

    protected checkStageOrDevModePackageXml(): void {

        if (this.devMode) {

            copySync(this.filePackageXmlPath, this.packageXml);

            this.ux.log('copied ' + this.packageXml);

        }// end if

    }// end method

    protected checkStageOrDevModeFiles(): void {

        if (this.devMode) {

            if (existsSync(this.srcFolder)) {
                removeSync(this.srcFolder);
            }// end if

            mkdirSync(this.srcFolder);

            copySync(this.targetDirectorySource, this.srcFolder);
            this.ux.log('copied ' + this.srcFolder);

            if (existsSync(this.stageRoot)) {
                removeSync(this.stageRoot);
                this.ux.log('deleted ' + this.stageRoot);
            }// end if

            removeSync(this.stageRoot);

            if (existsSync(this.backupRoot)) {
                removeSync(this.backupRoot);
                this.ux.log('deleted ' + this.backupRoot);
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
