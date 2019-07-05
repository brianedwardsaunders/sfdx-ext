import { existsSync, mkdirSync, removeSync, unlinkSync, mkdirp, createWriteStream, writeFileSync, copyFileSync, renameSync } from 'fs-extra';
import { chdir, cwd } from 'process';
import path = require('path');
import yauzl = require('yauzl');
const exec = require('child_process').exec;

export interface Result {
    result: Object;
}

export interface BatchCtrl {
    counter: number;
    resolve: any;
    reject: any;
}

export interface Params {
    metaType: string;
    command: string;
}

export class MdapiRefreshUtility {

    constructor(
        protected orgAlias: string,
        protected apiVersion: string,
        protected ignoreBackup: boolean,
        protected ignoreManaged: boolean,
        protected ignoreNamespaces: boolean,
        protected manifestOnly: boolean) {
        // noop
    }// end constructor

    protected bufferOptions: Object = { maxBuffer: 10 * 1024 * 1024 };
    protected MetadataListBatchSize = 50;

    protected stageRoot: string = 'stage';
    protected backupRoot: string = 'backup';
    protected retrieveRoot: string = 'retrieve';
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

    protected metadataFoldersLookup: Object =
        {
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

                let describeMetadataCommand: string = ('sfdx force:mdapi:describemetadata -a '
                    + this.apiVersion + ' -u ' + this.orgAlias + ' --json');

                console.log('Running command: ' + describeMetadataCommand);

                this.command(describeMetadataCommand).then((result: any) => {

                    let jsonObject: Result = JSON.parse(result);
                    let metadataObjects: Array<Object> = jsonObject.result["metadataObjects"];

                    for (var x = 0; x < metadataObjects.length; x++) {

                        let metadataObject: Object = metadataObjects[x];
                        let lookupKey: string = metadataObject["xmlName"];

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

    protected checkIgnoreNamespaces(metaItem: Object): boolean {

        if (!this.ignoreNamespaces) {
            return false;
        }
        else if (!(metaItem["namespacePrefix"] === undefined ||
            metaItem["namespacePrefix"] === null ||
            metaItem["namespacePrefix"] === "")) { // pi or Finserv
            return true;
        }
        return false;

    }// end method 

    protected checkIgnoreManaged(metaItem: Object): boolean {

        if (!this.ignoreManaged) {
            return false;
        }
        else if (!(metaItem["manageableState"] === undefined ||
            metaItem["manageableState"] === null) &&
            !(metaItem["manageableState"] === "unmanaged")) { // installed
            return true;
        }
        return false;

    }// end method 

    protected runRetrieveMetadataListCommand(params: Params, batchCtrl: BatchCtrl): void {

        const metaType = params.metaType;

        this.command(params.command).then((result: any) => {

            try {

                let jsonResult: Result = JSON.parse(result);
                let included: number = 0;

                if ((jsonResult.result === undefined) || (jsonResult.result === null)) { // check for nill result

                    console.log('Retrieved [' + metaType + '] empty (0) result');

                } else {
                    // check if array first
                    if (jsonResult.result instanceof Array) {

                        jsonResult.result.forEach(metaItem => {
                            if (!this.checkIgnoreManaged(metaItem) &&
                                !this.checkIgnoreNamespaces(metaItem)) {
                                included++;
                                this.metadataObjectsListMap[metaType].push(metaItem["fullName"]);
                            }// end if
                        });

                        console.log('Retrieved [' + metaType + '] with (' + included + ' of ' + jsonResult.result.length + ') results');

                    } else if (jsonResult.result instanceof Object) {
                        // check for single result
                        let metaItem: Object = jsonResult.result;
                        if (!this.checkIgnoreManaged(metaItem) &&
                            !this.checkIgnoreNamespaces(metaItem)) {
                            included++;
                            this.metadataObjectsListMap[metaType].push(metaItem["fullName"]);
                        }// end if

                        console.log('Retrieved [' + metaType + '] with (' + included + ' of 1) result');

                    } else {
                        console.log('Unexpected type result: ', jsonResult);
                        throw jsonResult;
                    }// end else
                }// end else

                if (--batchCtrl.counter <= 0) {
                    batchCtrl.resolve(this.metadataObjectsListMap);
                }// end if
            }
            catch (error) {
                batchCtrl.reject(error);
            }// end catch

        }, (error) => {
            batchCtrl.reject(error);
        });// end command

    }// end method

    // retrieveMetadataListBatch
    protected retrieveMetadataListBatch(): Promise<any> {

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

                    let command = ('sfdx force:mdapi:listmetadata -m ' + metaType + ' -u ' + this.orgAlias + ' --json');
                    console.log('Running listmetadata command: ' + command);

                    batchCtrl.counter = ++counter;

                    let params = <Params>{
                        "command": command,
                        "metaType": metaType
                    };

                    this.runRetrieveMetadataListCommand(params, batchCtrl);

                }// end for

            } catch (exception) {
                reject(exception);
            }// catch exception

        });// end promse

    }// end method

