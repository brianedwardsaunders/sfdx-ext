import { Org } from '@salesforce/core';
import { chdir, cwd } from 'process';
import {
    DescribeMetadataResult, MetadataObject, ListMetadataQuery,
    FileProperties, DescribeSObjectResult, RecordTypeInfo, Field
} from 'jsforce';
import { existsSync, writeFile, mkdirSync, copySync, removeSync } from 'fs-extra';

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
    metaType?: string;
    folder?: string;
    objectName?: string;
}

export interface MetadataQuery {
    "metaType": string,
    "queryFields": Array<string>;
    "filter": string
    "joinChar": string;
    "toolingApi": boolean;
}

export class SourceRetrieveUtility {

    constructor(
        protected org: Org,
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
    protected batchSize = 25;
    protected ERROR_NOT_FOUND = "NOT_FOUND"

    protected stageRoot: string = 'stage';
    protected backupRoot: string = 'backup';
    protected manifest: string = 'manifest';
    protected filePackageXml: string = 'package.xml';

    // protected metadataTypes: Array<MetadataObject> = [];
    protected sortedMetadataTypes: Array<string> = [];
    protected retainedMetadataTypes: Array<string> = [];
    protected sortedCustomObjectNames: Array<string> = [];
    protected retainedCustomObjectNames: Array<string> = [];

    protected metadataTypesLookup: Object = {};
    protected metadataTypesListMap: Object = {};

    protected StandardValueSet: string = 'StandardValueSet';
    protected Settings: string = 'Settings';
    protected CustomObject: string = 'CustomObject';
    protected RecordType: string = 'RecordType';
    protected CustomField: string = 'CustomField';
    protected BusinessProcess: string = 'BusinessProcess';
    protected Account: string = 'Account';
    protected PersonAccount: string = 'PersonAccount';
    protected CompactLayout: string = 'CompactLayout';
    protected Dashboard: string = 'Dashboard';
    protected Document: string = 'Document';
    protected EmailTemplate: string = 'EmailTemplate';
    protected FieldSet: string = 'FieldSet';
    protected Layout: string = 'Layout';
    protected ListView: string = 'ListView';
    protected Report: string = 'Report';
    protected DashboardFolder: string = 'DashboardFolder';
    protected DocumentFolder: string = 'DocumentFolder';
    protected EmailFolder: string = 'EmailFolder';
    protected ReportFolder: string = 'ReportFolder';
    protected ValidationRule: string = 'ValidationRule';
    protected WebLink: string = 'WebLink';

    protected metaObjectExcludes: Array<string> = [
        "AnimationRule",
        "Audience",
        "Bot", // check this
        "BotVersion", // throws a query error
        "FlowDefinition"
    ];

    protected Id: string = "Id";
    protected Name: string = "Name";
    protected DeveloperName: string = "DeveloperName";
    protected ManageableState: string = "ManageableState";
    protected NamespacePrefix: string = "NamespacePrefix";
    protected TableEnumOrId: string = "TableEnumOrId";
    protected SobjectType: string = "SobjectType";
    protected LayoutType: string = "LayoutType";
    protected ValidationName: string = "ValidationName";
    protected FullName: string = 'FullName';
    protected DOT: string = ".";
    protected DASH: string = "-";

    protected metadataQuery: Array<MetadataQuery> = [
        {
            "metaType": this.CustomField,
            "queryFields": [this.DeveloperName, this.ManageableState, this.NamespacePrefix, this.TableEnumOrId],
            "filter": this.TableEnumOrId,
            "joinChar": this.DOT,
            "toolingApi": true
        },
        /* {
            "metaType": this.BusinessProcess,
            "queryFields": [this.Name, this.ManageableState, this.NamespacePrefix],
            "filter": null,
            "joinChar": null,
            "toolingApi": true
        }, */
        {
            "metaType": this.CompactLayout,
            "queryFields": [this.DeveloperName, this.ManageableState, this.NamespacePrefix, this.SobjectType],
            "filter": this.SobjectType,
            "joinChar": this.DOT,
            "toolingApi": true
        },
        /* {
            "metaType": this.FieldSet,
            "queryFields": [this.DeveloperName, this.ManageableState, this.NamespacePrefix],
            "filter": null,
            "joinChar": null,
            "toolingApi": true
        }, */
        {
            "metaType": this.Layout,
            "queryFields": [this.Name, this.ManageableState, this.NamespacePrefix, this.TableEnumOrId, this.LayoutType],
            "filter": this.TableEnumOrId,
            "joinChar": this.DASH,
            "toolingApi": true
        },
        {
            "metaType": this.ListView,
            "queryFields": [this.DeveloperName, this.NamespacePrefix, this.SobjectType],
            "filter": this.SobjectType,
            "joinChar": this.DOT,
            "toolingApi": false
        },
        {
            "metaType": this.RecordType,
            "queryFields": [this.Name, this.ManageableState, this.NamespacePrefix, this.SobjectType],
            "filter": this.SobjectType,
            "joinChar": this.DOT,
            "toolingApi": true
        },
        /* {
            "metaType": this.ValidationRule,
            "queryFields": [this.ValidationName, this.ManageableState, this.NamespacePrefix],
            "filter": null,
            "joinChar": null,
            "toolingApi": true
        },
        {
            "metaType": this.WebLink,
            "queryFields": [this.Name, this.ManageableState, this.NamespacePrefix],
            "filter": null,
            "joinChar": null,
            "toolingApi": true
        } */
    ];

    // NEED TO QUERY QUERY OBJECT AS WELL, BUSINESSPROCESS, FIELDS, RECORD TYPES, FIELDSET, QUERY MATCHING RULE.
    // AND BULK THE CALLS.

    //MISSING ValidationRule
    //MISSING WebLink

    //Workflow Alert
    //Workflow Rules
    //Workflow Task
    //Workflow Field Update

    //some sharing rules.


    //LAYOUT

    //MISSING DUPLICATE RULE
    //MISSING MATCHING RULE


    /* protected metaObjectExcludes: Array<string> = [
        "AnimationRule",
        "Audience",
        "Bot",
        "FlowDefinition",
        "OauthCustomScope",
        "Prompt"
    ]; */

    /* protected metadataFoldersOther: Array<string> = [
        "AssignmentRule",
        "AutoResponseRule",
        "BotVersion",
        "BusinessProcess",
        "CompactLayout",
        "CustomField",
        "CustomLabel",
        "EscalationRule",
        "FieldSet",
        "Index",
        "ListView",
        "ManagedTopic",
        "MatchingRule",
        "RecordType",
        "SharingOwnerRule",
        "SharingCriteriaRule",
        "SharingReason",
        "ValidationRule",
        "WebLink",
        "WorkflowAlert",
        "WorkflowFieldUpdate",
        "WorkflowRule",
        "WorkflowTask",
        "WorkflowSend",
        "WorkflowOutboundMessage",
        "WorkflowKnowledgePublish"
    ]; */

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

    protected metadataFoldersLookup: Object = {
        "Dashboard": this.DashboardFolder,
        "Document": this.DocumentFolder,
        "EmailTemplate": this.EmailFolder,
        "Report": this.ReportFolder
    };

    protected metadataFolders: Array<string> = [
        this.DashboardFolder,
        this.DocumentFolder,
        this.EmailFolder,
        this.ReportFolder
    ];

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

        let isExcluded: boolean = false;

        this.metaObjectExcludes.forEach(element => {
            if (element === metaObject) {
                isExcluded = true;
                return;
            }
        });

        return isExcluded;

    }// end method 

