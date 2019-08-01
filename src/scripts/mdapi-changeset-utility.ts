/**
 * @name MdapiChangesetUtility
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

import {
    existsSync, mkdirSync, removeSync, copySync, readdirSync, statSync,
    writeFileSync, unlinkSync, copyFileSync
} from "fs-extra";
import { MetadataObject } from "jsforce";
import { Org } from "@salesforce/core";
import { MdapiCommon } from "./mdapi-common";
import { ChangesetExcludeDefault } from "../config/changeset-exclude-default";
import {
    MdapiConfig, IConfig, ISettings, DiffRecord, DiffType, ChangeType, ChangesetExclude, Dashboard,
    LayoutAssignment, Profile, TabVisibility, FieldPermission, CustomObject, ListView, Textable,
    OrgPreferenceSettings,
    Preference,
    RelativePosition,
    CustomObjectChild,
    ObjectPermission,
    UserPermission
} from "./mdapi-config";
import { UX } from "@salesforce/command";
import path = require('path');

export class MdapiChangesetUtility {

    // local org to org deploy if false
    protected versionControlled: boolean = false;
    protected sourceBaseDir: string;
    protected targetBaseDir: string;
    protected sourceRetrieveBaseDir: string;
    protected sourceRetrieveDir: string;
    protected sourceRetrieveDirBackup: string;
    protected sourceConfigDir: string;
    protected targetRetrieveBaseDir: string;
    protected targetRetrieveDir: string;
    protected sourceDeployDir: string;
    protected sourceDeployDirTarget: string;
    protected sourceDeployDirTargetSource: string;
    protected emptyPackageXml: string;
    protected filePackageXml: string;
    protected fileDestructiveChangesXml: string;
    protected deploymentFilePackageXml: string;
    protected deploymentFileDestructiveChangesXml: string;

    protected leftFilePathDiffRecordRegister: Record<string, DiffRecord> = {}; // e.g. {UniqueFilePath: <DiffRecord>{}}
    protected rightFilePathDiffRecordRegister: Record<string, DiffRecord> = {};

    protected packageDiffRecords: Record<string, Array<DiffRecord>> = {};
    protected packageMatchResults: Record<string, Array<DiffRecord>> = {};
    protected packageCombinedResults: Record<string, Array<DiffRecord>> = {}; // needed for recon

    protected destructiveDiffRecords: Record<string, Array<DiffRecord>> = {};
    protected destructiveIgnoreResults: Record<string, Array<DiffRecord>> = {};
    protected destructiveMatchResults: Record<string, Array<DiffRecord>> = {};

    protected destructiveExceptions = MdapiConfig.destructiveExceptions;

    // configurable see config/changeset-exclude-template.json and ignorePath
    protected directoryExcludeList: Array<string> = [];
    protected fileExcludeList: Array<string> = [];

    constructor(
        protected org: Org,
        protected ux: UX,
        protected sourceOrgAlias: string, // left (source)
        protected targetOrgAlias: string, // right (target)
        protected apiVersion: string,
        protected ignoreComments: boolean,
        protected ignorePath?: string,
        protected revisionFrom?: string,  // git revision
        protected revisionTo?: string, ) { // git revision
        // noop
    }// end constructor

    protected config: IConfig;
    protected settings: ISettings;

    // because diff is left sfdx destructive return left to original state
    protected checkLocalBackupAndRestore(): void {
        if (this.versionControlled) { return; }//no need to backup if version controlled
        this.ux.log('checking for local backup ' + this.sourceRetrieveDirBackup + '...');
        if (!existsSync(this.sourceRetrieveDirBackup)) { // first time
            mkdirSync(this.sourceRetrieveDirBackup);
            copySync(this.sourceRetrieveDir, this.sourceRetrieveDirBackup);
            this.ux.log('initial backup ' + this.sourceRetrieveDirBackup + 'created');
        }// end if
        else {
            this.ux.log('restoring ' + this.sourceRetrieveDir + ' from local backup ' + this.sourceRetrieveDirBackup);
            removeSync(this.sourceRetrieveDir);
            mkdirSync(this.sourceRetrieveDir);
            copySync(this.sourceRetrieveDirBackup, this.sourceRetrieveDir);
            this.ux.log('backup ' + this.sourceRetrieveDir + ' restored');
        }// end else
    }// end method

    protected setupFolders(): void {

        //check if local staging exist (org to org)
        if (!this.versionControlled && !existsSync(MdapiCommon.stageRoot)) {
            throw "stage source and target retrieve folders required (hint: use ext:mdapi:retrieve -z)";
        }// end if
        else if (this.versionControlled && existsSync(MdapiCommon.stageRoot)) {
            removeSync(MdapiCommon.stageRoot);
            this.ux.log(MdapiCommon.stageRoot + ' cleaned');
        }// end if

        // e.g. stage
        if (!existsSync(MdapiCommon.stageRoot)) {
            mkdirSync(MdapiCommon.stageRoot);
            this.ux.log(MdapiCommon.stageRoot + ' directory created');
        }// end if

        // e.g. stage/DevOrg
        this.sourceBaseDir = (MdapiCommon.stageRoot + MdapiCommon.PATH_SEP + this.sourceOrgAlias);
        if (!existsSync(this.sourceBaseDir)) {
            mkdirSync(this.sourceBaseDir);
            this.ux.log(this.sourceBaseDir + ' directory created');
        }// end if

        // e.g. stage/ReleaseOrg
        this.targetBaseDir = (MdapiCommon.stageRoot + MdapiCommon.PATH_SEP + this.targetOrgAlias);
        if (!existsSync(this.targetBaseDir)) {
            mkdirSync(this.targetBaseDir);
            this.ux.log(this.targetBaseDir + ' directory created');
        }// end if

        // e.g. stage/DevOrg/retrieve
        this.sourceRetrieveBaseDir = (this.sourceBaseDir + MdapiCommon.PATH_SEP + MdapiCommon.retrieveRoot);
        if (!existsSync(this.sourceRetrieveBaseDir)) {
            mkdirSync(this.sourceRetrieveBaseDir);
            this.ux.log(this.sourceRetrieveBaseDir + ' directory created');
        }// end if

        // e.g. stage/DevOrg/retrieve/src
        this.sourceRetrieveDir = (this.sourceRetrieveBaseDir + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);
        if (!existsSync(this.sourceRetrieveDir)) {
            mkdirSync(this.sourceRetrieveDir);
            this.ux.log(this.sourceRetrieveDir + ' directory created');
        }// end if

        // e.g. stage/ReleaseOrg/retrieve
        this.targetRetrieveBaseDir = (this.targetBaseDir + MdapiCommon.PATH_SEP + MdapiCommon.retrieveRoot);
        if (!existsSync(this.targetRetrieveBaseDir)) {
            mkdirSync(this.targetRetrieveBaseDir);
            this.ux.log(this.targetRetrieveBaseDir + ' directory created');
        }// end if

        // e.g. stage/ReleaseOrg/retrieve/src
        this.targetRetrieveDir = (this.targetRetrieveBaseDir + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);
        if (!existsSync(this.targetRetrieveDir)) {
            mkdirSync(this.targetRetrieveDir);
            this.ux.log(this.targetRetrieveDir + ' directory created');
        }// end if

        // e.g. stage/DevOrg/retrieve/src.backup
        this.sourceRetrieveDirBackup = (this.sourceRetrieveDir + MdapiCommon.backupExt);

        // e.g. stage/DevOrg/deploy
        this.sourceDeployDir = (this.sourceBaseDir + MdapiCommon.PATH_SEP + MdapiCommon.deployRoot);
        // check deploy exists else create
        if (!existsSync(this.sourceDeployDir)) {
            mkdirSync(this.sourceDeployDir);
            this.ux.log(this.sourceDeployDir + ' directory created');
        }// end if

        // e.g. stage/DevOrg/deploy/ReleaseOrg
        this.sourceDeployDirTarget = (this.sourceDeployDir + MdapiCommon.PATH_SEP + this.targetOrgAlias);
        // delete old staging deploy folder
        if (existsSync(this.sourceDeployDirTarget)) {
            removeSync(this.sourceDeployDirTarget);
            this.ux.log('source deploy target directory ' + this.sourceDeployDirTarget + ' cleaned');
        }// end if
        // create staging deploy folder

        mkdirSync(this.sourceDeployDirTarget);
        this.ux.log(this.sourceDeployDirTarget + ' directory created');

        // e.g. stage/DevOrg/deploy/ReleaseOrg/src
        this.sourceDeployDirTargetSource = (this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);
        this.emptyPackageXml = (this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);
        this.filePackageXml = (this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.packageManifest);
        this.fileDestructiveChangesXml = (this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.destructiveChangesManifest);
        this.deploymentFilePackageXml = (this.sourceDeployDirTargetSource + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);
        this.deploymentFileDestructiveChangesXml = (this.sourceDeployDirTargetSource + MdapiCommon.PATH_SEP + MdapiConfig.destructiveChangesPostXml);
        // this.deploymentFileDestructiveChangesXml = (this.sourceDeployDirTargetSource + MdapiCommon.PATH_SEP + MdapiConfig.destructiveChangesXml);

    }// end method

    protected isDestructiveException(metaType: string, element: string) {

        let exception: boolean = false;

        if (this.destructiveExceptions[metaType]) {

            let excludeElements: Array<string> = this.destructiveExceptions[metaType];

            if (this.destructiveExceptions[0] === MdapiCommon.ASTERIX) { // all
                exception = true;
            } else {
                for (let x: number = 0; x < excludeElements.length; x++) {
                    if (element === excludeElements[x]) {
                        exception = true;
                        break;
                    }// end if
                }// end for
            }// end else
        }// end if

        return exception;

    }// end method

    protected isGlobalDestructiveException(metaType: string): boolean {

        if (this.destructiveExceptions[metaType] &&
            (this.destructiveExceptions[metaType][0] === MdapiCommon.ASTERIX)) {
            return true;
        }// end if
        return false;

    }// end method

    protected setupDiffRecords(): void {

        //package
        MdapiConfig.initDiffRecordsLookup(this.config, this.packageDiffRecords);
        MdapiConfig.initDiffRecordsLookup(this.config, this.packageMatchResults);
        MdapiConfig.initDiffRecordsLookup(this.config, this.packageCombinedResults);

        //destructive
        MdapiConfig.initDiffRecordsLookup(this.config, this.destructiveDiffRecords);
        MdapiConfig.initDiffRecordsLookup(this.config, this.destructiveIgnoreResults);
        MdapiConfig.initDiffRecordsLookup(this.config, this.destructiveMatchResults);

    }// end method

    // recursive walk directory function
    protected walkDir(position: RelativePosition, dir: string, metaRegister: Record<string, DiffRecord>, callback: any): void {

        let fileItems: Array<string> = readdirSync(dir);

        for (let x: number = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x];
            let dirPath: string = path.join(dir, fileItem);
            let isDirectory: boolean = statSync(dirPath).isDirectory();

            if (isDirectory) {
                this.walkDir(position, dirPath, metaRegister, callback);
            }// end if
            else {
                callback(position, this.config, path.join(dir, fileItem), dir, metaRegister);
            }// end else

        }// end for

    }// end method

    protected walkDirectories(): void {

        this.walkDir(RelativePosition.Source, this.sourceRetrieveDir, this.leftFilePathDiffRecordRegister, MdapiConfig.inspectMdapiFile);

        this.walkDir(RelativePosition.Target, this.targetRetrieveDir, this.rightFilePathDiffRecordRegister, MdapiConfig.inspectMdapiFile);

    }// end method

    // children only present on one side so no compare needed but do list
    protected compareEdgeChildren(item: DiffRecord): void {

        let childMetaObject: Object = MdapiCommon.xmlFileToJson(item.filePath);
        let childXmlNames: Array<string> = MdapiCommon.objectToArray(item.metadataObject.childXmlNames);

        for (let x: number = 0; x < childXmlNames.length; x++) {

            let childMetaName: string = childXmlNames[x];

            if (MdapiConfig.isUnsupportedMetaType(childMetaName)) { continue; }

            let childMetadataObject: MetadataObject = this.config.metadataObjectLookup[childMetaName];
            let childDirectoryName: string = MdapiConfig.childMetadataDirectoryLookup[childMetaName];

            let parentContents: Object = childMetaObject[item.metadataName];
            let children: Array<CustomObjectChild> = MdapiCommon.objectToArray(parentContents[childDirectoryName]);

            for (let y: number = 0; y < children.length; y++) {

                let child: CustomObjectChild = children[y];
                let memberName: string = (item.memberName + MdapiCommon.DOT + child.fullName._text);
                let memberKey: string = (childDirectoryName + MdapiCommon.PATH_SEP + item.metadataName + MdapiCommon.PATH_SEP + memberName);
                let childString: string = JSON.stringify(child);

                let diffRecord: DiffRecord = (<DiffRecord>{
                    "memberKey": memberKey,
                    "memberName": memberName,
                    "filePath": (item.filePath + MdapiCommon.PATH_SEP + childMetaName + MdapiCommon.PATH_SEP + memberName),
                    "fileHash": MdapiCommon.hashCode(childString),
                    "directory": childDirectoryName,
                    "folderXml": false,
                    "metadataName": childMetadataObject.xmlName,
                    "metadataObject": childMetadataObject,
                    "fileSize": childString.length,
                    "diffType": item.diffType,
                    "diffSize": 0,
                    "fileContent": null
                });

                if (item.diffType === DiffType.Left) {
                    diffRecord.diffSize = childString.length;
                    this.packageDiffRecords[childMetaName].push(diffRecord);
                } else if (item.diffType === DiffType.Right) {
                    diffRecord.diffSize = (-childString.length);
                    this.destructiveIgnoreResults[childMetaName].push(diffRecord);
                } else {
                    throw "unexpected child diff edge event - only allows left or right members";
                }// end else

                this.packageCombinedResults[childMetaName].push(diffRecord);

            }// end for

        }// end for

    }// end method

    /**
     * working with inner file contents
     * 
     * @param leftItem 
     * @param rightItem 
     */
    protected compareChildMetadata(leftItem: DiffRecord, rightItem: DiffRecord): void {

        let leftMetaObject: Object = MdapiCommon.xmlFileToJson(leftItem.filePath);
        let rightMetaObject: Object = MdapiCommon.xmlFileToJson(rightItem.filePath);
        let childXmlNames: Array<string> = MdapiCommon.objectToArray(leftItem.metadataObject.childXmlNames);

        for (let x: number = 0; x < childXmlNames.length; x++) {

            let parentMetadataName: string = leftItem.metadataName;
            let childMetaName: string = childXmlNames[x];

            if (MdapiConfig.isUnsupportedMetaType(childMetaName)) { continue; }

            let childMetadataObject: MetadataObject = this.config.metadataObjectLookup[childMetaName];
            let childDirectoryName: string = MdapiConfig.childMetadataDirectoryLookup[childMetaName];

            let leftParentContents: Object = leftMetaObject[parentMetadataName];
            let rightParentContents: Object = rightMetaObject[parentMetadataName];

            let leftChildren: Array<CustomObjectChild> = MdapiCommon.objectToArray(leftParentContents[childDirectoryName]);
            let rightChildren: Array<CustomObjectChild> = MdapiCommon.objectToArray(rightParentContents[childDirectoryName]);

            // ---------------------
            // compare left to right
            // ---------------------
            for (let left: number = 0; left < leftChildren.length; left++) {

                let leftChild: CustomObjectChild = leftChildren[left];
                let leftFullName: string = leftChild.fullName._text;

                let rightChild: CustomObjectChild = null;
                let rightChildString: string = null;
                let rightCheckSum: number = 0;
                let rightIndex: number = 0;

                let found: boolean = false;

                for (let right: number = 0; right < rightChildren.length; right++) {

                    rightChild = rightChildren[right];
                    let rightFullName: string = rightChild.fullName._text;

                    if ((leftFullName === rightFullName) || (leftFullName.localeCompare(rightFullName) === 0)) {
                        rightChildString = JSON.stringify(rightChild);
                        rightCheckSum = MdapiCommon.hashCode(rightChildString);
                        rightIndex = right;
                        found = true;
                        break;
                    }// end if

                }// end for right

                let leftMemberName: string = (leftItem.memberName + MdapiCommon.DOT + leftFullName);
                let leftMemberKey: string = (childDirectoryName + MdapiCommon.PATH_SEP + leftItem.metadataName + MdapiCommon.PATH_SEP + leftMemberName);
                let leftFilePath: string = (leftItem.filePath + MdapiCommon.PATH_SEP + childMetaName + MdapiCommon.PATH_SEP + leftMemberName);
                let leftChildString: string = JSON.stringify(leftChild);
                let leftCheckSum: number = MdapiCommon.hashCode(leftChildString);

                let diffRecord: DiffRecord = (<DiffRecord>{
                    "memberKey": leftMemberKey,
                    "memberName": leftMemberName,
                    "filePath": leftFilePath,
                    "fileHash": leftCheckSum,
                    "directory": childDirectoryName,
                    "folderXml": false,
                    "metadataName": childMetaName,
                    "metadataObject": childMetadataObject,
                    "fileSize": leftChildString.length,
                    "diffType": DiffType.None,
                    "diffSize": 0,
                    "fileContent": null
                });

                if (!diffRecord.metadataName) {
                    throw "unexpected scenario child metaType is undefined";
                }// end if

                if (((leftCheckSum === rightCheckSum) && (rightChildString !== leftChildString)) ||
                    ((leftCheckSum !== rightCheckSum) && (rightChildString === leftChildString))) {
                    throw "unexpected scenario checksum failure";
                }// end if

                if (found && (leftCheckSum === rightCheckSum)) {
                    // no difference so don't migrate delete on both sides (right only in-memory delete)
                    diffRecord.diffType = DiffType.Match;
                    diffRecord.diffSize = (leftChildString.length - rightChildString.length);
                    leftChildren.splice(left, 1);
                    rightChildren.splice(rightIndex, 1);
                    this.packageMatchResults[diffRecord.metadataName].push(diffRecord);

                } else if (found && (leftCheckSum !== rightCheckSum)) {

                    diffRecord.diffType = DiffType.Diff;
                    diffRecord.diffSize = (leftChildString.length - rightChildString.length);
                    this.packageDiffRecords[diffRecord.metadataName].push(diffRecord);

                } else if (!found) {// new entry on left                    

                    diffRecord.diffType = DiffType.Left;
                    diffRecord.diffSize = leftChildString.length; // maximum
                    this.packageDiffRecords[diffRecord.metadataName].push(diffRecord);

                } else {
                    throw "unexpected compare left to right child scenario";
                }// end else

                this.packageCombinedResults[diffRecord.metadataName].push(diffRecord);

            }// end for left

            // ---------------------
            // compare right to left
            // ---------------------
            for (let right: number = 0; right < rightChildren.length; right++) {

                let rightChild: CustomObjectChild = rightChildren[right];
                let rightFullName: string = rightChild.fullName._text;

                let leftCheckSum: number = 0;
                let leftChildString: string = null;

                let found: boolean = false;

                for (let left: number = 0; left < leftChildren.length; left++) {

                    let leftChild: CustomObjectChild = leftChildren[left];
                    let leftFullName: string = leftChild.fullName._text;

                    if ((rightFullName === leftFullName) || (rightFullName.localeCompare(leftFullName) === 0)) {
                        leftChildString = JSON.stringify(rightChild);
                        leftCheckSum = MdapiCommon.hashCode(leftChildString);
                        found = true;
                        break;
                    }// end if

                }// end for right

                let rightMemberName: string = (rightItem.memberName + MdapiCommon.DOT + rightFullName);
                let rightMemberKey: string = (childDirectoryName + MdapiCommon.PATH_SEP + rightItem.metadataName + MdapiCommon.PATH_SEP + rightMemberName);
                let rightFilePath: string = (rightItem.filePath + MdapiCommon.PATH_SEP + childMetaName + MdapiCommon.PATH_SEP + rightMemberName);
                let rightChildString: string = JSON.stringify(rightChild);
                let rightCheckSum: number = MdapiCommon.hashCode(rightChildString);

                let diffRecord: DiffRecord = (<DiffRecord>{
                    "memberKey": rightMemberKey,
                    "memberName": rightMemberName,
                    "filePath": rightFilePath,
                    "fileHash": rightCheckSum,
                    "directory": childDirectoryName,
                    "folderXml": false,
                    "metadataName": childMetaName,
                    "metadataObject": childMetadataObject,
                    "fileSize": rightChildString.length,
                    "diffType": DiffType.None, //init
                    "diffSize": 0,
                    "fileContent": null
                });

                if (!diffRecord.metadataName) {
                    throw "unexpected scenario child metatype is undefined";
                }// end if

                if (((rightCheckSum === leftCheckSum) && (leftChildString !== rightChildString)) ||
                    ((rightCheckSum !== leftCheckSum) && (leftChildString === rightChildString))) {
                    throw "unexpected scenario checksum failure";
                }// end if

                if (!found) {
                    diffRecord.diffType = DiffType.Right;
                    diffRecord.diffSize = (-rightChildString.length);
                    this.destructiveDiffRecords[diffRecord.metadataName].push(diffRecord);
                } else if (rightCheckSum !== leftCheckSum) {
                    diffRecord.diffType = DiffType.Diff; // already in left diff
                    diffRecord.diffSize = (rightChildString.length - leftChildString.length);
                    this.destructiveIgnoreResults[diffRecord.metadataName].push(diffRecord);
                } else {// same unlikely to still exist
                    diffRecord.diffType = DiffType.Match;
                    diffRecord.diffSize = (rightChildString.length - leftChildString.length); // should be 0
                    this.destructiveMatchResults[diffRecord.metadataName].push(diffRecord);
                }// end else

            }// end for right

        }// end for

        MdapiCommon.jsonToXmlFile(leftMetaObject, leftItem.filePath);

    }// end method

    protected compareProfileObjectPermissions(leftItem: DiffRecord, rightItem: DiffRecord) {

        // check if object settings exist on right but not on left. 
        // set right item to false and inject into left file to delete in right.

        // extract left
        let leftJsonObject: Object = MdapiCommon.xmlFileToJson(leftItem.filePath);
        let leftProfile: Profile = <Profile>leftJsonObject[MdapiConfig.Profile];
        let leftObjectPermissions: Array<ObjectPermission> = MdapiCommon.objectToArray(leftProfile.objectPermissions);
        let leftUserPermissions: Array<UserPermission> = MdapiCommon.objectToArray(leftProfile.userPermissions);

        // extract right 
        let rightJsonObject: Object = MdapiCommon.xmlFileToJson(rightItem.filePath);
        let rightProfile: Profile = <Profile>rightJsonObject[MdapiConfig.Profile];
        let rightObjectPermissions: Array<ObjectPermission> = MdapiCommon.objectToArray(rightProfile.objectPermissions);
        let rightUserPermissions: Array<UserPermission> = MdapiCommon.objectToArray(rightProfile.userPermissions);

        // process object permissions
        for (let right: number = 0; right < rightObjectPermissions.length; right++) {
            let found: boolean = false;
            let rightObjectPermission: ObjectPermission = rightObjectPermissions[right];
            for (let left: number = 0; left < leftObjectPermissions.length; left++) {
                let leftObjectPermission: ObjectPermission = leftObjectPermissions[left];
                if (rightObjectPermission.object._text === leftObjectPermission.object._text) {
                    found = true;
                    break;
                }// end if
            }// end for left
            // handle if not found
            if (!found) {
                rightObjectPermission.allowCreate._text = 'false';
                rightObjectPermission.allowDelete._text = 'false';
                rightObjectPermission.allowEdit._text = 'false';
                rightObjectPermission.allowRead._text = 'false';
                rightObjectPermission.modifyAllRecords._text = 'false';
                rightObjectPermission.viewAllRecords._text = 'false';
                leftObjectPermissions.push(rightObjectPermission);
            }// end if
        }// end for right

        // process user permissions
        for (let right: number = 0; right < rightUserPermissions.length; right++) {
            let found: boolean = false;
            let rightUserPermission: UserPermission = rightUserPermissions[right];
            for (let left: number = 0; left < leftUserPermissions.length; left++) {
                let leftUserPermission: UserPermission = leftUserPermissions[left];
                if (rightUserPermission.name._text === leftUserPermission.name._text) {
                    found = true;
                    break;
                }// end if
            }// end for left
            // handle if not found
            if (!found) {
                rightUserPermission.enabled._text = 'false';
                leftUserPermissions.push(rightUserPermission);
            }// end if

        }// end for right

        MdapiCommon.jsonToXmlFile(leftJsonObject, leftItem.filePath);

    }// end if

    protected compareSourceAndTarget(): void {

        //compare left to right
        for (let filePath in this.leftFilePathDiffRecordRegister) {

            let leftItem: DiffRecord = this.leftFilePathDiffRecordRegister[filePath];
            let rightItem: DiffRecord = this.rightFilePathDiffRecordRegister[filePath];

            if (!rightItem) {
                leftItem.diffType = DiffType.Left;
                leftItem.diffSize = leftItem.fileSize;
                this.packageDiffRecords[leftItem.metadataName].push(leftItem);
                if (MdapiConfig.metadataObjectHasChildren(leftItem.metadataObject)) {
                    this.compareEdgeChildren(leftItem);
                }// end if
            }// end if
            else if (leftItem.fileHash !== rightItem.fileHash) {
                leftItem.diffType = DiffType.Diff;
                leftItem.diffSize = (leftItem.fileSize - rightItem.fileSize);
                this.packageDiffRecords[leftItem.metadataName].push(leftItem);
                if (MdapiConfig.metadataObjectHasChildren(leftItem.metadataObject)) {
                    this.compareChildMetadata(leftItem, rightItem);
                }// end if
                else if (leftItem.metadataName === MdapiConfig.Profile) {
                    this.compareProfileObjectPermissions(leftItem, rightItem);
                }// end else if 
            }// end if
            else if (leftItem.fileHash === rightItem.fileHash) {
                leftItem.diffType = DiffType.Match;
                leftItem.diffSize = (leftItem.fileSize - rightItem.fileSize); // should be zero
                if (leftItem.diffSize !== 0) { throw "unexpected left to right filehash equal but length diff not zero"; }
                this.packageMatchResults[leftItem.metadataName].push(leftItem);
            }// end else if

            // for audit (check or recon)
            this.packageCombinedResults[leftItem.metadataName].push(leftItem);

        }// end for

        //compare right to left
        for (let filePathKey in this.rightFilePathDiffRecordRegister) {

            let leftItem: DiffRecord = this.leftFilePathDiffRecordRegister[filePathKey];
            let rightItem: DiffRecord = this.rightFilePathDiffRecordRegister[filePathKey];

            if (!leftItem) {
                rightItem.diffType = DiffType.Right;
                rightItem.diffSize = rightItem.fileSize;
                this.destructiveDiffRecords[rightItem.metadataName].push(rightItem);
                if (MdapiConfig.metadataObjectHasChildren(rightItem.metadataObject)) {
                    this.compareEdgeChildren(rightItem);
                }// end if
            }
            else if (rightItem.fileHash !== leftItem.fileHash) {
                rightItem.diffType = DiffType.Diff;
                rightItem.diffSize = (rightItem.fileSize - leftItem.fileSize);
                this.destructiveIgnoreResults[rightItem.metadataName].push(rightItem);
                // left already included in comparison.
            }
            else if (rightItem.fileHash === leftItem.fileHash) {
                rightItem.diffType = DiffType.Match;
                rightItem.diffSize = (rightItem.fileSize - leftItem.fileSize); // should be zero
                if (rightItem.diffSize !== 0) { throw "unexpected right to left filehash equal but length diff not zero"; }
                this.destructiveMatchResults[rightItem.metadataName].push(rightItem);
                // excluded not need to transport. ignore details inner comparisons already done before
            }// end else if

        }// end for

    }// end method

    protected createPackageFile(packageFile: string, diffRecords: Record<string, Array<DiffRecord>>, changeType: ChangeType): void {

        let xmlContent: string = MdapiConfig.packageXmlHeader();

        let metadataObjectNames: Array<string> = MdapiConfig.sortDiffRecordTypes(diffRecords);

        for (let i: number = 0; i < metadataObjectNames.length; i++) {

            let metadataObjectName: string = metadataObjectNames[i];

            if (diffRecords[metadataObjectName].length === 0) {
                continue;
            }// end if

            let rawMembers: Array<DiffRecord> = diffRecords[metadataObjectName];
            let limitedMembers: Array<string> = [];

            // create comments
            let comments: string = "<!-- \n";

            for (let x: number = 0; x < rawMembers.length; x++) {

                let diffRecord: DiffRecord = rawMembers[x];

                comments += (diffRecord.diffType + ": " + diffRecord.directory +
                    MdapiCommon.PATH_SEP + MdapiCommon.isolateLeafNode(diffRecord.filePath)
                    + ", delta-size " + diffRecord.diffSize + " (bytes)" + ", file-size "
                    + diffRecord.fileSize + " (bytes), file-hash (" + diffRecord.fileHash + ") \n");

                if ((changeType === ChangeType.DestructiveChanges) && diffRecord.folderXml) {
                    let excludeFolderMessage: string = 'NOTE: excluding folder type from destructiveChanges ('
                        + diffRecord.memberName + '), review manually in target org';
                    this.ux.log(excludeFolderMessage);
                    comments += (excludeFolderMessage + '\n');
                }// end if
                else {
                    limitedMembers.push(diffRecord.memberName);
                }// end else

            }//end for

            comments += " -->";

            // ensure only unique entries
            let members: Array<string> = [...new Set(limitedMembers)].sort();

            if (members.length > 0) {

                let isGlobalException = ((changeType === ChangeType.DestructiveChanges) &&
                    this.isGlobalDestructiveException(metadataObjectName));

                if (isGlobalException) { // comment out type which throws error when deploying.
                    xmlContent += "<!-- \n";
                    let exceptionMessage = 'NOTE: excluding meta type from destructiveChanges ('
                        + metadataObjectName + '), review manually in target org';
                    this.ux.log(exceptionMessage);
                    xmlContent += (exceptionMessage + '\n');
                }// end if

                xmlContent += MdapiCommon.TWO_SPACE + '<types>\n';
                xmlContent += MdapiCommon.FOUR_SPACE + '<name>' + metadataObjectName + '</name>\n';

                for (let y = 0; y < members.length; y++) {
                    let member = members[y];
                    if (!(member)) {
                        this.ux.error(metadataObjectName + " member unexpected blank");
                        throw "unexpected blank member";
                    } // no blanks
                    else if (MdapiConfig.isExcludedFile(member)) { continue; } // e.g. lwc tech files.
                    else if (((changeType === ChangeType.DestructiveChanges) &&
                        this.isDestructiveException(metadataObjectName, member))) {
                        xmlContent += '<!-- EXCLUDED:    <members>' + member + '</members> -->\n';
                    }
                    else { xmlContent += MdapiCommon.FOUR_SPACE + '<members>' + member + '</members>\n'; }
                }// end for

                xmlContent += (MdapiCommon.TWO_SPACE + '</types>\n');

                if (isGlobalException) { xmlContent += " -->"; }// end if

            }// end if

            if (!this.ignoreComments) { xmlContent += (comments + '\n'); }

        }// end for

        xmlContent += (MdapiCommon.TWO_SPACE + '<version>' + this.apiVersion + '</version>\n');
        xmlContent += MdapiConfig.packageXmlFooter();

        if (!existsSync(this.sourceDeployDirTarget)) {
            mkdirSync(this.sourceDeployDirTarget);
            this.ux.log(this.sourceDeployDirTarget + ' directory created');
        }// end if

        writeFileSync(packageFile, xmlContent);

    }// end method

    protected createEmptyPackageFile(): void {

        let xmlContent = MdapiConfig.packageXmlHeader();
        xmlContent += (MdapiCommon.TWO_SPACE + '<!-- NOTE: ./src directory includes deployable changset files -->\n');
        xmlContent += (MdapiCommon.TWO_SPACE + '<version>' + this.apiVersion + '</version>\n');
        xmlContent += MdapiConfig.packageXmlFooter();

        if (!existsSync(this.sourceDeployDirTarget)) {
            mkdirSync(this.sourceDeployDirTarget);
        }// end if

        writeFileSync(this.emptyPackageXml, xmlContent);

    }// end method

    protected createPackageXmls(): void {

        this.createPackageFile(
            this.filePackageXml,
            this.packageDiffRecords,
            ChangeType.Package);

        this.createPackageFile(
            this.fileDestructiveChangesXml,
            this.destructiveDiffRecords,
            ChangeType.DestructiveChanges);

        this.createEmptyPackageFile();

    }// end method

    protected preparePackageDirectory(): void {

        // only want to transport what is necessary
        for (let metaType in this.packageMatchResults) {

            let matchResults: Array<DiffRecord> = this.packageMatchResults[metaType];

            for (let x: number = 0; x < matchResults.length; x++) {

                let matchResult: DiffRecord = matchResults[x];
                let found: boolean = false;
                // before deleting make sure not part of diff results (e.g. nested bundle).
                let diffRecords: Array<DiffRecord> = this.packageDiffRecords[metaType];

                // check if diff entry exists
                for (let y: number = 0; y < diffRecords.length; y++) {

                    let diffRecord: DiffRecord = diffRecords[y];

                    if (matchResult.memberKey === diffRecord.memberKey) { // the path and meta name is key
                        found = true;
                        break;
                    }// end if

                }// end for

                if (!found) {
                    // delete left file if no diff found
                    try {
                        let filePath: string = matchResult.filePath;
                        if (existsSync(filePath)) { // dummy inner meta types (e.g. fields) wont be deleted
                            unlinkSync(filePath);
                        }// end if
                    } catch (error) {
                        this.ux.log(error);
                        throw error;
                    }// end catch
                }// end if

            }// end for

        }// end for

    }// end method

    protected copyDeploymentFiles(): void {

        copySync(this.sourceRetrieveDir, this.sourceDeployDirTargetSource);
        this.ux.log(this.sourceRetrieveDir + ' moved to ' + this.sourceDeployDirTargetSource);
        removeSync(this.sourceRetrieveDir);

        copyFileSync(this.filePackageXml, this.deploymentFilePackageXml);
        this.ux.log(this.deploymentFilePackageXml + ' file created');
        unlinkSync(this.filePackageXml);

        copyFileSync(this.fileDestructiveChangesXml, this.deploymentFileDestructiveChangesXml);
        this.ux.log(this.deploymentFileDestructiveChangesXml + ' file created');
        unlinkSync(this.fileDestructiveChangesXml);

    }// end process

    // recursive walk directory function
    protected postWalkDir(dir: string, callback: any): void {

        let fileItems: Array<string> = readdirSync(dir);

        for (let x: number = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x];
            let dirPath: string = path.join(dir, fileItem);
            let isDirectory: boolean = statSync(dirPath).isDirectory();

            if (isDirectory) {
                let files: Array<string> = readdirSync(dirPath);
                if (!files || files.length === 0) {
                    // clean empty folders
                    if (existsSync(dirPath)) { removeSync(dirPath); }
                }// end if
                else {
                    this.postWalkDir(dirPath, callback);
                }// end else
            }// end if
            else {
                callback(this, path.join(dir, fileItem), dir);
            }// end else
        }// end for

    }// end method

    protected postInspectFile(instance: MdapiChangesetUtility, filePath: string, parentDir: string): void {

        let typeFolder = MdapiCommon.isolateLeafNode(parentDir);
        let grandParentFolder = MdapiConfig.getMetadataNameFromParentDirectory(parentDir);

        if (typeFolder === MdapiConfig.objects) {

            if (filePath.endsWith('Lead.object')) {

                let jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);
                let customObject: CustomObject = jsonObject[MdapiConfig.CustomObject];
                let listViews: Array<ListView> = MdapiCommon.objectToArray(customObject.listViews);

                for (let x: number = 0; x < listViews.length; x++) {
                    let listView = listViews[x];
                    let columns: Array<Textable> = MdapiCommon.objectToArray(listView.columns);
                    for (let y: number = 0; y < columns.length; y++) {
                        let column = columns[y];
                        if (column._text === 'LEAD_SCORE') {
                            columns.splice(y, 1); // pop
                            break;
                        }// end if
                    }// end if
                }// end for

                MdapiCommon.jsonToXmlFile(jsonObject, filePath);

            }// end if
            else if (filePath.endsWith('Opportunity.object')) {

                let jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);
                let customObject: CustomObject = jsonObject[MdapiConfig.CustomObject];
                let listViews: Array<ListView> = MdapiCommon.objectToArray(customObject.listViews);

                for (let x: number = 0; x < listViews.length; x++) {
                    let listView = listViews[x];
                    let columns: Array<Textable> = MdapiCommon.objectToArray(listView.columns);
                    for (let y: number = 0; y < columns.length; y++) {
                        let column = columns[y];
                        if (column._text === 'OPPORTUNITY_SCORE') {
                            columns.splice(y, 1); // pop
                            break;
                        }// end if
                    }// end if
                }// end for

                MdapiCommon.jsonToXmlFile(jsonObject, filePath);

            }// end if
            else if (filePath.endsWith('Task.object')) {

                let jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);
                let customObject: CustomObject = jsonObject[MdapiConfig.CustomObject];
                let listViews: Array<ListView> = MdapiCommon.objectToArray(customObject.listViews);

                // FIXME should actually be looking for duplicates and removing. on all list views....
                for (let x: number = 0; x < listViews.length; x++) {
                    let count: number = 0;
                    let listView: ListView = listViews[x];
                    let listViewLabel: string = listView.fullName._text;
                    for (let y: number = 0; y < listViews.length; y++) {
                        let listViewCompare = listViews[y];
                        let listViewCompareLabel: string = listViewCompare.fullName._text;
                        if (listViewLabel === listViewCompareLabel) {
                            count++;
                            if (count > 1) {
                                listViews.splice(y, 1); // remove duplicates
                            }// end if
                        }// end if
                    }// end if 
                }// end if 

                // too long ENCODED:{!FilterNames.Task_DelegatedTasks} 40 charater limit
                for (let x: number = 0; x < listViews.length; x++) {
                    let listView: ListView = listViews[x];
                    // Value too long for field: Name maximum length is:40
                    if (listView.fullName._text === 'UnscheduledTasks' &&
                        listView.label._text === 'ENCODED:{!FilterNames.Task_UnscheduledTasks}') {
                        listView.label._text = 'Unscheduled Tasks';
                    }// end if
                    else if (listView.fullName._text === 'CompletedTasks' &&
                        listView.label._text === 'ENCODED:{!FilterNames.Task_CompletedTasks}') {
                        listView.label._text = 'Completed Tasks';
                    }// end if
                    else if (listView.fullName._text === 'DelegatedTasks' &&
                        listView.label._text === 'ENCODED:{!FilterNames.Task_DelegatedTasks}') {
                        listView.label._text = 'Delegated Tasks';
                    }// end if
                    else if (listView.fullName._text === 'RecurringTasks' &&
                        listView.label._text === 'ENCODED:{!FilterNames.Task_RecurringTasks}') {
                        listView.label._text = 'Recurring Tasks';
                    }// end if
                }// end for

                MdapiCommon.jsonToXmlFile(jsonObject, filePath);

            }// end if

        }// end else if
        // check profile issues
        else if (typeFolder === MdapiConfig.profiles) {

            let jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);
            let profile: Profile = <Profile>jsonObject[MdapiConfig.Profile];

            //  set standard profile user permssions to blank as should not be able to change.
            if (profile.custom._text === 'false') {
                profile.userPermissions = [];
            }// end if

            // handle this wierd situation of duplicates Duplicate layoutAssignment:PersonAccount
            let layoutAssignments: Array<LayoutAssignment> = MdapiCommon.objectToArray(profile.layoutAssignments);

            // only one record type to page layout assignment per profile
            for (let x: number = 0; x < layoutAssignments.length; x++) {
                let layoutAssignment: LayoutAssignment = layoutAssignments[x];
                let count: number = 0;
                for (let y: number = 0; y < layoutAssignments.length; y++) {
                    let layoutAssignmentCompare: LayoutAssignment = layoutAssignments[y];
                    if (!(layoutAssignment.recordType && layoutAssignmentCompare.recordType)) {
                        continue;
                    }// end if
                    else if (layoutAssignment.recordType._text === layoutAssignmentCompare.recordType._text) {
                        count++;
                    }// end else if

                    if (count > 1) {
                        instance.ux.warn('removing duplicate ' + layoutAssignmentCompare.layout._text
                            + ' layoutAssignment record type ' + layoutAssignmentCompare.recordType._text + ' in profile ' + filePath);
                        layoutAssignments.splice(y, 1);
                        break;
                    }// end if
                }// end for
            }// end for

            let userPermissions = MdapiCommon.objectToArray(profile.userPermissions);

            for (let x: number = 0; x < userPermissions.length; x++) {
                let userPermission = userPermissions[x];
                if (userPermission.name._text === 'ManageSandboxes') {
                    userPermissions.splice(x, 1); // pop
                    break;
                }// end if
            }// end for

            // this causes errors
            let tabVisibilities: Array<TabVisibility> = MdapiCommon.objectToArray(profile.tabVisibilities);

            for (let x: number = 0; x < tabVisibilities.length; x++) {
                let tabVisibility = tabVisibilities[x];
                // You can't edit tab settings for SocialPersona, as it's not a valid tab.
                if (tabVisibility.tab._text === 'standard-SocialPersona') {
                    tabVisibilities.splice(x, 1); // pop
                    break;
                }// end if
            }// end for

            let fieldPermissions: Array<FieldPermission> = MdapiCommon.objectToArray(profile.fieldPermissions);

            // field service field being injected in to PersonLifeEvent object (remove)
            for (let x: number = 0; x < fieldPermissions.length; x++) {
                let fieldPermission = fieldPermissions[x];
                if (fieldPermission.field._text === 'PersonLifeEvent.LocationId') {
                    fieldPermissions.splice(x, 1); // pop
                    break;
                }// end if
            }// end for

            MdapiCommon.jsonToXmlFile(jsonObject, filePath);

        }// end if (profile)
        // check dashboard run as issues
        else if (grandParentFolder === MdapiConfig.dashboards) {

            let jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);
            let dashboard: Dashboard = jsonObject[MdapiConfig.Dashboard];

            if (dashboard.dashboardType &&
                (dashboard.dashboardType._text === 'SpecifiedUser')) {
                // noop
            }// end if
            else if (dashboard.runningUser) {
                delete dashboard.runningUser;
            }// end if

            MdapiCommon.jsonToXmlFile(jsonObject, filePath);

        }// end if (dashboards)
        else if (typeFolder === MdapiConfig.settings) {

            if (filePath.endsWith('OrgPreference.settings')) {

                let jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);
                let orgPreferenceSettings: OrgPreferenceSettings = jsonObject[MdapiConfig.OrgPreferenceSettings];
                let preferences: Array<Preference> = MdapiCommon.objectToArray(orgPreferenceSettings.preferences);

                for (let x: number = 0; x < preferences.length; x++) {
                    let preference: Preference = preferences[x];
                    ////You do not have sufficient rights to access the organization setting: CompileOnDeploy
                    if (preference.settingName._text === 'CompileOnDeploy') {
                        preferences.splice(x, 1);
                    }// end if
                }// end for

                MdapiCommon.jsonToXmlFile(jsonObject, filePath);

            }// end if

        }// end if

    }// end method

    protected postScreenDeploymentFiles(): void {

        this.postWalkDir(this.sourceDeployDirTargetSource, this.postInspectFile);

    }// end process

    protected deleteExcludedDirectories(): void {

        this.directoryExcludeList.forEach(folder => {

            let leftDir = (this.sourceRetrieveDir + MdapiCommon.PATH_SEP + folder);

            if (existsSync(leftDir)) {
                removeSync(leftDir);
            }// end if

            let rightDir = (this.targetRetrieveDir + MdapiCommon.PATH_SEP + folder);

            if (existsSync(rightDir)) {
                removeSync(rightDir);
            }// end if
        });
    }// end method

    protected deleteExcludedFiles(): void {

        this.fileExcludeList.forEach(filePath => {

            let leftFile = (this.sourceRetrieveDir + MdapiCommon.PATH_SEP + filePath);

            if (existsSync(leftFile)) {
                unlinkSync(leftFile);
            }// end if

            let rightFile = (this.targetRetrieveDir + MdapiCommon.PATH_SEP + filePath);

            if (existsSync(rightFile)) {
                unlinkSync(rightFile);
            }// end if
        });
    }// end method

    protected init(): void {

        this.config = MdapiConfig.createConfig();
        this.settings = MdapiConfig.createSettings();
        let changesetExclude: ChangesetExclude = null;
        this.settings.apiVersion = this.apiVersion;

        if (this.revisionFrom && this.revisionTo) { this.versionControlled = true; }

        if (this.ignorePath) {
            if (!existsSync(this.ignorePath)) { throw "ignorepath file not found - please check path to file is correct"; }
            changesetExclude = MdapiCommon.fileToJson<ChangesetExclude>(this.ignorePath);
        }// end if
        else {
            // load from default
            changesetExclude = new ChangesetExcludeDefault();
        }// end else

        this.directoryExcludeList = changesetExclude.directoryExcludes;
        this.fileExcludeList = changesetExclude.fileExcludes;
        this.ux.log('changeset exclude items loaded');

    }// end method

    protected async checkoutRevisions(): Promise<void> {

        return new Promise((resolve, reject) => {

            if (this.versionControlled) {

                let command: string = 'git checkout ' + this.revisionFrom;

                this.ux.log(command);
                MdapiCommon.command(command).then((result) => {

                    this.ux.log(result);

                    this.ux.log('copying ' + MdapiConfig.srcFolder + ' to ' + this.sourceRetrieveDir);
                    copySync(MdapiConfig.srcFolder, this.sourceRetrieveDir);

                    this.ux.log('git checkout ' + this.revisionTo);
                    MdapiCommon.command('git checkout ' + this.revisionTo).then((result) => {

                        this.ux.log(result);

                        this.ux.log('copying ' + MdapiConfig.srcFolder + ' to ' + this.targetRetrieveDir);
                        copySync(MdapiConfig.srcFolder, this.targetRetrieveDir);

                        resolve();

                    }, (error) => {
                        this.ux.error(error);
                        reject(error);
                    });

                }, (error) => {
                    this.ux.error(error);
                    reject(error);
                });

            }// end if
            else {
                resolve();
            }// end else

        });
    }// end method

    public async process(): Promise<void> {

        return new Promise((resolve, reject) => {

            this.ux.log('initialising...');
            this.init();

            this.ux.startSpinner('setup folders');
            this.setupFolders();
            this.ux.stopSpinner();

            this.ux.log('checking revisions (please standby)...');
            this.checkoutRevisions().then(() => {

                this.ux.log('check local backup and restore...');
                this.checkLocalBackupAndRestore();

                // async calls
                this.ux.startSpinner('describe metadata');
                MdapiConfig.describeMetadata(this.org, this.config, this.settings).then(() => {

                    this.ux.stopSpinner();

                    this.ux.log('deleting excluded directories');
                    this.deleteExcludedDirectories();

                    this.ux.log('deleting excluded files');
                    this.deleteExcludedFiles();

                    this.ux.log('setup diff records...');
                    this.setupDiffRecords();

                    this.ux.log('walk directories...');
                    this.walkDirectories();

                    this.ux.log('compare source and target...');
                    this.compareSourceAndTarget();

                    this.ux.log('prepare package directory...');
                    this.preparePackageDirectory();

                    this.ux.log('prepare destructiveChanges.xml and package.xml...');
                    this.createPackageXmls();

                    this.ux.log('copy deployment files...');
                    this.copyDeploymentFiles();

                    this.ux.log('post file screening...');
                    this.postScreenDeploymentFiles();

                    resolve();

                }, (error) => {
                    this.ux.stopSpinner();
                    reject(error);
                });

            }, (error) => {
                reject(error);
            });

        });

    }// end process

}// end class
