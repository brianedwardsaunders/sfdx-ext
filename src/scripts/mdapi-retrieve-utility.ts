/**
 * @author brianewardsaunders 
 * @date 2019-07-10
 * @acknowledgement force-dev-tool (author acknowledgement)
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
        protected orgAlias: string,
        protected apiVersion: string,
        protected ignoreBackup: boolean,
        protected ignoreManaged: boolean,
        protected ignoreNamespaces: boolean,
        protected manifestOnly: boolean,
        protected devMode: boolean) {
        // noop
    }// end constructor

    protected bufferOptions: Object = { maxBuffer: 10 * 1024 * 1024 };
    protected MetadataListBatchSize = 30;

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

    protected StandardValueSet: string = 'StandardValueSet';
    protected Settings: string = 'Settings';
    protected RecordType: string = 'RecordType';
    protected PersonAccount: string = 'PersonAccount';
    protected Dashboard: string = 'Dashboard';
    protected Document: string = 'Document';
    protected EmailTemplate: string = 'EmailTemplate';
    protected Report: string = 'Report';
    protected DashboardFolder: string = 'DashboardFolder';
    protected DocumentFolder: string = 'DocumentFolder';
    protected EmailFolder: string = 'EmailFolder';
    protected ReportFolder: string = 'ReportFolder';

    protected metaObjectExcludes: Array<string> = [
        // placeholder
    ];

    protected metadataFoldersOther: Array<string> = [
        "BrandingSet",
        "BusinessProcess",
        "CompactLayout",
        "CustomField",
        "CustomLabel",
        "DataCategoryGroup",
        "FieldSet",
        "LeadConvertSettings",
        "ListView",
        "MatchingRule",
        "Index",
        "RecordType",
        "SharingReason",
        "StandardValueSet",
        "ValidationRule",
        "WebLink",
        "WorkflowFieldUpdate",
        "WorkflowKnowledgePublish",
        "WorkflowTask",
        "WorkflowAlert",
        "WorkflowSend",
        "WorkflowOutboundMessage",
        "WorkflowRule"
    ];

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

    protected metadataFolders: Array<string> = [
        this.DashboardFolder,
        this.DocumentFolder,
        this.EmailFolder,
        this.ReportFolder
    ];

    protected metadataFoldersLookup: Object = {
        "Dashboard": this.DashboardFolder,
        "Document": this.DocumentFolder,
        "EmailTemplate": this.EmailFolder,
        "Report": this.ReportFolder
    };

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
                    console.debug(stderr);
                    reject(error);
                }// end if
                else {
                    resolve(stdout);
                }// end else
            });
        });

    }// end method

    protected isExcludedMetaType(metaObject: string): boolean {

        let isExcluded: boolean = false;

        this.metaObjectExcludes.forEach(element => {
            if (element === metaObject) {
                console.log("excluding meta type: " + metaObject);
                isExcluded = true;
                return;
            }
        }); // end foreach

        return isExcluded;

    }// end method 

    protected describeMetadataOthers(): void {

        this.metadataFoldersOther.forEach(metadata => {

            if (this.metadataObjectsLookup[metadata] === undefined) {
                this.metadataObjectsLookup[metadata] = [];
            }// end if

            if (this.metadataObjectsListMap[metadata] === undefined) {
                this.metadataObjectsListMap[metadata] = [];
            }// end if

            this.sortedMetadataTypes.push(metadata);

            this.metadataObjectsLookup[metadata].push({
                directoryName: null,
                inFolder: true,
                metaFile: false,
                suffix: null,
                xmlName: metadata
            });
        });// end foreach

    }// end method

    protected describeMetadataFolders(): void {

        this.metadataFolders.forEach(metadata => {

            if (this.metadataObjectsLookup[metadata] === undefined) {
                this.metadataObjectsLookup[metadata] = [];
            }// end if

            if (this.metadataObjectsListMap[metadata] === undefined) {
                this.metadataObjectsListMap[metadata] = [];
            }// end if

            this.sortedMetadataTypes.push(metadata);

            this.metadataObjectsLookup[metadata].push({
                directoryName: null,
                inFolder: true,
                metaFile: false,
                suffix: null,
                xmlName: metadata
            });
        });// end foreach

    }// end method

    protected describeMetadata(): Promise<any> {

        return new Promise((resolve, reject) => {

            try {

                this.org.getConnection().metadata.describe(this.apiVersion).then((result: DescribeMetadataResult) => {

                    let metadataObjects: Array<MetadataObject> = result.metadataObjects;

                    for (var x = 0; x < metadataObjects.length; x++) {

                        let metadataObject: MetadataObject = metadataObjects[x];
                        let lookupKey: string = metadataObject.xmlName;

                        if (this.isExcludedMetaType(lookupKey)) continue;

                        if (this.metadataObjectsLookup[lookupKey] === undefined) {
                            this.metadataObjectsLookup[lookupKey] = [];
                        }// end if

                        if (this.metadataObjectsListMap[lookupKey] === undefined) {
                            this.metadataObjectsListMap[lookupKey] = [];
                        }// end if

                        this.sortedMetadataTypes.push(lookupKey);
                        this.metadataObjectsLookup[lookupKey].push(metadataObject);

                    }// end for

                    this.describeMetadataFolders();

                    this.describeMetadataOthers();

                    this.sortedMetadataTypes.sort();

                    resolve(this.metadataObjectsLookup);

                }, (error: any) => {
                    reject(error);
                });

            } catch (exception) {
                reject(exception);
            }// end catch

        }); // end promise

    }// end method

    protected checkIgnoreNamespaces(metaItem: FileProperties): boolean {

        if (!this.ignoreNamespaces) {
            return false;
        }// end if
        else if (!(metaItem.namespacePrefix === undefined ||
            metaItem.namespacePrefix === null ||
            metaItem.namespacePrefix === "")) { // pi or Finserv etc.
            return true;
        }// end else if
        return false;

    }// end method 

    protected checkIgnoreManaged(metaItem: FileProperties): boolean {

        if (!this.ignoreManaged) {
            return false;
        }// end if
        else if (!(metaItem.manageableState === undefined ||
            metaItem.manageableState === null) &&
            !(metaItem.manageableState === "unmanaged")) { // installed
            return true;
        }// end else if
        return false;

    }// end method 

    protected listMetadataFolderBatch(metaType: string): Promise<any> {

        return new Promise((resolve, reject) => {

            try {

                const folderType = this.metadataFoldersLookup[metaType];
                const folderArray = this.metadataObjectsListMap[folderType];

                let counter = 0;

                let batchCtrl = <BatchCtrl>{
                    "counter": counter,
                    "resolve": resolve,
                    "reject": reject
                };

                for (var x = 0; x < folderArray.length; x++) {

                    const folder = folderArray[x];

                    var params = <Params>{
                        "metaType": metaType,
                        "folder": folder
                    };

                    batchCtrl.counter = ++counter;

                    // inject the folder before
                    this.metadataObjectsListMap[metaType].push(folder);
                    this.queryListMetadata(params, batchCtrl);

                }// end for

            } catch (exception) {
                reject(exception);
            }// catch exception

        });// end promse

    }// end method

    protected setStandardValueSets(): void {

        this.standardValueSets.forEach(element => {
            this.metadataObjectsListMap[this.StandardValueSet].push(element);
        });// end foreach

    }// end function

    protected repositionSettings(): void {

        let found = false;
        for (var x = 0; x < this.retainedMetadataTypes.length; x++) {
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

            const RecordType = this.RecordType;

            this.org.getConnection().query("SELECT DeveloperName, SobjectType, IsPersonType FROM RecordType " +
                " WHERE SobjectType = 'Account' AND IsPersonType = true").then((result: QueryResult<any>) => {
                    if (result.records) {
                        for (var x = 0; x < result.records.length; x++) {
                            let record = result.records[x];
                            let personRecordType: string = (this.PersonAccount + '.' + record.DeveloperName);
                            this.metadataObjectsListMap[RecordType].push(personRecordType);
                        }// end for
                    }// end if
                    resolve();
                }, (error: any) => {
                    reject(error);
                });

        });// end promise

    }// end method

    protected createPackageFile(packageFile: string) {

        let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xmlContent += '<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';

        this.retainedMetadataTypes.reverse();

        this.repositionSettings();

        for (var x = 0; x < this.retainedMetadataTypes.length; x++) {

            let metaType: string = this.retainedMetadataTypes[x];

            if (this.metadataObjectsListMap[metaType].length === 0) {
                continue;
            }// end if

            let metaItems = this.metadataObjectsListMap[metaType];

            let uniqueMetaItems = [...new Set(metaItems)];

            uniqueMetaItems.sort();

            xmlContent += '  <types>\n';

            for (var y = 0; y < uniqueMetaItems.length; y++) {
                let item = uniqueMetaItems[y];
                xmlContent += '    <members>' + item + '</members>\n';
            }// end for

            xmlContent += '    <name>' + metaType + '</name>\n';
            xmlContent += '  </types>\n';

        }// end for

        xmlContent += '  <version>' + this.apiVersion + '</version>\n';
        xmlContent += '</Package>\n';

        writeFileSync(packageFile, xmlContent);
        console.log(packageFile + ' file successfully saved.');

    }// end function

    // create backup of retrieve meta in-case needed later
    protected createBackup(): void {

        let iso = new Date().toISOString();
        iso = iso.replace(/:/g, '-').split('.')[0];

        let backupFolder = (this.backupRoot + '/' + this.orgAlias); // e.g. backup/DevOrg
        let backupOrgFolder = (backupFolder + '/' + iso); // e.g. backup/DevOrg/2000-00-00T11-11-11
        let backupProjectFile = (backupOrgFolder + '/' + this.unpackagedZip);
        let sourceProjectFile = (this.retrievePath + '/' + this.unpackagedZip);

        if (this.ignoreBackup) {
            console.log('ignoring backup.');
            unlinkSync(sourceProjectFile);
            console.log('deleting temp file: ' + sourceProjectFile);
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

        console.log('backing up from: ' + sourceProjectFile + ' to: ' + backupProjectFile);

        copyFileSync(sourceProjectFile, backupProjectFile);
        console.log('backup finished to file: ' + backupProjectFile);

        unlinkSync(sourceProjectFile);
        console.log('deleting temp file: ' + sourceProjectFile);

    }// end method

    protected async unzipUnpackaged(): Promise<any> {

        return new Promise((resolve, reject) => {

            console.log('unzipping ' + this.zipFilePath);

            yauzl.open(this.zipFilePath, { lazyEntries: true }, (openErr, zipfile) => {

                if (openErr) {
                    return reject(openErr);
                }// end if

                zipfile.readEntry();

                zipfile.once("close", () => {
                    console.log('unzipping complete');
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

        console.info('retrieve directory: ' + this.retrievePath);

        return new Promise((resolve, reject) => {

            console.info('checking existing for clean: ' + this.retrievePath);

            if (existsSync(this.retrievePath)) {
                removeSync(this.retrievePath);
            }// end if

            mkdirSync(this.retrievePath);
            console.info('retrieve source directory cleaned.');

            var retrieveCommand = ('sfdx force:mdapi:retrieve -s -k ' + this.filePackageXmlPath + ' -r ' + this.retrievePath + ' -w -1 -u ' + this.orgAlias);
            console.info(retrieveCommand);
            console.info('retrieving source, please standby this may take a few minutes ...');

            this.command(retrieveCommand).then((result: any) => {

                console.info(result);
                resolve();

            }, (error: any) => {
                console.error(error);
                reject(error);
            });

        }); // end promise

    }// end method

    protected packageFile(): void {

        if (!existsSync(this.manifestDirectory)) {
            mkdirSync(this.manifestDirectory);
            console.info('created manifest directory [' + this.manifestDirectory + '].');
        }// end if

        this.createPackageFile(this.filePackageXmlPath);

    }// end method

    protected init(): void {

        if (!existsSync(this.stageRoot)) {
            mkdirSync(this.stageRoot);
            console.info('staging [' + this.stageRoot + '] directory created.');
        }// end if

        // check if working directory exists
        if (!existsSync(this.stageOrgAliasDirectoryPath)) {
            mkdirSync(this.stageOrgAliasDirectoryPath);
            console.info('staging alias [' + this.stageOrgAliasDirectoryPath + '] directory created.');
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

                console.log('creating backup ...');
                this.createBackup();

                console.info('setup and retrieve stage [' + this.stageOrgAliasDirectoryPath + '] complete.');
                resolve();

            }, (error: any) => {
                console.error(error);
                reject(error);
            });// end unzipUnpackaged

        }); // end promise

    }// end method

    protected queryListMetadata(params: Params, batchCtrl: BatchCtrl): void {

        var metaQueries: Array<ListMetadataQuery>;

        const metaType: string = params.metaType;
        const folder: string = params.folder;

        if (folder) { metaQueries = [{ "type": metaType, "folder": folder }]; }
        else { metaQueries = [{ "type": metaType }]; }

        this.org.getConnection().metadata.list(metaQueries, this.apiVersion).then((result: Array<FileProperties>) => {

            if (result) {

                // check if array first
                if (result instanceof Array) {

                    for (var x = 0; x < result.length; x++) {
                        let metaItem: FileProperties = result[x];
                        if (!this.checkIgnoreManaged(metaItem) &&
                            !this.checkIgnoreNamespaces(metaItem)) {
                            this.metadataObjectsListMap[metaType].push(metaItem.fullName);
                        }// end if
                    }// end for

                } else {

                    // check for single result
                    let metaItem: FileProperties = result;
                    if (!this.checkIgnoreManaged(metaItem) &&
                        !this.checkIgnoreNamespaces(metaItem)) {
                        this.metadataObjectsListMap[metaType].push(metaItem.fullName);
                    }// end if

                }// end else
            }// end else

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

                let metaType = this.sortedMetadataTypes.pop();

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

        await this.listMetadataFolderBatch(this.Dashboard);
        await this.listMetadataFolderBatch(this.Document);
        await this.listMetadataFolderBatch(this.EmailTemplate);
        await this.listMetadataFolderBatch(this.Report);

    }// end method

    protected checkStageOrDevModePackageXml(): void {

        if (this.devMode === true) {

            copySync(this.filePackageXmlPath, this.packageXml);

            console.log('copied ' + this.packageXml);

        }// end if

    }// end method

    protected checkStageOrDevModeFiles(): void {

        if (this.devMode === true) {

            if (existsSync(this.srcFolder)) {
                removeSync(this.srcFolder);
            }// end if

            mkdirSync(this.srcFolder);

            copySync(this.targetDirectorySource, this.srcFolder);
            console.log('copied ' + this.srcFolder);

            if (existsSync(this.stageRoot)) {
                removeSync(this.stageRoot);
                console.log('deleted ' + this.stageRoot);
            }// end if

            removeSync(this.stageRoot);

            if (existsSync(this.backupRoot)) {
                removeSync(this.backupRoot);
                console.log('deleted ' + this.backupRoot);
            }// end if

        }// end if

    }// end method

    public async process(): Promise<any> {

        // init
        console.log('initialising ...');
        this.init();

        // async calls
        console.log('describe metadata ...');
        await this.describeMetadata();

        console.log('list metadata ...');
        await this.listMetadata();

        console.log('list metadata folders ...');
        await this.listMetadataFolders();

        console.log('resolve PersonAccount RecordTypes ...');
        await this.resolvePersonAccountRecordTypes();

        // sync calls
        console.log('set StandardValueSets ...');
        this.setStandardValueSets();

        // create package.xml
        console.log('package.xml file ...');
        this.packageFile();

        console.log('check stage or dev mode package.xml ...');
        this.checkStageOrDevModePackageXml();

        if (!this.manifestOnly) {

            console.log('retrieve metadata files ...');
            await this.retrieveMetadata();

            // unzip retrieve and backup zip
            console.log('unzip and backup zip ...');
            await this.unzipAndBackup();

            // check if staging only or clean for src dev only
            console.log('check stage or dev mode src files and cleanup ...');
            this.checkStageOrDevModeFiles();
            console.info('check process completed.');

        } else {
            // this.checkStageOrDevMode();
            console.info('only created manifest package.xml, process completed.');
        }// end else

    }// end process

};// end class