    /* protected describeMetadataOthers(): void {

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
    */

    protected describeMetadataFolders(): void {

        this.metadataFolders.forEach(metadata => {

            this.sortedMetadataTypes.push(metadata);

            this.metadataTypesLookup[metadata] = [];

            this.metadataTypesListMap[metadata] = [];

            this.metadataTypesLookup[metadata].push(
                {
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

                const conn = this.org.getConnection();

                conn.metadata.describe(this.apiVersion).then((result: DescribeMetadataResult) => {

                    let metadataObjects: Array<MetadataObject> = result.metadataObjects;

                    for (var x = 0; x < metadataObjects.length; x++) {

                        let metadataObject: MetadataObject = metadataObjects[x];

                        let xmlName: string = metadataObject.xmlName;

                        if (this.isExcludedMetaType(xmlName)) continue;

                        this.sortedMetadataTypes.push(xmlName);

                        this.metadataTypesListMap[xmlName] = []; // init

                        this.metadataTypesLookup[xmlName] = [];

                        this.metadataTypesLookup[xmlName].push(metadataObject);

                        // check child elements
                        if (!(metadataObject.childXmlNames === undefined || metadataObject.childXmlNames === null)) {

                            for (var y = 0; y < metadataObject.childXmlNames.length; y++) {

                                let childXmlName = metadataObject.childXmlNames[y];

                                if (this.isExcludedMetaType(childXmlName)) continue;

                                this.sortedMetadataTypes.push(childXmlName);

                                this.metadataTypesListMap[childXmlName] = [];

                                this.metadataTypesLookup[childXmlName] = [];

                                this.metadataTypesLookup[childXmlName].push({
                                    directoryName: null, // check this later
                                    inFolder: true,
                                    metaFile: false,
                                    suffix: null,
                                    xmlName: childXmlName
                                });

                            }// end for

                        }// end if

                    }// end for

                    this.describeMetadataFolders();

                    this.sortedMetadataTypes.sort();

                    resolve();

                }, (error: any) => {
                    reject(error);
                });

            } catch (exception) {
                reject(exception);
            }// end catch
        });

    }// end method

    protected checkIgnoreNamespaces(metaItem: Object): boolean {

        // console.log('### ' + metaItem["fullName"] + ' ' + metaItem["manageableState"]);

        if (!this.ignoreNamespaces) {
            return false;
        }
        else if (!(metaItem["namespacePrefix"] === undefined ||
            metaItem["namespacePrefix"] === null ||
            metaItem["namespacePrefix"] === "")) { // al, pi or Finserv etc ...
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
        const folder = params.folder;

        try {

            let types: Array<ListMetadataQuery> = [{ "type": metaType, "folder": folder }];

            const conn = this.org.getConnection();
            // this.org.getConnection().tooling;

            conn.metadata.list(types, this.apiVersion).then((metadata: Array<FileProperties>) => {

                if (metadata === undefined || metadata === null) {
                    console.log('Retrieved [' + metaType + '] with empty result(0)');
                }
                else if (metadata instanceof Array) {
                    metadata.forEach(metaItem => {
                        if (!this.checkIgnoreManaged(metaItem) &&
                            !this.checkIgnoreNamespaces(metaItem)) {
                            this.metadataTypesListMap[metaItem.type].push(metaItem.fullName);
                        }// end if
                    }); // end foreach
                } else {
                    let metaItem: FileProperties = metadata;
                    if (!this.checkIgnoreManaged(metaItem) &&
                        !this.checkIgnoreNamespaces(metaItem)) {
                        this.metadataTypesListMap[metaItem.type].push(metaItem.fullName);
                    }// end if
                }// end else

                if (--batchCtrl.counter <= 0) {
                    batchCtrl.resolve();
                }// end if

            }, (error: any) => {
                console.error(error);
                batchCtrl.reject(error);
            });
        } catch (exception) {
            console.error(exception);
            batchCtrl.reject(exception);
        }// end catch

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

                for (var x = 0; x < this.batchSize; x++) {

                    let metaType = this.sortedMetadataTypes.pop();

                    if ((metaType === undefined) || (metaType === null)) {
                        if (batchCtrl.counter <= 0) {
                            resolve();
                            return;
                        } else { continue; }
                    }// end if

                    this.retainedMetadataTypes.push(metaType);

                    batchCtrl.counter = ++counter;

                    let params = <Params>{
                        "metaType": metaType,
                        "folder": null
                    };

                    this.runRetrieveMetadataListCommand(params, batchCtrl);

                }// end for

            } catch (exception) {
                console.error(exception);
                reject(exception);
            }// catch exception

        });// end promse

    }// end method

    // retrieveMetadataFolderBatch
    protected retrieveMetadataFolderBatch(metaType: string): Promise<any> {

        return new Promise((resolve, reject) => {

            try {

                const folderType = this.metadataFoldersLookup[metaType];
                const folderArray = this.metadataTypesListMap[folderType];

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
                    this.metadataTypesListMap[metaType].push(folder);
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

    protected async runRetrieveCustomObjectLayouts(objectName: string): Promise<any> {

        const conn = this.org.getConnection();
        const result = await conn.tooling.query("SELECT Id, Name, TableEnumOrId, ManageableState, NamespacePrefix, LayoutType" +
            " FROM Layout WHERE TableEnumOrId IN ('" + objectName + "') AND LayoutType = 'Standard'");
        // other layoutTypes ProcessDefinition and GlobalQuickActionList

        if (result.records) {
            result.records.forEach(record => {
                const fullName = record["TableEnumOrId"] + "-" + record["Name"];
                const layoutType = record["LayoutType"];
                console.log('layout: ', fullName + ' [' + layoutType + ']');
                this.metadataTypesListMap["Layout"].push(fullName);
            });
        }// end if

    }// end method


    protected async runRetrieveCustomObjectListViews(objectName: string): Promise<any> {

        const conn = this.org.getConnection();
        const result = await conn.queryAll("SELECT Id, Name, DeveloperName, SobjectType, NamespacePrefix" +
            " FROM ListView WHERE SobjectType IN ('" + objectName + "')");

        if (result.records) {
            result.records.forEach(record => {
                const fullName = record["SobjectType"] + "." + record["Name"];
                console.log('ListView: ', fullName);
                this.metadataTypesListMap["ListView"].push(fullName);

            });
        }// end if

    }// end method

    protected async runRetrieveCustomObjectCompactLayouts(objectName: string): Promise<any> {

        const conn = this.org.getConnection();
        const result = await conn.tooling.query("SELECT Id, DeveloperName, SobjectType, ManageableState, NamespacePrefix" +
            " FROM CompactLayout WHERE SobjectType IN ('" + objectName + "')");

        if (result.records) {
            result.records.forEach(record => {
                const fullName = record["SobjectType"] + "." + record["DeveloperName"];
                console.log('CompactLayout: ', fullName);
                this.metadataTypesListMap["CompactLayout"].push(fullName);
            });
        }// end if

    }// end method

    protected async runRetrieveCustomObjectRelated(result: DescribeSObjectResult): Promise<any> {

        if (result.compactLayoutable) {
            await this.runRetrieveCustomObjectCompactLayouts(result.name);
        }

        if (result.layoutable) {
            await this.runRetrieveCustomObjectLayouts(result.name);
        }

        await this.runRetrieveCustomObjectListViews(result.name);

    }// end method

    protected runRetrieveCustomObject(params: Params, batchCtrl: BatchCtrl): void {

        const objectName = params.objectName;

        const conn = this.org.getConnection();

        conn.sobject(objectName).describe().then((result: DescribeSObjectResult) => {

            try {

                let customFields: Array<Field> = result.fields;
                let recordTypeInfos: Array<RecordTypeInfo> = result.recordTypeInfos;

                customFields.forEach((customField: Field) => {
                    let fieldName = (objectName + '.' + customField.name);
                    this.metadataTypesListMap[this.CustomField].push(fieldName);
                });

                recordTypeInfos.forEach((recordTypeInfo: RecordTypeInfo) => {
                    let recordType = (objectName + '.' + recordTypeInfo.developerName);
                    this.metadataTypesListMap[this.RecordType].push(recordType);
                });

                this.runRetrieveCustomObjectRelated(result).then(() => {
                    if (--batchCtrl.counter <= 0) {
                        batchCtrl.resolve();
                    }// end if
                }, (error: any) => {
                    console.error(error);
                    batchCtrl.reject(error);
                });

            } catch (exception) {
                console.error(exception);
                batchCtrl.reject(exception);
            }

        }, (error: any) => {
            try {
                if (error["name"] === this.ERROR_NOT_FOUND) {
                    console.warn(`${objectName} NOT FOUND`);
                    if (--batchCtrl.counter <= 0) {
                        batchCtrl.resolve();
                    }// end if
                } else { throw error; }
            } catch (exception) {
                console.error(exception);
                batchCtrl.reject(exception);
            }
        });

    }// end method

    // retrieveObjectRelatedBatch
    protected async retrieveObjectRelatedBatch(): Promise<any> {

        return new Promise((resolve, reject) => {

            try {

                let counter = 0;

                let batchCtrl = <BatchCtrl>{
                    "counter": counter,
                    "resolve": resolve,
                    "reject": reject
                };

                for (var x = 0; x < this.batchSize; x++) {

                    let objectName = this.sortedCustomObjectNames.pop();

                    if ((objectName === undefined) || (objectName === null)) {
                        if (batchCtrl.counter <= 0) {
                            resolve(); return;
                        } else { continue; }
                    }// end if

                    this.retainedCustomObjectNames.push(objectName);

                    batchCtrl.counter = ++counter;

                    let params = <Params>{
                        "objectName": objectName
                    };

                    this.runRetrieveCustomObject(params, batchCtrl);

                }// end for

            } catch (exception) {
                console.error(exception);
                reject(exception);
            }// catch exception

        });// end promse

    }// end method

    protected createSelectObjectQueryString(queryType: MetadataQuery): string {

        let part: string = '';

        for (var x = 0; x < queryType.queryFields.length; x++) {
            let item = queryType.queryFields[x];
            part += item;
            if (x < queryType.queryFields.length - 1) {
                part += ',';
            }
        }// end for

        return part;
    }// end method

    protected createInObjectQueryString(): string {

        let part: string = ' (';

        for (var x = 0; x < this.sortedCustomObjectNames.length; x++) {
            let item = ("'" + this.sortedCustomObjectNames[x] + "'");
            part += item;
            if (x < this.sortedCustomObjectNames.length - 1) {
                part += ',';
            }
        }// end for

        part += ')';

        return part;
    }// end method

    protected async retrieveCustomObjectRelated(queryType: MetadataQuery): Promise<any> {

        let queryString: string = "SELECT " + this.createSelectObjectQueryString(queryType) +
            " FROM " + queryType.metaType;


        if (queryType.filter) {
            queryString += " WHERE " + queryType.filter
                + " IN " + this.createInObjectQueryString();
        }// end if

        console.log('QUERY: ', queryString);

        const conn = this.org.getConnection();
        let result = null;

        if (queryType.toolingApi) {
            result = await conn.tooling.query(queryString);
        }
        else {
            result = await conn.query(queryString);
        }

        if (result.records) {
            result.records.forEach((record: Object) => {
                let fullName: string;
                if (queryType.joinChar) {
                    fullName = record[queryType.filter] + queryType.joinChar + record[queryType.queryFields[0]];
                }
                else {
                    fullName = record[queryType.queryFields[0]];
                }
                console.log(queryType.metaType, fullName);
                this.metadataTypesListMap[queryType.metaType].push(fullName);
            });
        }// end if

    }// end method

    protected async retrieveObjectRelatedLists() {

        let objectNames: Array<string> = this.metadataTypesListMap[this.CustomObject];

        objectNames.forEach(objectName => {
            this.sortedCustomObjectNames.push(objectName); // clone
        });

        this.sortedCustomObjectNames.sort();

        for (var x = 0; x < this.metadataQuery.length; x++) {
            await this.retrieveCustomObjectRelated(this.metadataQuery[x]);
        }// end for

    }// end method

    protected injectStandardValueSets(): void {

        this.standardValueSets.forEach(element => {
            this.metadataTypesListMap[this.StandardValueSet].push(element);
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
        }// end if

    }// end method

    protected async resolvePersonAccountRecordTypes(): Promise<any> {

        return new Promise((resolve, reject) => {

            const conn = this.org.getConnection();

            conn.sobject(this.Account).describe().then((result: DescribeSObjectResult) => {

                try {

                    const recordTypeInfos: Array<RecordTypeInfo> = result.recordTypeInfos;

                    recordTypeInfos.forEach((recordTypeInfo: RecordTypeInfo) => {
                        let personRecordType = (this.PersonAccount + '.' + recordTypeInfo.developerName);
                        this.metadataTypesListMap[this.RecordType].push(personRecordType);
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

            if (this.metadataTypesListMap[metaType].length === 0) {
                continue;
            }// end if

            let metaItems = this.metadataTypesListMap[metaType];

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
        });// end write

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

        const result = await this.org.getConnection().tooling.query('SELECT ValidationRule FROM CustomObject');

        console.log(result);


       /* await this.describeMetadata();

        await this.retrieveMetadataLists();

        await this.retrieveObjectRelatedLists();

        await this.retrieveMetadataFolders();

        await this.resolvePersonAccountRecordTypes();

        this.injectStandardValueSets();

        this.packageFile();

        // retrieve payload (payload) FIXME
        // await this.retrieveMetadataFiles();
        */

    }// end process

};
