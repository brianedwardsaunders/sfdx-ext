import { existsSync, writeFile, mkdirSync, copySync, removeSync } from 'fs-extra';
import { chdir, cwd } from 'process';
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

export class SourceRetrieveUtility {

    constructor(
        protected orgAlias: string,
        protected apiVersion: string,
        protected projectDirectory: string,
        protected sfdxDirectory: string,
        protected ignoreBackup: boolean,
        protected ignoreManaged: boolean,
        protected ignoreNamespaces: boolean,
        protected manifestOnly: boolean) {
        // noop
    }// end constructor

    protected bufferOptions: Object = { maxBuffer: 10 * 1024 * 1024 };
    protected MetadataListBatchSize = 20;

    protected stageRoot: string = 'stage';
    protected backupRoot: string = 'backup';
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
        "AnimationRule",
        "Audience",
        "Bot",
        "FlowDefinition",
        "OauthCustomScope",
        "Prompt"
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
        "RecordType",
        "StandardValueSet",
        "ValidationRule",
        "WebLink",
        "WorkflowAlert",
        "WorkflowFieldUpdate",
        "WorkflowRule",
        "WorkflowTask",
        "WorkflowSend",
        "WorkflowOutboundMessage",
        "WorkflowKnowledgePublish"
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
        "EventSubject",
        "EventType",
        "IdeaMultiCategory",
        "IdeaStatus",
        "Industry",
        "LeadSource",
        "LeadStatus",
        "OpportunityCompetitor",
        "OpportunityStage",
        "OpportunityType",
        "OrderType",
        "PartnerRole",
        "Product2Family",
        "QuickTextCategory",
        "QuickTextChannel",
        "QuoteStatus",
        "Salutation",
        "SolutionStatus",
        "TaskPriority",
        "TaskStatus",
        "TaskSubject",
        "TaskType"
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
    protected stageOrgAliasDirectory = (this.sfdxDirectory + '/main/default');
    protected stageOrgAliasDirectoryPath = (this.stageRoot + '/' + this.orgAlias);
    protected projectDirectoryPath = (this.stageOrgAliasDirectoryPath + '/' + this.projectDirectory);

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

        let excluded: boolean = false;

        this.metaObjectExcludes.forEach(element => {
            if (element === metaObject) {
                excluded = true;
                return;
            }// end if
        });

        return excluded;

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

                        if (this.isExcludedMetaType(lookupKey)) {

                            console.log('Ignoring unsupported meta object type: ' + lookupKey);
                            metadataObjects.splice(x, 1);
                            continue;

                        } else {

                            if (this.metadataObjectsLookup[lookupKey] === undefined) {
                                this.metadataObjectsLookup[lookupKey] = [];
                            }// end if

                            if (this.metadataObjectsListMap[lookupKey] === undefined) {
                                this.metadataObjectsListMap[lookupKey] = [];
                            }// end if

                            this.sortedMetadataTypes.push(lookupKey);
                            this.metadataObjectsLookup[lookupKey].push(metadataObject);

                        }// end else

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
            // console.log('ignoring namespaced item: ' + metaItem["fullName"] + ' namespacePrefix: ' + metaItem["namespacePrefix"]);
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
            // console.log('ignoring managed item: ' + metaItem["fullName"] + ' manageableState: ' + metaItem["manageableState"]);
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
                this.retainedMetadataTypes.slice(x, 1);
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

            xmlContent += '\t<types>\n';

            for (var y = 0; y < uniqueMetaItems.length; y++) {
                let item = uniqueMetaItems[y];
                xmlContent += '\t\t<members>' + item + '</members>\n';
            }// end for

            xmlContent += '\t\t<name>' + metaType + '</name>\n';
            xmlContent += '\t</types>\n';
        }// end for

        xmlContent += '\t<version>' + this.apiVersion + '</version>\n';
        xmlContent += '</Package>\n';

        console.log(xmlContent);

        writeFile(packageFile, xmlContent, function (error: any) {
            if (error) { throw error; }
            console.log(packageFile + ' file successfully saved.');
        });

    }// end function

    // create backup of retrieve meta in-case needed later
    protected createBackup(): void {

        if (this.ignoreBackup) {
            console.log('ignoring backup.');
            return;
        }

        let iso = new Date().toISOString();
        iso = iso.replace(/:/g, '-').split('.')[0];

        let backupFolder = (this.backupRoot + '/' + this.orgAlias); // e.g. backup/DevOrg
        // console.log('backupFolder: ' + backupFolder);
        if (!existsSync(backupFolder)) {
            mkdirSync(backupFolder);
        }

        let backupOrgFolder = (backupFolder + '/' + this.projectDirectory + '_' + iso);
        // console.log('backupOrgFolder: ' + backupOrgFolder);
        mkdirSync(backupOrgFolder);

        let backupProjectFolder = backupOrgFolder;
        let sourceProjectFolder = (this.stageOrgAliasDirectoryPath + '/' + this.projectDirectory);
        console.log('backing up from: ' + sourceProjectFolder + ' to: ' + backupProjectFolder);

        copySync(sourceProjectFolder, backupProjectFolder);
        console.log('backup finished to folder: ' + backupProjectFolder);

    }// end method

    protected async retrieveMetadataFiles(): Promise<any> {

        return new Promise((resolve, reject) => {
            if (this.manifestOnly) {
                console.info('only created manifest/package.xml, process completed.');
                resolve();
            }
            else {
                chdir(this.projectDirectoryPath);
                console.info('changing directory: ' + this.projectDirectoryPath);
                console.info(cwd());

                console.info('checking existing for clean: ' + this.stageOrgAliasDirectory);
                if (existsSync(this.stageOrgAliasDirectory)) {
                    removeSync(this.stageOrgAliasDirectory);
                    console.info('sfdx source directory cleaned.');
                }// end if

                var retrieveCommand = 'sfdx force:source:retrieve -x ./manifest/package.xml -u ' + this.orgAlias;
                console.info(retrieveCommand);
                console.info('retrieving source from org, please standby this may take a few minutes ...');

                this.command(retrieveCommand).then((result: any) => {

                    console.info(result);
                    // reset back to relative dir (destination)
                    process.chdir('../../..');
                    console.info(process.cwd());

                    console.log('creating backup ...');
                    this.createBackup();

                    console.info('setup and retrieve stage [' + this.projectDirectory + '] complete.');
                    resolve();

                }, (error: any) => {
                    console.error(error);
                    reject(error);
                });
            }
        });

    }// end method

    protected packageFile(): void {

        const filePackageXmlPath = (this.projectDirectoryPath + '/' + this.manifest + '/' + this.filePackageXml);
        this.createPackageFile(filePackageXmlPath);

    }// end method

    public async process(): Promise<any> {

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
        await this.retrieveMetadataFiles();

    }// end process

};