    // retrieveMetadataFolderBatch
    protected retrieveMetadataFolderBatch(metaType: string): Promise<any> {

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

                    let command = ('sfdx force:mdapi:listmetadata -m ' + metaType + ' --folder '
                        + folder + ' -u ' + this.orgAlias + ' --json');

                    console.log('Running command: ' + command);

                    var params = <Params>{
                        "command": command,
                        "metaType": metaType
                    };

                    batchCtrl.counter = ++counter;

                    // inject the folder before
                    this.metadataObjectsListMap[metaType].push(folder);
                    this.runRetrieveMetadataListCommand(params, batchCtrl);

                }// end for

            } catch (exception) {
                reject(exception);
            }// catch exception

        });// end promse

    }// end method

    protected async retrieveMetadataLists() {

        while (this.sortedMetadataTypes.length > 0) {
            await this.retrieveMetadataListBatch();
        }// end while

    }// end method

    protected setStandardValueSets(): void {

        this.standardValueSets.forEach(element => {
            this.metadataObjectsListMap[this.StandardValueSet].push(element);
        });

    }// end function

    protected async retrieveMetadataFolders() {

        await this.retrieveMetadataFolderBatch(this.Dashboard);
        await this.retrieveMetadataFolderBatch(this.Document);
        await this.retrieveMetadataFolderBatch(this.EmailTemplate);
        await this.retrieveMetadataFolderBatch(this.Report);

    }// end method

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

            let retrieveCommand = 'sfdx force:schema:sobject:describe -s Account -u ' + this.orgAlias + ' --json';
            console.info(retrieveCommand + ' resolving possible missing PersonAccount recordtypes.');

            this.command(retrieveCommand).then((result: any) => {

                try {

                    let jsonResult: Result = JSON.parse(result);
                    const recordTypeInfos: Array<any> = jsonResult.result["recordTypeInfos"];

                    recordTypeInfos.forEach(recordTypeInfo => {
                        var personRecordType = (this.PersonAccount + '.' + recordTypeInfo.developerName);
                        this.metadataObjectsListMap[this.RecordType].push(personRecordType);
                    });

                    resolve();

                } catch (exception) {
                    console.error(exception);
                    reject(exception);
                }
            }, (error: any) => {
                console.error(error);
                reject(error);
            });
        });

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

        console.log(xmlContent);

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

    protected async retrieveMetadataFiles(): Promise<any> {

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

            var retrieveCommand = ('sfdx force:mdapi:retrieve -s -k manifest/package.xml -r ' + this.retrieveRoot + ' -u ' + this.orgAlias);
            console.info(retrieveCommand);
            console.info('retrieving source from org, please standby this may take a few minutes ...');

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

        // check if working directory exists
        if (!existsSync(this.stageOrgAliasDirectoryPath)) {
            mkdirSync(this.stageOrgAliasDirectoryPath);
            console.info('Staging alias [' + this.stageOrgAliasDirectoryPath + '] directory created.');
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

    public async process(): Promise<any> {

        this.init();
        // async calls
        await this.describeMetadata();
        await this.retrieveMetadataLists();
        await this.retrieveMetadataFolders();
        await this.resolvePersonAccountRecordTypes();
        // sync calls
        this.setStandardValueSets();
        // create package.xml
        this.packageFile();
        // retrieve payload (payload)

        if (!this.manifestOnly) {
            await this.retrieveMetadataFiles();
            // unzip retrieve and backup zip
            await this.unzipAndBackup();
        }
        else {
            console.info('only created manifest/package.xml, process completed.');
        }// end else

    }// end process

};
