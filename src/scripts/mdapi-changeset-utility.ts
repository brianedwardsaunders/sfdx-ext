import { existsSync, mkdirSync, removeSync, copySync, readdirSync, statSync, writeFileSync, readFileSync, unlinkSync } from "fs-extra";
import { DescribeMetadataResult, MetadataObject } from "jsforce";
import { Org } from "@salesforce/core";
import path = require('path');
const exec = require('child_process').exec;

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
    protected filePackageXml: string;
    protected fileDestructiveChangesXml: string;

    protected UTF8 = 'utf8';
    protected convertOptions: Object = { compact: true, spaces: 2 };
    protected bufferOptions: Object = { maxBuffer: 10 * 1024 * 1024 };

    protected StaticResource: string = 'StaticResource';

    protected Report: string = 'Report';
    protected DashboardFolder: string = 'DashboardFolder';
    protected DocumentFolder: string = 'DocumentFolder';
    protected EmailFolder: string = 'EmailFolder';
    protected ReportFolder: string = 'ReportFolder';

    /** SPECIFIC DIR CONSTANTS*/
    protected aura: string = "aura";
    protected lwc: string = "lwc";
    protected objects: string = "objects";
    protected dashboards: string = "dashboards";
    protected email: string = "email";
    protected reports: string = "reports";
    protected documents: string = "documents";
    protected objectTranslations: string = "objectTranslations";
    protected staticresources: string = "staticresources";

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

    //protected sortedMetadataTypes: Array<string> = [];
    //protected metadataTypesLookup: Object = {};
    //protected metadataTypesListMap: Object = {};

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

    protected destructiveExceptions = [
        'Workflow',
        'AssignmentRules',
        'CustomObjectTranslation',
        'Flow',
    ];

    protected dirExcludes = [
        "src"
    ];

    protected fileExcludes = [
        "jsconfig",
        "eslintrc"
    ];

    constructor(
        protected org: Org,
        protected sourceOrgAlias: string, // left
        protected targetOrgAlias: string, // right
        protected apiVersion: string) {
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
    protected checkLocalBackupAndRestore() {
        console.log('checking for local backup [' + this.sourceRetrieveDirBackup + '] ...');
        if (!existsSync(this.sourceRetrieveDirBackup)) { // first time
            mkdirSync(this.sourceRetrieveDirBackup);
            copySync(this.sourceRetrieveDir, this.sourceRetrieveDirBackup);
            console.log('Initial backup [' + this.sourceRetrieveDirBackup + '] created.');
        }
        else {
            console.log('restoring [' + this.sourceRetrieveDir + '] from local backup ' + this.sourceRetrieveDirBackup);
            removeSync(this.sourceRetrieveDir);
            mkdirSync(this.sourceRetrieveDir);
            copySync(this.sourceRetrieveDirBackup, this.sourceRetrieveDir);
            console.log('backup [' + this.sourceRetrieveDir + '] restored.');
        }
    }

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

        this.filePackageXml = (this.sourceDeployDirTarget + '/' + "package.xml");
        this.fileDestructiveChangesXml = (this.sourceDeployDirTarget + '/' + "destructiveChanges.xml");

    }// end method

    protected isDestructiveException(input: string) {
        let exception = false;
        this.destructiveExceptions.forEach(element => {
            if (element === input) {
                exception = true;
                return;
            }
        })
        return exception;
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
    protected hashCode(input: any) {
        let hash = 0;
        if (input.length === 0) return hash;
        for (var i = 0; i < input.length; i++) {
            let chr = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash;
    }// end method

    public isolateLeafNode(pdir?: any) {
        console.log('isolateLeafNode => ', pdir);
        var items = pdir.split(path.sep);
        return items[items.length - 1];
    }// end method

    protected isolateMetaName(fileName: string) {

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

    protected getMetaNameFromParentDirectory(parentDir: string) {
        let segments = parentDir.split(path.sep);
        return segments[segments.length - 2]; // step two up
    }// end method

    protected getMetaNameFromCurrentDirectory(parentDir: string) {
        let segments = parentDir.split(path.sep);
        return segments[segments.length - 1]; // step one up
    }// end method

    protected async initMetaDefinitions(): Promise<any> {

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

    protected setupMetaDefinitionLookups() {

        this.metaDefinitions.forEach(element => {

            var key = element.directoryName;
            var lookupArray = this.metaTypeLookupFromSfdxFolder[key];
            if ((lookupArray === undefined) || (lookupArray === null)) {
                lookupArray = []; //init array
            }
            lookupArray.push(element);
            this.metaTypeLookupFromSfdxFolder[key] = lookupArray;
            this.metaTypes.push(element.xmlName);
        });

    }// end method

    protected initDiffResults(diffResults: Object) {
        this.metaTypes.forEach(metaTypeKey => {
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

    protected getMetaTypeLookupFromSfdxFolderName(typeFolder: string, metaTypeFile?: string) {

        const lookup = this.metaTypeLookupFromSfdxFolder[typeFolder];

        if ((lookup !== undefined) && (lookup !== null)) {
            // noop fall through
            if (lookup.length == 1) {
                return lookup[0]; // if one only return one
            }
            for (var x = 0; x < lookup.length; x++) {
                const metaDefinition = lookup[x];
                if (metaTypeFile.endsWith(metaDefinition.extension)) { // e.g. for moderation different types
                    return metaDefinition;
                }
            }// end for
        }
        // console.info("No metaDefinition found likely due to non-standard sfdx-directory ["
        // + typeFolder + "] containing file [" + metaTypeFile + "]. Will try to resolve ...");
        return null;
    }// end method

    protected inspectFile(filePath: any, metaRegister: Object, parentDir: any) {

        console.log('inspectFile: ' + filePath + ' parentDir: ' + parentDir + ' metaRegister: ' + metaRegister);

        let typeFile = this.isolateLeafNode(filePath); // Account.meta-object.xml
        let typeFileName = this.isolateMetaName(typeFile); //Account
        let typeFolder = this.isolateLeafNode(parentDir); //objects
        let isFolderDefinition = false;
        let keyAnchor = ""; // init empty but not null or undefined 

        // don't process top level directories (from excluded list)
        if (this.isExcludedDirectory(typeFolder)) {
            console.log("Ignoring sfdx folder: " + typeFolder);
            return;
        }

        let metaTypeElement = this.getMetaTypeLookupFromSfdxFolderName(typeFolder, typeFile);

        if (typeFolder === this.dashboards ||
            typeFolder === this.email ||
            typeFolder === this.reports ||
            typeFolder === this.documents) {
            isFolderDefinition = true; // indicator for later usage
        }

        if ((metaTypeElement === undefined) || (metaTypeElement === null)) {

            let metaParentName = this.getMetaNameFromParentDirectory(parentDir);

            // special handle for object name folder (handle for fields etc.)
            if (metaParentName === this.objects) {
                metaTypeElement = this.getMetaTypeLookupFromSfdxFolderName(metaParentName);
            }// end if
            // special handle for aura and lwc 
            else if ((metaParentName === this.aura) ||
                (metaParentName === this.lwc) ||
                (metaParentName === this.objectTranslations)) {
                metaTypeElement = this.getMetaTypeLookupFromSfdxFolderName(metaParentName);
                let folder = this.getMetaNameFromCurrentDirectory(parentDir);
                typeFileName = folder;
            }// end else if
            // special handle for folder types
            else if (metaParentName === this.dashboards ||
                metaParentName === this.email ||
                metaParentName === this.reports ||
                metaParentName === this.documents) {
                metaTypeElement = this.getMetaTypeLookupFromSfdxFolderName(metaParentName);
                let folder = this.getMetaNameFromCurrentDirectory(parentDir);
                keyAnchor = (folder + "/");
                typeFileName = (keyAnchor + typeFileName);
            } // end else if
            else {
                console.error('Unexpected MetaType found at Parent Directory: [' + parentDir
                    + '] Check Meta Definitions are up to date. Unresolved Error FilePath: ' + filePath);
                throw parentDir; // terminate 
            }// end else

            //console.info(typeFolder + " folder item [" + typeFile + "] resolved.");

        } else { // metaTypeElement is not null (so found)
            // handle deep [object] specific items
            /* if ((typeFolder === compactLayouts) ||
                (typeFolder === fields) ||
                (typeFolder === listViews) ||
                (typeFolder === fieldSets) ||
                (typeFolder === recordTypes) ||
                (typeFolder === validationRules) ||
                (typeFolder === webLinks) ||
                (typeFolder === businessProcesses) ||
                (typeFolder === indexes) ||
                (typeFolder === sharingReasons)) {
                let objectName = getMetaNameFromParentDirectory(parentDir);
                keyAnchor = (objectName + "/");
                typeFileName = (objectName + "." + typeFileName); // convention in package.xml
            }// end if 
            */

        }// end if

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

        const fileContents = readFileSync(filePath, this.UTF8);
        const stats = statSync(filePath);

        let diffResult = {
            "registerKey": registerKey,
            "checkKey": checkKey,
            "keyAnchor": keyAnchor,
            "filePath": filePath,
            "parentDirectory": parentDir,
            "fileContents": this.hashCode(fileContents), // only hash as contents is large
            "directory": typeFolder, // sfdx directory e.g. triggers
            "isFolderDefinition": isFolderDefinition,
            "metaTypeDefinition": metaTypeElement,
            "metaType": metaTypeElement.xmlName, // e.g. ApexTrigger
            "metaName": typeFileName, // e.g. Account
            "diffType": this.DiffTypeUnprocessed,
            "lastModified": stats.mtime,
            "fileSize": stats.size,
            "diffSize": 0 // init
        };

        // add unique entry
        metaRegister[registerKey] = diffResult;

    }// end method

    // recursive walk directory function
    protected walkDir(dir: any, metaRegister: Object, callback: any) {

        readdirSync(dir).forEach((fileItem: any) => {

            let dirPath = path.join(dir, fileItem);
            let isDirectory = statSync(dirPath).isDirectory();

            if (isDirectory) {
                this.walkDir(dirPath, metaRegister, callback);
            }
            else {
                callback(path.join(dir, fileItem), metaRegister, dir);
            }
        });
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

    protected compareSourceAndTarget() {

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
    protected sortDiffResultsTypes(diffResults: Object) {

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

                let isException = (isDestructive && this.isDestructiveException(metaType));

                if (isException) { // comment out type which throws error when deploying.
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
                    xmlContent += '    <members>' + member + '</members>\n';
                }// end for

                xmlContent += '  </types>\n';

                if (isException) {
                    xmlContent += " -->";
                }

            }// end if

            xmlContent += comments + '\n';
        }// end for

        xmlContent += '  <version>' + this.apiVersion + '</version>\n';
        xmlContent += '</Package>\n';

        if (!existsSync(this.sourceDeployDirTarget)) {
            mkdirSync(this.sourceDeployDirTarget);
            console.info(this.sourceDeployDirTarget + ' directory created.');
        }

        writeFileSync(packageFile, xmlContent);
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
        console.log('DIFF PROCESS FINISHING UP ... ');
        console.log('-----------------------------');

    }// end method

    protected preparePackageDirectory(): void {

        console.log('-----------------------------');
        console.log('DELETING SOURCE FILE MATCHES ');
        console.log('-----------------------------');

        for (var metaType in this.packageMatchResults) {

            var matchResults = this.packageMatchResults[metaType];

            for (var x = 0; x < matchResults.length; x++) {

                let matchResult = matchResults[x];
                let found = false;
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

    public async process(): Promise<any> {

        this.setupFolders();

        this.checkLocalBackupAndRestore();

        await this.initMetaDefinitions();

        this.setupMetaDefinitionLookups();

        this.setupDiffResults();

        this.walkDirectories();

        this.compareSourceAndTarget();

        this.preparePackageDirectory();

        this.createPackageXmls();

    }// end process
};
