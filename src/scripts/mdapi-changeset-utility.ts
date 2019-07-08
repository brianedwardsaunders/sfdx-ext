import {
    existsSync, mkdirSync, removeSync, copySync, readdirSync,
    statSync, writeFileSync, readFileSync, unlinkSync, copyFileSync
} from "fs-extra";
import { DescribeMetadataResult, MetadataObject } from "jsforce";
import { Org } from "@salesforce/core";
import path = require('path');
import convert = require('xml-js');
const exec = require('child_process').exec;

export interface DiffResult {
    "registerKey": string;
    "checkKey": string,
    "keyAnchor": string,
    "filePath": string,
    "parentDirectory": string,
    "fileContents": number, // only hash as contents is large
    "directory": string, // sfdx directory e.g. triggers
    "isFolderDefinition": boolean,
    "metaTypeDefinition": MetadataObject,
    "metaType": string, // e.g. ApexTrigger
    "metaName": string, // e.g. Account
    "diffType": string,
    "lastModified": any,
    "fileSize": number,
    "diffSize": number // init
};

export class MdapiChangesetUtility {

    protected stageRoot: string = 'stage';
    protected retrieveDir: string = 'retrieve';
    protected sourceDir: string = 'src';
    protected deployDir: string = 'deploy';
    protected backupExt: string = '.backup';

    protected sourceBaseDir: string;
    protected targetBaseDir: string;
    protected sourceRetrieveDir: string;
    protected sourceRetrieveDirBackup: string;
    protected sourceConfigDir: string;
    protected targetRetrieveDir: string;
    protected sourceDeployDir: string;
    protected sourceDeployDirTarget: string;
    protected sourceDeployDirTargetSource: string;
    protected emptyPackageXml: string;
    protected filePackageXml: string;
    protected deploymentFilePackageXml: string;
    protected fileDestructiveChangesXml: string;

    protected UTF8 = 'utf8';
    protected convertOptions: Object = { compact: true, spaces: 2 };
    protected bufferOptions: Object = { maxBuffer: 10 * 1024 * 1024 };

    protected Report: string = 'Report';
    protected DashboardFolder: string = 'DashboardFolder';
    protected DocumentFolder: string = 'DocumentFolder';
    protected EmailFolder: string = 'EmailFolder';
    protected ReportFolder: string = 'ReportFolder';

    // special case e.g. static resources
    protected metaSuffix: string = "-meta.xml";

    /** SPECIFIC DIR CONSTANTS*/
    protected aura: string = "aura";
    protected lwc: string = "lwc";
    protected objects: string = "objects";
    protected dashboards: string = "dashboards";
    protected email: string = "email";
    protected reports: string = "reports";
    protected documents: string = "documents";
    protected profiles: string = "profiles";
    protected settings: string = "settings";

    /** META TYPES */
    protected CustomObject: string = "CustomObject";
    protected CustomField: string = "CustomField";
    protected Index: string = "Index";
    protected BusinessProcess: string = "BusinessProcess";
    protected RecordType: string = "RecordType";
    protected CompactLayout: string = "CompactLayout";
    protected WebLink: string = "WebLink";
    protected ValidationRule: string = "ValidationRule";
    protected SharingReason: string = "SharingReason";
    protected ListView: string = "ListView";
    protected FieldSet: string = "FieldSet";

    protected fields: string = "fields";
    protected indexes: string = "indexes";
    protected businessProcesses: string = "businessProcesses";
    protected recordTypes: string = "recordTypes";
    protected compactLayouts: string = "compactLayouts";
    protected webLinks: string = "webLinks";
    protected validationRules: string = "validationRules";
    protected sharingReasons: string = "sharingReasons";
    protected listViews: string = "listViews"
    protected fieldSets: string = "fieldSets";
    protected fullName: string = "fullName";
    protected _text: string = "_text";

    protected objectChildMetaDirectories = [
        this.fields,
        this.indexes,
        this.businessProcesses,
        this.recordTypes,
        this.compactLayouts,
        this.webLinks,
        this.validationRules,
        this.sharingReasons,
        this.listViews,
        this.fieldSets
    ];

    protected objectChildMetaTypes = [
        this.CustomField,
        this.Index,
        this.BusinessProcess,
        this.RecordType,
        this.CompactLayout,
        this.WebLink,
        this.ValidationRule,
        this.SharingReason,
        this.ListView,
        this.FieldSet
    ];

    protected childMetaTypesLookup = {
        "fields": this.CustomField,
        "indexes": this.Index,
        "businessProcesses": this.BusinessProcess,
        "recordTypes": this.RecordType,
        "compactLayouts": this.CompactLayout,
        "webLinks": this.WebLink,
        "validationRules": this.ValidationRule,
        "sharingReasons": this.SharingReason,
        "listViews": this.ListView,
        "fieldSets": this.FieldSet
    };

    protected metaDefinitions: Array<MetadataObject> = [];
    protected metaTypeLookupFromSfdxFolder: Object = {};
    protected metaTypes: Array<string> = [];

    protected leftMetaRegister = {}; // e.g. {FilePath: <DiffResultTemplate>{}}
    protected rightMetaRegister = {};
    protected packageDiffResults = {};
    protected packageMatchResults = {};
    protected packageCombinedResults = {};
    protected destructiveDiffResults = {};
    protected destructiveIgnoreResults = {};
    protected destructiveMatchResults = {};

