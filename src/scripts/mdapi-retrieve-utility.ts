import {
    existsSync, mkdirSync, removeSync, unlinkSync, mkdirp,
    createWriteStream, writeFileSync, copyFileSync, renameSync
} from 'fs-extra';
import {
    QueryResult, ListMetadataQuery, FileProperties,
    DescribeMetadataResult, MetadataObject
} from 'jsforce';
import { chdir, cwd } from 'process';
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
        protected stageRoot: string,
        protected apiVersion: string,
        protected ignoreBackup: boolean,
        protected ignoreManaged: boolean,
        protected ignoreNamespaces: boolean,
        protected manifestOnly: boolean) {
        // noop
    }// end constructor

    protected bufferOptions: Object = { maxBuffer: 10 * 1024 * 1024 };
    protected MetadataListBatchSize = 30;

    // protected stageRoot: string = 'stage'; // param
    protected backupRoot: string = 'backup'; // default
    protected retrieveRoot: string = 'retrieve'; // default
    protected unpackagedRoot: string = 'unpackaged';
    protected retrieveSource: string = 'src';
    protected unpackagedZip: string = 'unpackaged.zip';
    protected manifest: string = 'manifest';
    protected filePackageXml: string = 'package.xml';

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
        // "AnimationRule",
        // "Audience",
        // "Bot",
        // "FlowDefinition", (rather exclude in the diff ignores)
        // "OauthCustomScope",
        // "Prompt"
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
    protected stageOrgAliasDirectoryPath = (this.stageRoot + '/' + this.orgAlias);

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
        });

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

            this.metadataObjectsLookup[metadata].push(
                {
                    directoryName: null,
                    inFolder: true,
                    metaFile: false,
                    suffix: null,
                    xmlName: metadata
                });
        });

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

            this.metadataObjectsLookup[metadata].push(
                {
                    directoryName: null,
                    inFolder: true,
                    metaFile: false,
                    suffix: null,
                    xmlName: metadata
                });
        });

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
        });

    }// end method

    protected checkIgnoreNamespaces(metaItem: FileProperties): boolean {

        if (!this.ignoreNamespaces) {
            return false;
        }
        else if (!(metaItem.namespacePrefix === undefined ||
            metaItem.namespacePrefix === null ||
            metaItem.namespacePrefix === "")) { // pi or Finserv
            return true;
        }
        return false;

    }// end method 

    protected checkIgnoreManaged(metaItem: FileProperties): boolean {

        if (!this.ignoreManaged) {
            return false;
        }
        else if (!(metaItem.manageableState === undefined ||
            metaItem.manageableState === null) &&
            !(metaItem.manageableState === "unmanaged")) { // installed
            return true;
        }
        return false;

    }// end method 

    // listMetadataFolderBatch
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

                    // console.log('Running conn.metadata.list [' + metaType + '] folder: [' + folder + ']');

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
        });

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
        }

    }// end method

    protected async resolvePersonAccountRecordTypes(): Promise<any> {

        return new Promise((resolve, reject) => {

            const RecordType = this.RecordType;

            this.org.getConnection().query("SELECT DeveloperName, SobjectType, IsPersonType FROM RecordType " +
                " WHERE SobjectType = 'Account' AND IsPersonType = true")
                .then((result: QueryResult<any>) => {
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
            }

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

        // console.log(xmlContent);

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
        let sourceProjectFile = (this.stageOrgAliasDirectoryPath + '/' + this.retrieveRoot + '/' + this.unpackagedZip);

        if (this.ignoreBackup) {
            console.log('ignoring backup.');
            unlinkSync(sourceProjectFile);
            console.log('deleting temp file: ' + sourceProjectFile);
            return;
        }

        if (!existsSync(this.backupRoot)) {
            mkdirSync(this.backupRoot);
        }

        if (!existsSync(backupFolder)) {
            mkdirSync(backupFolder);
        }

        if (!existsSync(backupOrgFolder)) {
            mkdirSync(backupOrgFolder);
        }

        console.log('backing up from: ' + sourceProjectFile + ' to: ' + backupProjectFile);

        copyFileSync(sourceProjectFile, backupProjectFile);
        console.log('backup finished to file: ' + backupProjectFile);

        unlinkSync(sourceProjectFile);
        console.log('deleting temp file: ' + sourceProjectFile);

    }// end method

    protected async unzipUnpackaged(): Promise<any> {

        return new Promise((resolve, reject) => {

            let zipFilename: string = (this.retrieveRoot + '/' + this.unpackagedZip);
            let targetDirectory: string = (this.retrieveRoot + '/' + this.unpackagedRoot);

            console.log('unzipping ' + zipFilename);

            yauzl.open(zipFilename, { lazyEntries: true }, (openErr, zipfile) => {

                if (openErr) {
                    return reject(openErr);
                }// end if

                zipfile.readEntry();

                zipfile.once("close", () => {
                    console.log('unzipping complete');
                    resolve();
                });

                zipfile.on("entry", (entry: any) => {
                    zipfile.openReadStream(entry, (unzipErr, readStream) => {
                        if (unzipErr) {
                            return reject(unzipErr);
                        }
                        else if (/\/$/.test(entry.fileName)) { // read directory
                            zipfile.readEntry();
                            return;
                        }
                        let outputDir = path.join(targetDirectory, path.dirname(entry.fileName));
                        let outputFile = path.join(targetDirectory, entry.fileName);
                        mkdirp(outputDir, (mkdirErr: any) => {
                            if (mkdirErr) {
                                return reject(mkdirErr);
                            }
                            readStream.pipe(createWriteStream(outputFile));
                            readStream.on("end", () => {
                                // console.log('unzipping end');
                                zipfile.readEntry();
                            });
                        });
                    });
                });
            });
        });

    }// end method

    protected async retrieveMetadata(): Promise<any> {

        chdir(this.stageOrgAliasDirectoryPath);
        console.info('changing directory: ' + this.stageOrgAliasDirectoryPath);
        console.info(cwd());

        return new Promise((resolve, reject) => {

            console.info('checking existing for clean: ' + this.retrieveRoot);
            if (existsSync(this.retrieveRoot)) {
                removeSync(this.retrieveRoot);
            }// end if
            mkdirSync(this.retrieveRoot);
            console.info('Retrieve source directory cleaned.');

            var retrieveCommand = ('sfdx force:mdapi:retrieve -s -k manifest/package.xml -r ' + this.retrieveRoot + ' -w -1 -u ' + this.orgAlias);
            console.info(retrieveCommand);
            console.info('retrieving source, please standby this may take a few minutes ...');

            this.org.getConnection().metadata.retrieve

            this.command(retrieveCommand).then((result: any) => {

                console.info(result);

                resolve();

            }, (error: any) => {
                console.error(error);
                reject(error);
            });
        });

    }// end method

    protected packageFile(): void {

        const manifestDirectory = (this.stageOrgAliasDirectoryPath + '/' + this.manifest);
        const filePackageXmlPath = (manifestDirectory + '/' + this.filePackageXml);

        if (!existsSync(manifestDirectory)) {
            mkdirSync(manifestDirectory);
            console.info('Created manifest directory [' + manifestDirectory + '].');
        }// end if
        this.createPackageFile(filePackageXmlPath);

    }// end method

    protected init(): void {

        if (!existsSync(this.stageRoot)) {
            mkdirSync(this.stageRoot);
            console.info('Staging  [' + this.stageRoot + '] directory created.');
        }// end if

        // check if working directory exists
        if (!existsSync(this.stageOrgAliasDirectoryPath)) {
            mkdirSync(this.stageOrgAliasDirectoryPath);
            console.info('Staging OrgAlias [' + this.stageOrgAliasDirectoryPath + '] directory created.');
        }// end if

    }// end method

    protected async unzipAndBackup(): Promise<any> {

        return new Promise((resolve, reject) => {

            let targetDirectoryUnpackaged: string = (this.retrieveRoot + '/' + this.unpackagedRoot);
            let targetDirectorySource: string = (this.retrieveRoot + '/' + this.retrieveSource);

            if (existsSync(targetDirectorySource)) {
                removeSync(targetDirectorySource);
            }// end if

            this.unzipUnpackaged().then(() => {

                // rename unmanaged to src
                renameSync(targetDirectoryUnpackaged, targetDirectorySource);

                // reset back to relative dir (destination)
                process.chdir('../..');
                console.info(process.cwd());

                console.log('creating backup ...');
                this.createBackup();

                console.info('setup and retrieve stage [' + this.stageOrgAliasDirectoryPath + '] complete.');
                resolve();

            }, (error: any) => {
                console.error(error);
                reject(error);
            });
        });
    }// end method

    protected queryListMetadata(params: Params, batchCtrl: BatchCtrl): void {

        var metaQueries: Array<ListMetadataQuery>;

        const metaType: string = params.metaType;
        const folder: string = params.folder;

        if (folder) {
            metaQueries = [{ "type": metaType, "folder": folder }];
        }
        else {
            metaQueries = [{ "type": metaType }];
        }

        this.org.getConnection().metadata.list(metaQueries, this.apiVersion).then((result: Array<FileProperties>) => {

            try {

                // let included: number = 0;

                if (result) {
                    // check if array first
                    if (result instanceof Array) {

                        for (var x = 0; x < result.length; x++) {
                            let metaItem: FileProperties = result[x];
                            if (!this.checkIgnoreManaged(metaItem) &&
                                !this.checkIgnoreNamespaces(metaItem)) {
                                // included++;
                                this.metadataObjectsListMap[metaType].push(metaItem.fullName);
                            }// end if
                        }// end for

                        // console.log('Retrieved [' + metaType + '] with (' + included + ' of ' + result.length + ') results');

                    } else {
                        // check for single result
                        let metaItem: FileProperties = result;
                        if (!this.checkIgnoreManaged(metaItem) &&
                            !this.checkIgnoreNamespaces(metaItem)) {
                            // included++;
                            this.metadataObjectsListMap[metaType].push(metaItem.fullName);
                        }// end if

                        // console.log('Retrieved [' + metaType + '] with (' + included + ' of 1) result');
                    }
                }// end else
                else {
                    // noop
                    // console.debug('Retrieved [' + metaType + '] with (0) results');
                }

                if (--batchCtrl.counter <= 0) {
                    batchCtrl.resolve(this.metadataObjectsListMap);
                }// end if
            }
            catch (error) {
                batchCtrl.reject(error);
            }// end catch

        }, (error: any) => {
            batchCtrl.reject(error);
        });// end promise

    }// end method

    protected listMetadataBatch(): Promise<any> {

        return new Promise((resolve, reject) => {

            try {

                let counter = 0;

                let batchCtrl = <BatchCtrl>{
                    "counter": counter,
                    "resolve": resolve,
                    "reject": reject
                };

                for (var x = 0; x < this.MetadataListBatchSize; x++) {

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

            } catch (exception) {
                reject(exception);
            }// catch exception

        });// end promse

    }// end method

    protected async listMetadata(): Promise<any> {

        while (this.sortedMetadataTypes.length > 0) {
            await this.listMetadataBatch();
        }// end while

    }// end method

    protected async listMetadataFolders() {

        await this.listMetadataFolderBatch(this.Dashboard);
        await this.listMetadataFolderBatch(this.Document);
        await this.listMetadataFolderBatch(this.EmailTemplate);
        await this.listMetadataFolderBatch(this.Report);

    }// end method

    public async process(): Promise<any> {

        this.init();

        // async calls
        console.log('describeMetadata ...');
        await this.describeMetadata();

        console.log('listMetadata ...');
        await this.listMetadata();

        console.log('listMetadataFolders ...');
        await this.listMetadataFolders();

        console.log('resolvePersonAccountRecordTypes ...');
        await this.resolvePersonAccountRecordTypes();

        // sync calls
        console.log('setStandardValueSets ...');
        this.setStandardValueSets();

        // create package.xml
        console.log('packageFile ...');
        this.packageFile();

        if (!this.manifestOnly) {
            // retrieve payload (payload)
            console.log('retrieveMetadata ...');
            await this.retrieveMetadata();
            // unzip retrieve and backup zip
            console.log('unzipAndBackup ...');
            await this.unzipAndBackup();
        }
        else {
            console.info('only created manifest/package.xml, process completed.');
        }// end else

    }// end process

};