    protected DiffTypeLeft: string = "NEW_LEFT";
    protected DiffTypeRight: string = "NEW_RIGHT";
    protected DiffTypeMatch: string = "MATCH";
    protected DiffTypeDiff: string = "DIFF";
    protected DiffTypeUnprocessed: string = "UNPROCESSED";

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

    protected destructiveExceptions = {
        "Workflow": ["*"],
        "AssignmentRules": ["*"],
        "CustomObjectTranslation": ["*"],
        "Flow": ["*"],
        "FlowDefinition": ["*"]
    };

    protected dirExcludes = [
        "src"
    ];

    protected fileExcludes = [
        "jsconfig",
        "eslintrc",
        "package.xml"
    ];

    constructor(
        protected org: Org,
        protected sourceOrgAlias: string, // left
        protected targetOrgAlias: string, // right
        protected apiVersion: string,
        protected ignoreComments: boolean) {
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
    protected checkLocalBackupAndRestore(): void {
        console.log('checking for local backup [' + this.sourceRetrieveDirBackup + '] ...');
        if (!existsSync(this.sourceRetrieveDirBackup)) { // first time
            mkdirSync(this.sourceRetrieveDirBackup);
            copySync(this.sourceRetrieveDir, this.sourceRetrieveDirBackup);
            console.log('Initial backup [' + this.sourceRetrieveDirBackup + '] created.');
        }// end if
        else {
            console.log('restoring [' + this.sourceRetrieveDir + '] from local backup ' + this.sourceRetrieveDirBackup);
            removeSync(this.sourceRetrieveDir);
            mkdirSync(this.sourceRetrieveDir);
            copySync(this.sourceRetrieveDirBackup, this.sourceRetrieveDir);
            console.log('backup [' + this.sourceRetrieveDir + '] restored.');
        }// end else
    }// end method

    protected setupFolders(): void {

        // e.g. stage/DevOrg
        this.sourceBaseDir = (this.stageRoot + '/' + this.sourceOrgAlias);

        // e.g. stage/ReleaseOrg
        this.targetBaseDir = (this.stageRoot + '/' + this.targetOrgAlias);

        // e.g. stage/DevOrg/retrieve/src
        this.sourceRetrieveDir = (this.sourceBaseDir + '/' + this.retrieveDir + '/' + this.sourceDir);

        // e.g. stage/DevOrg/retrieve/src.backup
        this.sourceRetrieveDirBackup = (this.sourceRetrieveDir + this.backupExt);

        // e.g. stage/ReleaseOrg/retrieve/src
        this.targetRetrieveDir = (this.targetBaseDir + '/' + this.retrieveDir + '/' + this.sourceDir);

        // e.g. stage/DevOrg/deploy
        this.sourceDeployDir = (this.sourceBaseDir + '/' + this.deployDir);

        // e.g. stage/DevOrg/deploy/ReleaseOrg
        this.sourceDeployDirTarget = (this.sourceDeployDir + '/' + this.targetOrgAlias);

        // e.g. stage/DevOrg/deploy/ReleaseOrg/src
        this.sourceDeployDirTargetSource = (this.sourceDeployDirTarget + '/' + this.sourceDir);

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

        this.emptyPackageXml = (this.sourceDeployDirTarget + '/' + "package.xml");
        this.filePackageXml = (this.sourceDeployDirTarget + '/' + "package.manifest");
        this.fileDestructiveChangesXml = (this.sourceDeployDirTarget + '/' + "destructiveChanges.xml");
        this.deploymentFilePackageXml = (this.sourceDeployDirTargetSource + '/' + "package.xml");

    }// end method

    protected isDestructiveException(metaType: string, element: string) {

        let exception = false;

        if (this.destructiveExceptions[metaType]) {

            let excludeElements: Array<string> = this.destructiveExceptions[metaType];

            if (this.destructiveExceptions[0] === "*") { // all
                exception = true;
            } else {
                for (var x = 0; x < excludeElements.length; x++) {
                    if (element === excludeElements[x]) {
                        exception = true;
                        break;
                    }// end if
                }// end for
            }// end else
        }
        return exception;
    }// end method

    protected isGlobalDestructiveException(metaType: string) {
        if (this.destructiveExceptions[metaType] && (this.destructiveExceptions[0] === "*")) {
            return true;
        }
        return false;
    }// end method

    protected isExcludedFile(input: string) {
        let excluded = false;
        this.fileExcludes.forEach(element => {
            if (element === input) {
                excluded = true;
                return;
            }
        })
        return excluded;
    }// end method

    protected isExcludedDirectory(input: string) {
        let excluded = false;
        this.dirExcludes.forEach(element => {
            if (element === input) {
                excluded = true;
                return;
            }
        })
        return excluded;
    }// end method

    // checksum file hash number
    protected hashCode(input: any): number {
        let hash = 0;
        if (input.length === 0) return hash;
        for (var i = 0; i < input.length; i++) {
            let chr = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash;
    }// end method

    protected isolateLeafNode(parentDir: any): string {
        var items = parentDir.split(path.sep);
        return items[items.length - 1];
    }// end method

    protected isolateMetaName(fileName: string): string {

        var items = fileName.split(".");
        let returned = items[0];
        let offset = 1;
        var fileSuffix = items[items.length - 1];

        if (fileSuffix === 'xml') {// metatype
            let fileSub = items[items.length - 2];
            if (fileSub.endsWith("-meta")) {
                offset = 2;
            }// end if
            for (var x = 1; x < (items.length - offset); x++) {
                returned += ('.' + items[x]);
            }// end for
        }// end if

        return returned;
    }// end method

    protected getMetaNameFromParentDirectory(parentDir: string): string {
        let segments = parentDir.split(path.sep);
        return segments[segments.length - 2]; // step two up
    }// end method

    protected getMetaNameFromCurrentDirectory(parentDir: string): string {
        let segments = parentDir.split(path.sep);
        return segments[segments.length - 1]; // step one up
    }// end method

    protected async initMetaDefinitions(): Promise<void> {

        return new Promise((resolve, reject) => {

            try {

                const conn = this.org.getConnection();

                conn.metadata.describe(this.apiVersion).then((result: DescribeMetadataResult) => {

                    this.metaDefinitions = result.metadataObjects;

                    resolve();

                }, (error: any) => {
                    reject(error);
                });

            } catch (exception) {
                reject(exception);
            }// end catch
        });

    }// end method

    protected setupMetaDefinitionLookups(): void {

        for (var x = 0; x < this.metaDefinitions.length; x++) {
            let element = this.metaDefinitions[x];
            var key = element.directoryName;
            var lookupArray = this.metaTypeLookupFromSfdxFolder[key];
            if ((lookupArray === undefined) || (lookupArray === null)) {
                lookupArray = []; //init array
            }
            element["extension"] = (element.suffix + this.metaSuffix); // inject
            lookupArray.push(element);
            this.metaTypeLookupFromSfdxFolder[key] = lookupArray;
            this.metaTypes.push(element.xmlName);
        }// end for

    }// end method

    protected initDiffResults(diffResults: Object): void {
        this.metaTypes.forEach(metaTypeKey => {
            diffResults[metaTypeKey] = [];
        });

        this.objectChildMetaTypes.forEach(metaTypeKey => {
            diffResults[metaTypeKey] = [];
        });

    }// end method

    protected setupDiffResults(): void {

        console.log('-----------------------------');
        console.log('SETUP DIFF RESULTS');
        console.log('-----------------------------');

        //package
        this.initDiffResults(this.packageDiffResults);
        this.initDiffResults(this.packageMatchResults);
        this.initDiffResults(this.packageCombinedResults);

        //destructive
        this.initDiffResults(this.destructiveDiffResults);
        this.initDiffResults(this.destructiveIgnoreResults);
        this.initDiffResults(this.destructiveMatchResults);

    }// end method

    protected getMetaTypeLookupFromSfdxFolderName(typeFolder: string, metaTypeFile?: string): MetadataObject {

        const lookup = this.metaTypeLookupFromSfdxFolder[typeFolder];

        if ((lookup !== undefined) && (lookup !== null)) {
            // noop fall through
            if (lookup.length == 1) {
                return lookup[0]; // if one only return one
            }// end if
            for (var x = 0; x < lookup.length; x++) {
                const metaDefinition = lookup[x];
                if (metaTypeFile.endsWith(metaDefinition.suffix) || metaTypeFile.endsWith(metaDefinition.extension)) { // e.g. for moderation different types
                    return metaDefinition;
                }// end if
            }// end for
        }// end if
        return null; // try to resolve as next step
    }// end method

    protected inspectFile(instance: MdapiChangesetUtility, filePath: string, metaRegister: Object, parentDir: string): void {

        let typeFile = instance.isolateLeafNode(filePath); // Account.meta-object.xml
        let typeFileName = instance.isolateMetaName(typeFile); //Account
        let typeFolder = instance.isolateLeafNode(parentDir); //objects
        let isFolderDefinition = false;
        let keyAnchor = ""; // init empty but not null or undefined 

        // don't process top level directories (from excluded list)
        if (instance.isExcludedDirectory(typeFolder)) {
            console.log("Ignoring folder: " + typeFolder);
            return;
        }
        else if (instance.isExcludedFile(typeFile)) {
            console.log("Ignoring file: " + typeFile);
            return;
        }// end else if

        let metaTypeElement = instance.getMetaTypeLookupFromSfdxFolderName(typeFolder, typeFile);

        if (typeFolder === instance.dashboards ||
            typeFolder === instance.email ||
            typeFolder === instance.reports ||
            typeFolder === instance.documents) {
            isFolderDefinition = true; // indicator for later usage
        }// end if

        if ((metaTypeElement === undefined) || (metaTypeElement === null)) {

            let metaParentName = instance.getMetaNameFromParentDirectory(parentDir);

            // special handle for object name folder (handle for fields etc.)
            if (metaParentName === instance.objects) {
                metaTypeElement = instance.getMetaTypeLookupFromSfdxFolderName(metaParentName);
            }// end if
            // special handle for aura and lwc 
            else if ((metaParentName === instance.aura) ||
                (metaParentName === instance.lwc)) {
                metaTypeElement = instance.getMetaTypeLookupFromSfdxFolderName(metaParentName);
                let folder = instance.getMetaNameFromCurrentDirectory(parentDir);
                typeFileName = folder;
            }// end else if
            // special handle for folder types
            else if (metaParentName === instance.dashboards ||
                metaParentName === instance.email ||
                metaParentName === instance.reports ||
                metaParentName === instance.documents) {
                metaTypeElement = instance.getMetaTypeLookupFromSfdxFolderName(metaParentName);
                let folder = instance.getMetaNameFromCurrentDirectory(parentDir);
                keyAnchor = (folder + "/");
                typeFileName = (keyAnchor + typeFileName);
            } // end else if
            else {
                console.error('Unexpected MetaType found at Parent Directory: [' + parentDir
                    + '] Check Meta Definitions are up to date. Unresolved Error FilePath: ' + filePath);
                throw parentDir; // terminate 
            }// end else
        }

        // contruct a unique relatively comparable key so left and be matched to right
        let registerKey = (typeFolder + "/" + keyAnchor + typeFile); // with extension so unique
        // without extension for comparison later may not be unique (e.g. a pair)
        let checkKey = (typeFolder + "/" + keyAnchor + typeFileName);

        // saftey check
        if ((typeFileName === undefined || typeFileName === null) ||
            (keyAnchor === undefined || keyAnchor === null) ||
            (typeFolder === undefined || typeFolder === null) ||
            (parentDir === undefined || parentDir === null) ||
            (metaTypeElement === undefined || metaTypeElement === null)) {
            console.error('Unexpected unresolved meta item field - key: ', registerKey +
                ' (metaName: ' + typeFileName + ') type folder: (' + typeFolder + '), anchor ('
                + keyAnchor + ') parentDir: ' + parentDir + ', metaTypeElement: ' + metaTypeElement);
            throw 'Unresolved diffResult';
        }// end if

        const fileContents = readFileSync(filePath, instance.UTF8);
        const stats = statSync(filePath);

        let diffResult: DiffResult = {
            "registerKey": registerKey,
            "checkKey": checkKey,
            "keyAnchor": keyAnchor,
            "filePath": filePath,
            "parentDirectory": parentDir,
            "fileContents": instance.hashCode(fileContents), // only hash as contents is large
            "directory": typeFolder, // sfdx directory e.g. triggers
            "isFolderDefinition": isFolderDefinition,
            "metaTypeDefinition": metaTypeElement,
            "metaType": metaTypeElement.xmlName, // e.g. ApexTrigger
            "metaName": typeFileName, // e.g. Account
            "diffType": instance.DiffTypeUnprocessed,
            "lastModified": stats.mtime,
            "fileSize": stats.size,
            "diffSize": 0 // init
        };

        // add unique entry
        metaRegister[registerKey] = diffResult;

    }// end method

    // recursive walk directory function
    protected walkDir(dir: string, metaRegister: Object, callback: any): void {

        const fileItems: Array<string> = readdirSync(dir);

        for (var x = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x];
            let dirPath: string = path.join(dir, fileItem);
            let isDirectory: boolean = statSync(dirPath).isDirectory();

            if (isDirectory) {
                this.walkDir(dirPath, metaRegister, callback);
            }
            else {
                callback(this, path.join(dir, fileItem), metaRegister, dir);
            }
        }// end for

    }// end method

    protected walkDirectories(): void {

        console.log('-----------------------------');
        console.log('WALK SOURCE FOR COMPARE ');
        console.log('-----------------------------');

        this.walkDir(this.sourceRetrieveDir, this.leftMetaRegister, this.inspectFile);

        console.log('-----------------------------');
        console.log('WALK TARGET FOR COMPARE ');
        console.log('-----------------------------');

        this.walkDir(this.targetRetrieveDir, this.rightMetaRegister, this.inspectFile);

    }// end method

    protected objectToArray(objectOrArray: any): Array<any> {
        let returned: Array<any> = [];
        if (objectOrArray) {
            if (objectOrArray instanceof Array) {
                return objectOrArray;
            }
            else {
                returned.push(objectOrArray);
            }// end else
        }
        return returned;
    }// end method

    protected compareObjects(leftItem: DiffResult, rightItem: DiffResult): void {

        var leftObject = JSON.parse(convert.xml2json(
            readFileSync(leftItem.filePath, this.UTF8), this.convertOptions));

        var rightObject = JSON.parse(convert.xml2json(
            readFileSync(rightItem.filePath, this.UTF8), this.convertOptions));

        for (var x = 0; x < this.objectChildMetaDirectories.length; x++) {

            let childMetaDirectory: string = this.objectChildMetaDirectories[x];
            // let childMetaType: string = this.childMetaTypesLookup[childMetaDirectory];

            let leftChildren: Array<Object> = this.objectToArray(leftObject.CustomObject[childMetaDirectory]);
            let rightChildren: Array<Object> = this.objectToArray(rightObject.CustomObject[childMetaDirectory]);

            console.log("DEBUG 1: ", rightChildren);

            // ---------------------
            // compare left to right
            // ---------------------
            for (var l = 0; l < leftChildren.length; l++) {

                let found: boolean = false;
                let leftChild: Object = leftChildren[l];
                let leftFullName: string = leftChild[this.fullName]._text;

                //console.log("leftChild DEBUG ", leftChild);
                //throw "error";

                let leftCheckSum: number = 0;
                let leftSize: number = 0;

                let rightCheckSum: number = 0;
                let rightSize: number = 0;
                let rPosition: number = 0;

                for (var r = 0; r < rightChildren.length; r++) {

                    console.log("DEBUG 2 len: ", rightChildren.length);
                    let rightChild: Object = rightChildren[r];
                    console.log("DEBUG 2: ", rightChild);

                    if (rightChild) {
                        
                        let rightFullName: string = rightChild[this.fullName]._text;

                        if (leftFullName === rightFullName) {
                            let rightString = JSON.stringify(rightChild);
                            rightCheckSum = this.hashCode(rightString);
                            rightSize = rightString.length;
                            rPosition = r;
                            found = true;
                            break;
                        }// end if
                    }

                }// end for right

                let typeFileName = (leftItem.metaName + "." + leftFullName); // convention in package.xml
                let registerKey = (childMetaDirectory + "/" + leftItem.metaName + "/" + typeFileName); // with extension so unique
                let leftString: string = JSON.stringify(leftChild);
                leftCheckSum = this.hashCode(leftString);

                let diffResult: DiffResult = {
                    "registerKey": registerKey,
                    "checkKey": registerKey,
                    "keyAnchor": leftItem.metaName,
                    "filePath": leftItem.filePath,
                    "parentDirectory": this.objects,
                    "fileContents": leftCheckSum, // only hash as contents is large
                    "directory": childMetaDirectory, // sfdx directory e.g. triggers
                    "isFolderDefinition": false,
                    "metaTypeDefinition": null,
                    "metaType": this.childMetaTypesLookup[childMetaDirectory], // e.g. ApexTrigger
                    "metaName": typeFileName, // e.g. Account
                    "diffType": null,
                    "lastModified": leftItem.lastModified,
                    "fileSize": leftString.length,
                    "diffSize": (leftSize - rightSize) // init
                };

                if (found && (leftCheckSum === rightCheckSum)) {
                    diffResult.diffType = this.DiffTypeMatch;
                    // no difference so don't migrate delete on both sides
                    delete leftChildren[l];
                    delete rightChildren[rPosition];
                    this.packageMatchResults[diffResult.metaType].push(diffResult);
                }// end if
                else if (!found) {// new entry on left                    
                    diffResult.diffType = this.DiffTypeLeft;
                    console.log('DEBUG: ', diffResult);
                    this.packageDiffResults[diffResult.metaType].push(diffResult);
                }// end if
                else { // leftCheckSum != rightCheckSum
                    diffResult.diffType = this.DiffTypeDiff;
                    this.packageDiffResults[diffResult.metaType].push(diffResult);
                } // end else

                this.packageCombinedResults[diffResult.metaType].push(diffResult);

            }// end for left

            // ---------------------
            // compare right to left
            // ---------------------

            for (var r = 0; r < rightChildren.length; r++) {

                let found: boolean = false;
                let rightChild: Object = rightChildren[r];
                let rightFullName: string = rightChild[this.fullName]._text;

                let rightCheckSum: number = 0;
                let rightSize: number = 0;

                let leftCheckSum: number = 0;
                let leftSize: number = 0;

                for (var l = 0; l < leftChildren.length; l++) {

                    let leftChild: Object = leftChildren[l];
                    let leftFullName: string = leftChild[this.fullName]._text;

                    if (rightFullName === leftFullName) {
                        let leftString = JSON.stringify(leftChild);
                        leftCheckSum = this.hashCode(leftString);
                        leftSize = leftString.length;
                        found = true;
                        break;
                    }// end if

                }// end for right

                let typeFileName = (rightItem.metaName + "." + rightFullName); // convention in package.xml
                let registerKey = (childMetaDirectory + "/" + rightItem.metaName + "/" + typeFileName); // with extension so unique
                let rightString: string = JSON.stringify(rightChild);
                rightCheckSum = this.hashCode(rightString);

                let diffResult: DiffResult = {
                    "registerKey": registerKey,
                    "checkKey": registerKey,
                    "keyAnchor": rightItem.metaName,
                    "filePath": rightItem.filePath,
                    "parentDirectory": this.objects,
                    "fileContents": rightCheckSum, // only hash as contents is large
                    "directory": childMetaDirectory, // sfdx directory e.g. triggers
                    "isFolderDefinition": false,
                    "metaTypeDefinition": null,
                    "metaType": this.childMetaTypesLookup[childMetaDirectory], // e.g. ApexTrigger
                    "metaName": typeFileName, // e.g. Account
                    "diffType": null,
                    "lastModified": rightItem.lastModified,
                    "fileSize": rightString.length,
                    "diffSize": (rightSize - leftSize) // init
                };

                if (!found) {
                    diffResult.diffType = this.DiffTypeRight;
                    this.destructiveDiffResults[rightItem.metaType].push(diffResult);
                }// end if
                else if (rightCheckSum != leftCheckSum) {
                    diffResult.diffType = this.DiffTypeDiff; // already in left diff
                    this.destructiveIgnoreResults[rightItem.metaType].push(diffResult);
                }// end else if
                else {// same unlikely to still exist
                    diffResult.diffType = this.DiffTypeDiff;
                    this.destructiveMatchResults[rightItem.metaType].push(diffResult);
                }// end else

            }// end for right

        }// end for

        var reducedXmlString = convert.json2xml(leftObject, this.convertOptions);
        console.log(leftItem.filePath);
        writeFileSync(leftItem.filePath, reducedXmlString);

    }// end method

    protected compareSourceAndTarget(): void {

        console.log('-----------------------------');
        console.log('COMPARE SOURCE WITH TARGET ');
        console.log('-----------------------------');
        //compare left to right
        for (var filePathKey in this.leftMetaRegister) {

            let leftItem = this.leftMetaRegister[filePathKey];
            let rightItem = this.rightMetaRegister[filePathKey];

            if ((rightItem === undefined) || (rightItem === null)) {
                leftItem.diffType = this.DiffTypeLeft;
                leftItem.diffSize = leftItem.fileSize;
                this.packageDiffResults[leftItem.metaType].push(leftItem);
            }
            else if (leftItem.fileContents !== rightItem.fileContents) {
                leftItem.diffType = this.DiffTypeDiff;
                leftItem.diffSize = (leftItem.fileSize - rightItem.fileSize);
                this.packageDiffResults[leftItem.metaType].push(leftItem);
                if (leftItem.metaType === this.CustomObject) {
                    this.compareObjects(leftItem, rightItem); // detail diff
                }// end if
            }
            else if (leftItem.fileContents === rightItem.fileContents) {
                leftItem.diffType = this.DiffTypeMatch;
                leftItem.diffSize = (leftItem.fileSize - rightItem.fileSize); // should be zero
                this.packageMatchResults[leftItem.metaType].push(leftItem);
            }

            this.packageCombinedResults[leftItem.metaType].push(leftItem);

        }// end for

        console.log('-----------------------------');
        console.log('COMPARE TARGET WITH SOURCE ');
        console.log('-----------------------------');
        //compare right to left
        for (var filePathKey in this.rightMetaRegister) {

            let leftItem = this.leftMetaRegister[filePathKey];
            let rightItem = this.rightMetaRegister[filePathKey];

            if ((leftItem === undefined) || (leftItem === null)) {
                rightItem.diffType = this.DiffTypeRight; // 
                rightItem.diffSize = rightItem.fileSize;
                this.destructiveDiffResults[rightItem.metaType].push(rightItem);
            }
            else if (rightItem.fileContents !== leftItem.fileContents) {
                rightItem.diffType = this.DiffTypeDiff;
                rightItem.diffSize = (rightItem.fileSize - leftItem.fileSize);
                this.destructiveIgnoreResults[rightItem.metaType].push(rightItem);
                // left already included in comparison.
            }
            else if (rightItem.fileContents === leftItem.fileContents) {
                rightItem.diffType = this.DiffTypeMatch;
                rightItem.diffSize = (rightItem.fileSize - leftItem.fileSize); // should be zero
                this.destructiveMatchResults[rightItem.metaType].push(rightItem);
                // excluded not need to transport.
            }// end else if

        }// end for

    }// end method

    // console.log(destructiveDiffResults);
    protected sortDiffResultsTypes(diffResults: Object): Array<string> {

        var metaTypes: Array<string> = [];

        for (var metaType in diffResults) {
            metaTypes.push(metaType);
        }// end for

        metaTypes.sort();
        return metaTypes;

    }// end method

    protected createPackageFile(packageFile: string, diffResults: Object, isDestructive: boolean): void {

        var xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xmlContent += '<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';

        let metaTypes: Array<string> = this.sortDiffResultsTypes(diffResults);

        for (var i = 0; i < metaTypes.length; i++) {

            let metaType: string = metaTypes[i];

            if (diffResults[metaType].length === 0) {
                continue;
            }

            let rawMembers = diffResults[metaType];
            let limitedMembers = [];

            // create comments
            var comments = "<!-- \n";

            for (var x = 0; x < rawMembers.length; x++) {
                const diff = rawMembers[x];
                comments += diff.diffType + ", " + diff.keyAnchor + this.isolateLeafNode(diff.filePath) + ", delta-size "
                    + diff.diffSize + " (bytes)" + ", file-size " + diff.fileSize + " (bytes), file-hash [" + diff.fileContents
                    + "], modified " + diff.lastModified + ". \n";
                if (isDestructive && diff.isFolderDefinition) {
                    let excludeFolderMessage = 'NOTE: Excluding folder from destructiveChanges ['
                        + diff.metaName + '], review and delete manually in target org.';
                    console.log(excludeFolderMessage);
                    comments += (excludeFolderMessage + '\n');
                }
                else {
                    limitedMembers.push(diff.metaName);
                }
            }//end for

            comments += " -->";

            // ensure only unique entries
            var members = [...new Set(limitedMembers)];

            members.sort();

            if (members.length > 0) {

                let isGlobalException = (isDestructive && this.isGlobalDestructiveException(metaType));

                if (isGlobalException) { // comment out type which throws error when deploying.
                    xmlContent += "<!-- \n";
                    let exceptionMessage = 'NOTE: Excluding meta type from destructiveChanges ['
                        + metaType + '], review and delete manually in target org.';
                    console.log(exceptionMessage);
                    xmlContent += (exceptionMessage + '\n');
                }// end if

                xmlContent += '  <types>\n';
                xmlContent += '    <name>' + metaType + '</name>\n';

                for (var y = 0; y < members.length; y++) {
                    let member = members[y];
                    if ((member === undefined) || (member === null) || (member === "")) { continue; } // no blanks
                    else if (this.isExcludedFile(member)) { continue; } // e.g. lwc tech files.
                    else if ((isDestructive && this.isDestructiveException(metaType, member))) {
                        xmlContent += '<!-- EXCLUDED ITEM    <members>' + member + '</members> -->\n';
                    }
                    else { xmlContent += '    <members>' + member + '</members>\n'; }
                }// end for

                xmlContent += '  </types>\n';

                if (isGlobalException) {
                    xmlContent += " -->";
                }

            }// end if

            if (!this.ignoreComments) { xmlContent += comments + '\n'; }

        }// end for

        xmlContent += '  <version>' + this.apiVersion + '</version>\n';
        xmlContent += '</Package>\n';

        if (!existsSync(this.sourceDeployDirTarget)) {
            mkdirSync(this.sourceDeployDirTarget);
            console.info(this.sourceDeployDirTarget + ' directory created.');
        }

        writeFileSync(packageFile, xmlContent);
    }// end method

    protected createEmptyPackageFile(): void {

        var xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xmlContent += '<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';

        xmlContent += '  <version>' + this.apiVersion + '</version>\n';
        xmlContent += '</Package>\n';

        if (!existsSync(this.sourceDeployDirTarget)) {
            mkdirSync(this.sourceDeployDirTarget);
            console.info(this.sourceDeployDirTarget + ' directory created.');
        }

        writeFileSync(this.emptyPackageXml, xmlContent);
    }// end method

    protected createPackageXmls(): void {

        console.log('-----------------------------');
        console.log('CREATE PACKAGE.XML');
        console.log('-----------------------------');

        this.createPackageFile(this.filePackageXml, this.packageDiffResults, false);

        console.log('-----------------------------');
        console.log('CREATE DESTRUCTIVECHANGES.XML');
        console.log('-----------------------------');

        this.createPackageFile(this.fileDestructiveChangesXml, this.destructiveDiffResults, true);

        console.log('-----------------------------');
        console.log('DIFF PROCESS COMPLETED  ');
        console.log('-----------------------------');

        this.createEmptyPackageFile();

    }// end method

    protected preparePackageDirectory(): void {

        console.log('-----------------------------');
        console.log('DELETING SOURCE FILE MATCHES ');
        console.log('-----------------------------');

        for (var metaType in this.packageMatchResults) {

            var matchResults = this.packageMatchResults[metaType];

            for (var x = 0; x < matchResults.length; x++) {

                let matchResult = matchResults[x];
                let found: boolean = false;
                // before deleting make sure not part of diff results (e.g. nested bundle).
                let diffResults = this.packageDiffResults[metaType];

                // check if diff entry exists
                for (var y = 0; y < diffResults.length; y++) {

                    let diffResult = diffResults[y];

                    if (matchResult.checkKey === diffResult.checkKey) { // the path and meta name is key
                        found = true;
                        break;
                    }// end if

                }// end for

                if (!found) {
                    // delete left file if no diff found
                    try {
                        let filePath = matchResult.filePath;
                        if (existsSync(filePath)) {
                            unlinkSync(filePath);
                        }// end if
                    } catch (error) {
                        console.log(error);
                        throw error;
                    }
                }// end if

            }// end for

        }// end for

    }// end method

    protected copyDeploymentFiles(): void {

        copySync(this.sourceRetrieveDir, this.sourceDeployDirTargetSource);
        console.log(this.sourceRetrieveDir + ' moved to [' + this.sourceDeployDirTargetSource + '].');
        removeSync(this.sourceRetrieveDir);

        copyFileSync(this.filePackageXml, this.deploymentFilePackageXml);
        console.log(this.deploymentFilePackageXml + ' file created.');
        unlinkSync(this.filePackageXml);

        console.log('-----------------------------');
        console.log('CHANGESET PROCESS COMPLETE  ');
        console.log('-----------------------------');

    }// end process

    // recursive walk directory function
    protected postWalkDir(dir: string, callback: any): void {

        const fileItems: Array<string> = readdirSync(dir);

        for (var x = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x];
            let dirPath: string = path.join(dir, fileItem);
            let isDirectory: boolean = statSync(dirPath).isDirectory();

            if (isDirectory) {
                this.postWalkDir(dirPath, callback);
            }
            else {
                callback(this, path.join(dir, fileItem), dir);
            }
        }// end for

    }// end method

    protected postInspectFile(instance: MdapiChangesetUtility, filePath: string, parentDir: string): void {

        let typeFolder = instance.isolateLeafNode(parentDir);
        let grandParentFolder = instance.getMetaNameFromParentDirectory(parentDir);

        if (typeFolder === this.objects) {

            if (filePath.endsWith('Lead.object')) {

                var jsonObject = JSON.parse(convert.xml2json(
                    readFileSync(filePath, instance.UTF8), instance.convertOptions));
                var listViews = jsonObject.CustomObject.listViews;

                for (var x = 0; x < listViews.length; x++) {
                    let listView = listViews[x];
                    for (var y = 0; y < (listView.columns && listView.columns.length); y++) {
                        let column = listView.columns[y];
                        if (column._text === 'LEAD_SCORE') {
                            listView.columns.splice(y, 1); // pop
                            break;
                        }// end if
                    }// end if
                }// end for

                var reducedXmlString = convert.json2xml(jsonObject, instance.convertOptions);
                console.log(filePath);
                writeFileSync(filePath, reducedXmlString);

            }// end if
            else if (filePath.endsWith('Task.object')) {

                var jsonObject = JSON.parse(convert.xml2json(readFileSync(
                    filePath, instance.UTF8), instance.convertOptions));
                var listViews = jsonObject.CustomObject.listViews;

                // too long ENCODED:{!FilterNames.Task_DelegatedTasks}
                for (var x = 0; x < listViews.length; x++) {
                    let listView = listViews[x];
                    // Value too long for field: Name maximum length is:40
                    if (listView.fullName._text === 'UnscheduledTasks' &&
                        listView.label._text === 'ENCODED:{!FilterNames.Task_UnscheduledTasks}') {
                        listView.label._text = 'Unscheduled Tasks';
                    }// end if

                }// end for

                var reducedXmlString = convert.json2xml(jsonObject, instance.convertOptions);
                console.log(filePath);
                writeFileSync(filePath, reducedXmlString);

            }// end if
            /* else if (filePath.endsWith('Task.object')) {

                var jsonObject = JSON.parse(convert.xml2json(readFileSync(
                    filePath, instance.UTF8), instance.convertOptions));
                var listViews = jsonObject.CustomObject.listViews;

                for (var x = 0; x < listViews.length; x++) {
                    let listView = listViews[x];
                    // Duplicate name 'Task.DelegatedTasks' specified
                    if ((listView.fullName._text === 'DelegatedTasks') ||
                        (listView.fullName._text === 'OpenTasks') ||
                        (listView.fullName._text === 'OverdueTasks') ||
                        (listView.fullName._text === 'RecurringTasks')) {
                        delete listViews[x];
                    }// end if

                }// end for

                var reducedXmlString = convert.json2xml(jsonObject, instance.convertOptions);
                console.log(filePath);
                writeFileSync(filePath, reducedXmlString);

            }// end if 
            */

        }// end else if
        // check profile issues
        else if (typeFolder === instance.profiles) {

            var jsonObject = JSON.parse(convert.xml2json(readFileSync(
                filePath, instance.UTF8), instance.convertOptions));

            var userPermissions = jsonObject.Profile.userPermissions;

            for (var x = 0; x < userPermissions.length; x++) {
                let userPerm = userPermissions[x];
                if (userPerm.name._text === 'ManageSandboxes') {
                    userPermissions.splice(x, 1); // pop
                    break;
                }
            }// end for

            // this causes errors
            var tabVisibilities = jsonObject.Profile.tabVisibilities;
            for (var x = 0; x < tabVisibilities.length; x++) {
                let tabVisibility = tabVisibilities[x];
                // You can't edit tab settings for SocialPersona, as it's not a valid tab.
                if (tabVisibility.tab._text === 'standard-SocialPersona') {
                    tabVisibilities.splice(x, 1); // pop
                    break;
                }// end if
            }// end for

            var fieldPermissions = jsonObject.Profile.fieldPermissions;

            // field service field being injected in to PersonLifeEvent object (remove)
            for (var x = 0; x < fieldPermissions.length; x++) {
                let fieldPermission = fieldPermissions[x];
                if (fieldPermission.field._text === 'PersonLifeEvent.LocationId') {
                    fieldPermissions.splice(x, 1); // pop
                    break;
                }// end if
            }// end for

            var reducedXmlString = convert.json2xml(jsonObject, instance.convertOptions);
            console.log(filePath);

            writeFileSync(filePath, reducedXmlString);

        }// end if (profile)
        // check dashboard run as issues
        else if (grandParentFolder === instance.dashboards) {

            console.log('dashboard screening ' + grandParentFolder + ' ' + typeFolder);

            var xmlString = readFileSync(filePath, instance.UTF8);
            var jsonObject = JSON.parse(convert.xml2json(xmlString, instance.convertOptions));

            var dashboard = jsonObject.Dashboard;

            if (!(dashboard.runningUser === undefined)) {
                delete dashboard.runningUser;
            }

            var reducedXmlString = convert.json2xml(jsonObject, instance.convertOptions);
            console.log(filePath);

            writeFileSync(filePath, reducedXmlString);

        }// end if (dashboards)
        else if (typeFolder === instance.settings) {

            if (filePath.endsWith('OrgPreference.settings')) {

                var jsonObject = JSON.parse(convert.xml2json(readFileSync(
                    filePath, instance.UTF8), instance.convertOptions));
                var preferences = jsonObject.OrgPreferenceSettings.preferences;

                for (var x = 0; x < preferences.length; x++) {
                    let preference = preferences[x];
                    ////You do not have sufficient rights to access the organization setting: CompileOnDeploy
                    if (preference.settingName._text === 'CompileOnDeploy') {
                        delete preferences[x];
                    }// end if
                }// end for

                var reducedXmlString = convert.json2xml(jsonObject, instance.convertOptions);
                console.log(filePath);
                writeFileSync(filePath, reducedXmlString);

            }// end if

        }// end if

    }// end method

    protected postScreenDeploymentFiles(): void {

        this.postWalkDir(this.sourceDeployDirTargetSource, this.postInspectFile);

        console.log('-----------------------------');
        console.log('POST SCREEN DEPLOY COMPLETE  ');
        console.log('-----------------------------');

    }// end process

    public async process(): Promise<void> {

        this.setupFolders();

        this.checkLocalBackupAndRestore();

        await this.initMetaDefinitions();

        this.setupMetaDefinitionLookups();

        this.setupDiffResults();

        this.walkDirectories();

        this.compareSourceAndTarget();

        this.preparePackageDirectory();

        this.createPackageXmls();

        this.copyDeploymentFiles();

        this.postScreenDeploymentFiles();

    }// end process
};
