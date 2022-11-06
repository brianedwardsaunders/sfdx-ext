/**
 * @name MdapiChangesetUtility
 * @author brianewardsaunders
 * @date 2019-07-10
 */
import {
  copyFileSync, copySync, existsSync, mkdirSync, readdirSync, removeSync,
  statSync, unlinkSync, writeFileSync
} from "fs-extra";
import type { DescribeMetadataObject } from "jsforce/api/metadata";

import { Org } from "@salesforce/core";
import { MdapiCommon } from "./mdapi-common";
//import { ChangesetExcludeDefault } from "../config/changeset-exclude-default";
import {
  ApplicationVisibility, ChangeType, ClassAccess, CustomObjectChild, CustomPermission,
  DiffRecord, DiffType, FieldPermission, IConfig, ISettings,
  MdapiConfig,
  ObjectPermission,
  PageAccess,
  Profile,
  RecordTypeVisibility,
  RelativePosition,
  TabVisibility,
  UserPermission
} from "./mdapi-config";
import { UX } from "@salesforce/command";
import path = require("path");

export interface DiffStats {
  packageDiffCount: number;
  packageMatchCount: number;
  packageCombinedCount: number;
  destructiveDiffCount: number;
  destructiveIgnoreCount: number;
  destructiveMatchCount: number;
  destructiveCombinedCount: number;
}

export class MdapiChangesetUtility {

  // Local org to org deploy if false
  protected versionControlled = false;

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

  protected filePackageCsv: string;

  protected fileDestructiveChangesXml: string;

  protected deploymentFilePackageCsv: string;

  protected deploymentFilePackageXml: string;

  protected deploymentFileDestructiveChangesXml: string;

  protected leftFilePathDiffRecordRegister: Record<string, DiffRecord> = {}; // E.g. {UniqueFilePath: <DiffRecord>{}}

  protected rightFilePathDiffRecordRegister: Record<string, DiffRecord> = {};

  protected packageDiffRecords: Record<string, Array<DiffRecord>> = {};

  protected packageMatchResults: Record<string, Array<DiffRecord>> = {};

  protected packageCombinedResults: Record<string, Array<DiffRecord>> = {}; // Needed for recon

  protected destructiveDiffRecords: Record<string, Array<DiffRecord>> = {};

  protected destructiveIgnoreResults: Record<string, Array<DiffRecord>> = {};

  protected destructiveMatchResults: Record<string, Array<DiffRecord>> = {};

  protected destructiveCombinedResults: Record<string, Array<DiffRecord>> = {};

  protected diffStats: DiffStats;

  protected destructiveExceptions = MdapiConfig.destructiveExceptions;

  protected packageExceptions = MdapiConfig.packageExceptions;

  constructor(
    protected org: Org,
    protected ux: UX,
    protected sourceOrgAlias: string, // Left (source)
    protected targetOrgAlias: string, // Right (target)
    protected apiVersion: string,
    protected ignoreComments: boolean,
    protected revisionFrom?: string, // Git revision
    protected revisionTo?: string,
    protected createcsv?: boolean,
  ) { // Git revision
    // Noop
  }// End constructor

  protected config: IConfig;

  protected settings: ISettings;

  // Because diff is left sfdx destructive return left to original state
  protected checkLocalBackupAndRestore(): void {

    if (this.versionControlled) {

      return;

    }// No need to backup if version controlled
    this.ux.log(`checking for local backup ${this.sourceRetrieveDirBackup}...`);
    if (!existsSync(this.sourceRetrieveDirBackup)) { // First time

      mkdirSync(this.sourceRetrieveDirBackup);
      copySync(
        this.sourceRetrieveDir,
        this.sourceRetrieveDirBackup
      );
      this.ux.log(`initial backup ${this.sourceRetrieveDirBackup} created`);

    }// End if
    else {

      this.ux.log(`restoring ${this.sourceRetrieveDir} from local backup ${this.sourceRetrieveDirBackup}`);
      removeSync(this.sourceRetrieveDir);
      mkdirSync(this.sourceRetrieveDir);
      copySync(
        this.sourceRetrieveDirBackup,
        this.sourceRetrieveDir
      );
      this.ux.log(`backup ${this.sourceRetrieveDir} restored`);

    }// End else

  }// End method

  protected setupFolders(): void {

    // Check if local staging exist (org to org)
    if (!this.versionControlled && !existsSync(MdapiCommon.stageRoot)) {

      throw "stage source and target retrieve folders required (hint: use ext:mdapi:retrieve -z)";

    }// End if
    else if (this.versionControlled && existsSync(MdapiCommon.stageRoot)) {

      removeSync(MdapiCommon.stageRoot);
      this.ux.log(`${MdapiCommon.stageRoot} cleaned`);

    }// End if

    // E.g. stage
    if (!existsSync(MdapiCommon.stageRoot)) {

      mkdirSync(MdapiCommon.stageRoot);
      this.ux.log(`${MdapiCommon.stageRoot} directory created`);

    }// End if

    // E.g. stage/DevOrg
    this.sourceBaseDir = MdapiCommon.stageRoot + MdapiCommon.PATH_SEP + this.sourceOrgAlias;
    if (!existsSync(this.sourceBaseDir)) {

      mkdirSync(this.sourceBaseDir);
      this.ux.log(`${this.sourceBaseDir} directory created`);

    }// End if

    // E.g. stage/ReleaseOrg
    this.targetBaseDir = MdapiCommon.stageRoot + MdapiCommon.PATH_SEP + this.targetOrgAlias;
    if (!existsSync(this.targetBaseDir)) {

      mkdirSync(this.targetBaseDir);
      this.ux.log(`${this.targetBaseDir} directory created`);

    }// End if

    // E.g. stage/DevOrg/retrieve
    this.sourceRetrieveBaseDir = this.sourceBaseDir + MdapiCommon.PATH_SEP + MdapiCommon.retrievedRoot;
    if (!existsSync(this.sourceRetrieveBaseDir)) {

      mkdirSync(this.sourceRetrieveBaseDir);
      this.ux.log(`${this.sourceRetrieveBaseDir} directory created`);

    }// End if

    // E.g. stage/DevOrg/retrieve/src
    this.sourceRetrieveDir = this.sourceRetrieveBaseDir + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder;
    if (!existsSync(this.sourceRetrieveDir)) {

      mkdirSync(this.sourceRetrieveDir);
      this.ux.log(`${this.sourceRetrieveDir} directory created`);

    }// End if

    // E.g. stage/ReleaseOrg/retrieve
    this.targetRetrieveBaseDir = this.targetBaseDir + MdapiCommon.PATH_SEP + MdapiCommon.retrievedRoot;
    if (!existsSync(this.targetRetrieveBaseDir)) {

      mkdirSync(this.targetRetrieveBaseDir);
      this.ux.log(`${this.targetRetrieveBaseDir} directory created`);

    }// End if

    // E.g. stage/ReleaseOrg/retrieve/src
    this.targetRetrieveDir = this.targetRetrieveBaseDir + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder;
    if (!existsSync(this.targetRetrieveDir)) {

      mkdirSync(this.targetRetrieveDir);
      this.ux.log(`${this.targetRetrieveDir} directory created`);

    }// End if

    // E.g. stage/DevOrg/retrieve/src.backup
    this.sourceRetrieveDirBackup = this.sourceRetrieveDir + MdapiCommon.backupExt;

    // E.g. stage/DevOrg/deploy
    this.sourceDeployDir = this.sourceBaseDir + MdapiCommon.PATH_SEP + MdapiCommon.deployRoot;
    // Check deploy exists else create
    if (!existsSync(this.sourceDeployDir)) {

      mkdirSync(this.sourceDeployDir);
      this.ux.log(`${this.sourceDeployDir} directory created`);

    }// End if

    // E.g. stage/DevOrg/deploy/ReleaseOrg
    this.sourceDeployDirTarget = this.sourceDeployDir + MdapiCommon.PATH_SEP + this.targetOrgAlias;
    // Delete old staging deploy folder
    if (existsSync(this.sourceDeployDirTarget)) {

      removeSync(this.sourceDeployDirTarget);
      this.ux.log(`source deploy target directory ${this.sourceDeployDirTarget} cleaned`);

    }// End if
    // Create staging deploy folder

    mkdirSync(this.sourceDeployDirTarget);
    this.ux.log(`${this.sourceDeployDirTarget} directory created`);

    // E.g. stage/DevOrg/deploy/ReleaseOrg/src
    this.sourceDeployDirTargetSource = this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder;
    this.emptyPackageXml = this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.packageXml;
    this.filePackageCsv = this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.packageManifest;
    this.filePackageXml = this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.packageManifest;
    this.fileDestructiveChangesXml = this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.destructiveChangesManifest;
    this.deploymentFilePackageCsv = this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.diffCsv;
    this.deploymentFilePackageXml = this.sourceDeployDirTargetSource + MdapiCommon.PATH_SEP + MdapiConfig.packageXml;
    this.deploymentFileDestructiveChangesXml = this.sourceDeployDirTargetSource + MdapiCommon.PATH_SEP + MdapiConfig.destructiveChangesPostXml;

  }// End method

  protected isPackageException(metaType: string, element: string) {

    let exception = false;

    if (this.packageExceptions[metaType]) {

      let excludeElements: Array<string> = this.packageExceptions[metaType];

      if (this.packageExceptions[0] === MdapiCommon.ASTERIX) { // All

        exception = true;

      } else {

        for (let x = 0; x < excludeElements.length; x++) {

          if (element === excludeElements[x]) {

            exception = true;
            break;

          }// End if

        }// End for

      }// End else

    }// End if

    return exception;

  }// End method

  protected isGlobalPackageException(metaType: string): boolean {

    if (this.packageExceptions[metaType] &&
      this.packageExceptions[metaType][0] === MdapiCommon.ASTERIX) {

      return true;

    }// End if

    return false;

  }// End method

  protected isDestructiveException(metaType: string, element: string) {

    let exception = false;

    if (this.destructiveExceptions[metaType]) {

      let excludeElements: Array<string> = this.destructiveExceptions[metaType];

      if (this.destructiveExceptions[0] === MdapiCommon.ASTERIX) { // All

        exception = true;

      } else {

        for (let x = 0; x < excludeElements.length; x++) {

          if (element === excludeElements[x]) {

            exception = true;
            break;

          }// End if

        }// End for

      }// End else

    }// End if

    return exception;

  }// End method

  protected isGlobalDestructiveException(metaType: string): boolean {

    if (this.destructiveExceptions[metaType] &&
      this.destructiveExceptions[metaType][0] === MdapiCommon.ASTERIX) {

      return true;

    }// End if

    return false;

  }// End method

  protected setupDiffRecords(): void {

    // Package
    MdapiConfig.initDiffRecordsLookup(
      this.config,
      this.packageDiffRecords
    );
    MdapiConfig.initDiffRecordsLookup(
      this.config,
      this.packageMatchResults
    );
    MdapiConfig.initDiffRecordsLookup(
      this.config,
      this.packageCombinedResults
    );

    // Destructive
    MdapiConfig.initDiffRecordsLookup(
      this.config,
      this.destructiveDiffRecords
    );
    MdapiConfig.initDiffRecordsLookup(
      this.config,
      this.destructiveIgnoreResults
    );
    MdapiConfig.initDiffRecordsLookup(
      this.config,
      this.destructiveMatchResults
    );
    MdapiConfig.initDiffRecordsLookup(
      this.config,
      this.destructiveCombinedResults
    );

  }// End method

  // Recursive walk directory function
  protected walkDir(position: RelativePosition, dir: string, metaRegister: Record<string, DiffRecord>, callback: any): void {

    let fileItems: Array<string> = readdirSync(dir);

    for (let x = 0; x < fileItems.length; x++) {

      let fileItem: string = fileItems[x],
        dirPath: string = path.join(
          dir,
          fileItem
        ),
        isDirectory: boolean = statSync(dirPath).isDirectory();

      if (isDirectory) {

        this.walkDir(
          position,
          dirPath,
          metaRegister,
          callback
        );

      }// End if
      else {

        callback(
          position,
          this.config,
          path.join(
            dir,
            fileItem
          ),
          dir,
          metaRegister
        );

      }// End else

    }// End for

  }// End method

  protected walkDirectories(): void {

    this.walkDir(
      RelativePosition.Source,
      this.sourceRetrieveDir,
      this.leftFilePathDiffRecordRegister,
      MdapiConfig.inspectMdapiFile
    );

    this.walkDir(
      RelativePosition.Target,
      this.targetRetrieveDir,
      this.rightFilePathDiffRecordRegister,
      MdapiConfig.inspectMdapiFile
    );

  }// End method

  // Children only present on one side so no compare needed but do list
  protected compareEdgeChildren(item: DiffRecord): void {

    let childMetaObject: object = MdapiCommon.xmlFileToJson(item.filePath),
      childXmlNames: Array<string> = MdapiCommon.objectToArray(item.metadataObject.childXmlNames);

    for (let x = 0; x < childXmlNames.length; x++) {

      let childMetaName: string = childXmlNames[x];

      if (MdapiConfig.isUnsupportedMetaType(childMetaName)) {

        continue;

      }

      let childMetadataObject: DescribeMetadataObject = this.config.metadataObjectLookup[childMetaName],
        childDirectoryName: string = MdapiConfig.childMetadataDirectoryLookup[childMetaName],

        parentContents: object = childMetaObject[item.metadataName],
        children: Array<CustomObjectChild> = MdapiCommon.objectToArray(parentContents[childDirectoryName]);

      for (let y = 0; y < children.length; y++) {

        let child: CustomObjectChild = children[y],

          childType: string = child.type ? child.type._text : "N/a",
          childLabel: string = child.label ? child.label._text : "N/a",

          memberName: string = item.memberName + MdapiCommon.DOT + child.fullName._text,
          memberKey: string = childDirectoryName + MdapiCommon.PATH_SEP + item.metadataName + MdapiCommon.PATH_SEP + memberName,
          childString: string = JSON.stringify(child),
          childComment = `${childLabel}(${childType})`,

          diffRecord: DiffRecord = <DiffRecord>{
            memberKey,
            memberName,
            "filePath": item.filePath + MdapiCommon.PATH_SEP + childMetaName + MdapiCommon.PATH_SEP + memberName,
            "fileHash": MdapiCommon.hashCode(childString),
            "directory": childDirectoryName,
            "folderXml": false,
            "metadataName": childMetadataObject.xmlName,
            "metadataObject": childMetadataObject,
            "fileSize": childString.length,
            "diffType": item.diffType,
            "diffSize": 0,
            "fileContent": null,
            "title": null,
            "comment": childComment
          };

        if (item.diffType === DiffType.Left) {

          diffRecord.diffSize = childString.length;
          this.packageDiffRecords[childMetaName].push(diffRecord);
          this.diffStats.packageDiffCount++;

          this.diffStats.packageCombinedCount++;
          this.packageCombinedResults[childMetaName].push(diffRecord);

        } else if (item.diffType === DiffType.Right) {

          diffRecord.diffSize = -childString.length;
          this.destructiveIgnoreResults[childMetaName].push(diffRecord);
          this.diffStats.destructiveIgnoreCount++;

          this.diffStats.destructiveCombinedCount++;
          this.destructiveCombinedResults[childMetaName].push(diffRecord);

        } else {

          throw "unexpected child diff edge event - only allows left or right members";

        }// End else

      }// End for

    }// End for

  }// End method

  /**
   * Working with inner file contents
   *
   * @param leftItem
   * @param rightItem
   */
  protected compareChildMetadata(leftItem: DiffRecord, rightItem: DiffRecord): void {

    let leftMetaObject: object = MdapiCommon.xmlFileToJson(leftItem.filePath),
      rightMetaObject: object = MdapiCommon.xmlFileToJson(rightItem.filePath),
      childXmlNames: Array<string> = MdapiCommon.objectToArray(leftItem.metadataObject.childXmlNames);

    for (let x = 0; x < childXmlNames.length; x++) {

      let parentMetadataName: string = leftItem.metadataName,
        childMetaName: string = childXmlNames[x];

      if (MdapiConfig.isUnsupportedMetaType(childMetaName)) {
        continue;
      }

      let childMetadataObject: DescribeMetadataObject = this.config.metadataObjectLookup[childMetaName],
        childDirectoryName: string = MdapiConfig.childMetadataDirectoryLookup[childMetaName],

        leftParentContents: object = leftMetaObject[parentMetadataName],
        rightParentContents: object = rightMetaObject[parentMetadataName],

        leftChildren: Array<CustomObjectChild> = MdapiCommon.objectToArray(leftParentContents[childDirectoryName]),
        rightChildren: Array<CustomObjectChild> = MdapiCommon.objectToArray(rightParentContents[childDirectoryName]);

      /*
       * ---------------------
       * Compare left to right
       * ---------------------
       */
      for (let left = 0; left < leftChildren.length; left++) {

        let leftChild: CustomObjectChild = leftChildren[left],
          leftFullName: string = leftChild.fullName._text,

          leftType: string = leftChild.type ? leftChild.type._text : "N/a",
          leftLabel: string = leftChild.label ? leftChild.label._text : "N/a";

        let found = false,
          rightCheckSum = 0,
          rightChild: CustomObjectChild = null,
          rightChildString: string = null,

          rightIndex = 0;

        for (let right = 0; right < rightChildren.length; right++) {

          rightChild = rightChildren[right];
          let rightFullName: string = rightChild.fullName._text;

          if (leftFullName === rightFullName || leftFullName.localeCompare(rightFullName) === 0) {

            rightChildString = JSON.stringify(rightChild);
            rightCheckSum = MdapiCommon.hashCode(rightChildString);
            rightIndex = right;
            found = true;
            break;

          }// End if

        }// End for right

        let leftMemberName: string = leftItem.memberName + MdapiCommon.DOT + leftFullName,
          leftMemberKey: string = childDirectoryName + MdapiCommon.PATH_SEP + leftItem.metadataName + MdapiCommon.PATH_SEP + leftMemberName,
          leftFilePath: string = leftItem.filePath + MdapiCommon.PATH_SEP + childMetaName + MdapiCommon.PATH_SEP + leftMemberName,
          leftChildString: string = JSON.stringify(leftChild),
          leftCheckSum: number = MdapiCommon.hashCode(leftChildString),
          leftComment = `${leftLabel}(${leftType})`,

          diffRecord: DiffRecord = <DiffRecord>{
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
            "fileContent": null,
            "title": null,
            "comment": leftComment
          };

        if (!diffRecord.metadataName) {

          throw "unexpected scenario child metaType is undefined";

        }// End if

        if (leftCheckSum === rightCheckSum && rightChildString !== leftChildString ||
          leftCheckSum !== rightCheckSum && rightChildString === leftChildString) {

          throw "unexpected scenario checksum failure";

        }// End if

        /**
         * Update to address this error api v49 (force include master detail field into change set)
         * cannot set sharingModel to ControlledByParent on a CustomObject without a MasterDetail relationship field
         */
        if (leftType === "MasterDetail" && found) {
          leftCheckSum = rightCheckSum > 0 ? -rightCheckSum : -1;
        }

        if (found && leftCheckSum === rightCheckSum) {

          // No difference so don't migrate delete on both sides (right only in-memory delete)
          diffRecord.diffType = DiffType.Match;
          diffRecord.diffSize = leftChildString.length - rightChildString.length;
          leftChildren.splice(
            left, 1
          );
          rightChildren.splice(
            rightIndex, 1
          );
          this.packageMatchResults[diffRecord.metadataName].push(diffRecord);
          this.diffStats.packageMatchCount++;

        } else if (found && leftCheckSum !== rightCheckSum) {

          diffRecord.diffType = DiffType.Diff;
          diffRecord.diffSize = leftChildString.length - rightChildString.length;
          this.packageDiffRecords[diffRecord.metadataName].push(diffRecord);
          this.diffStats.packageDiffCount++;

        } else if (!found) { // New entry on left

          diffRecord.diffType = DiffType.Left;
          diffRecord.diffSize = leftChildString.length; // Maximum
          this.packageDiffRecords[diffRecord.metadataName].push(diffRecord);
          this.diffStats.packageDiffCount++;

        } else {

          throw "unexpected compare left to right child scenario";

        }// End else

        this.packageCombinedResults[diffRecord.metadataName].push(diffRecord);
        this.diffStats.packageCombinedCount++;

      }// End for left

      /*
       * ----------------------
       * Compare right to left
       * ----------------------
       */
      for (let right = 0; right < rightChildren.length; right++) {

        let rightChild: CustomObjectChild = rightChildren[right],
          rightFullName: string = rightChild.fullName._text,

          rightType: string = rightChild.type ? rightChild.type._text : "N/a",
          rightLabel: string = rightChild.label ? rightChild.label._text : "N/a";

        let found = false,
          leftCheckSum = 0,

          leftChildString: string = null;

        for (let left = 0; left < leftChildren.length; left++) {

          let leftChild: CustomObjectChild = leftChildren[left],
            leftFullName: string = leftChild.fullName._text;

          if (rightFullName === leftFullName || rightFullName.localeCompare(leftFullName) === 0) {

            leftChildString = JSON.stringify(rightChild);
            leftCheckSum = MdapiCommon.hashCode(leftChildString);
            found = true;
            break;

          }// End if

        }// End for right

        let rightMemberName: string = rightItem.memberName + MdapiCommon.DOT + rightFullName,
          rightMemberKey: string = childDirectoryName + MdapiCommon.PATH_SEP + rightItem.metadataName + MdapiCommon.PATH_SEP + rightMemberName,
          rightFilePath: string = rightItem.filePath + MdapiCommon.PATH_SEP + childMetaName + MdapiCommon.PATH_SEP + rightMemberName,
          rightChildString: string = JSON.stringify(rightChild),
          rightCheckSum: number = MdapiCommon.hashCode(rightChildString),
          rightComment = `${rightLabel}(${rightType})`,

          diffRecord: DiffRecord = <DiffRecord>{
            "memberKey": rightMemberKey,
            "memberName": rightMemberName,
            "filePath": rightFilePath,
            "fileHash": rightCheckSum,
            "directory": childDirectoryName,
            "folderXml": false,
            "metadataName": childMetaName,
            "metadataObject": childMetadataObject,
            "fileSize": rightChildString.length,
            "diffType": DiffType.None,
            "diffSize": 0,
            "fileContent": null,
            "title": null,
            "comment": rightComment
          };

        if (!diffRecord.metadataName) {

          throw "unexpected scenario child metatype is undefined";

        }// End if

        if (rightCheckSum === leftCheckSum && leftChildString !== rightChildString ||
          rightCheckSum !== leftCheckSum && leftChildString === rightChildString) {

          throw "unexpected scenario checksum failure";

        }// End if

        if (!found) {

          diffRecord.diffType = DiffType.Right;
          diffRecord.diffSize = -rightChildString.length;
          this.destructiveDiffRecords[diffRecord.metadataName].push(diffRecord);
          this.diffStats.destructiveDiffCount++;

        } else if (rightCheckSum !== leftCheckSum) {

          diffRecord.diffType = DiffType.Diff; // Already in left diff
          diffRecord.diffSize = rightChildString.length - leftChildString.length;
          this.destructiveIgnoreResults[diffRecord.metadataName].push(diffRecord);
          this.diffStats.destructiveIgnoreCount++;

        } else { // Same unlikely to still exist

          diffRecord.diffType = DiffType.Match;
          diffRecord.diffSize = rightChildString.length - leftChildString.length; // Should be 0
          this.destructiveMatchResults[diffRecord.metadataName].push(diffRecord);
          this.diffStats.destructiveMatchCount++;

        }// End else

        this.destructiveCombinedResults[diffRecord.metadataName].push(diffRecord);
        this.diffStats.destructiveCombinedCount++;

      }// End for right

    }// End for

    MdapiCommon.jsonToXmlFile(
      leftMetaObject,
      leftItem.filePath
    );

  }// End method

  protected compareProfileObjectPermissions(leftItem: DiffRecord, rightItem: DiffRecord) {

    /*
     * Check if items exist on right but not on left.
     * Set right item to remove and inject into left file to delete in right.
     */

    // Extract left
    let leftJsonObject: object = MdapiCommon.xmlFileToJson(leftItem.filePath),
      leftProfile: Profile = <Profile>leftJsonObject[MdapiConfig.Profile],
      leftObjectPermissions: Array<ObjectPermission> = MdapiCommon.objectToArray(leftProfile.objectPermissions),
      leftUserPermissions: Array<UserPermission> = MdapiCommon.objectToArray(leftProfile.userPermissions),
      leftTabVisibilities: Array<TabVisibility> = MdapiCommon.objectToArray(leftProfile.tabVisibilities),
      leftFieldPermissions: Array<FieldPermission> = MdapiCommon.objectToArray(leftProfile.fieldPermissions),
      leftCustomPermissions: Array<CustomPermission> = MdapiCommon.objectToArray(leftProfile.customPermissions),
      leftClassAccesses: Array<ClassAccess> = MdapiCommon.objectToArray(leftProfile.classAccesses),
      leftApplicationVisibilities: Array<ApplicationVisibility> = MdapiCommon.objectToArray(leftProfile.applicationVisibilities),
      leftPageAccesses: Array<PageAccess> = MdapiCommon.objectToArray(leftProfile.pageAccesses),
      leftRecordTypeVisibilities: Array<RecordTypeVisibility> = MdapiCommon.objectToArray(leftProfile.recordTypeVisibilities),

      // Extract right
      rightJsonObject: object = MdapiCommon.xmlFileToJson(rightItem.filePath),
      rightProfile: Profile = <Profile>rightJsonObject[MdapiConfig.Profile],
      rightObjectPermissions: Array<ObjectPermission> = MdapiCommon.objectToArray(rightProfile.objectPermissions),
      rightUserPermissions: Array<UserPermission> = MdapiCommon.objectToArray(rightProfile.userPermissions),
      rightTabVisibilities: Array<TabVisibility> = MdapiCommon.objectToArray(rightProfile.tabVisibilities),
      rightFieldPermissions: Array<FieldPermission> = MdapiCommon.objectToArray(rightProfile.fieldPermissions),
      rightCustomPermissions: Array<CustomPermission> = MdapiCommon.objectToArray(rightProfile.customPermissions),
      rightClassAccesses: Array<ClassAccess> = MdapiCommon.objectToArray(rightProfile.classAccesses),
      rightApplicationVisibilities: Array<ApplicationVisibility> = MdapiCommon.objectToArray(rightProfile.applicationVisibilities),
      rightPageAccesses: Array<PageAccess> = MdapiCommon.objectToArray(rightProfile.pageAccesses),
      rightRecordTypeVisibilities: Array<RecordTypeVisibility> = MdapiCommon.objectToArray(rightProfile.recordTypeVisibilities);

    // Process object permissions
    for (let right = 0; right < rightObjectPermissions.length; right++) {

      let found = false,
        rightObjectPermission: ObjectPermission = rightObjectPermissions[right];

      for (let left = 0; left < leftObjectPermissions.length; left++) {

        let leftObjectPermission: ObjectPermission = leftObjectPermissions[left];

        if (rightObjectPermission.object._text === leftObjectPermission.object._text) {

          found = true;
          break;

        }// End if

      }// End for left
      // Handle if not found
      if (!found) {

        rightObjectPermission.allowCreate._text = "false";
        rightObjectPermission.allowDelete._text = "false";
        rightObjectPermission.allowEdit._text = "false";
        rightObjectPermission.allowRead._text = "false";
        rightObjectPermission.modifyAllRecords._text = "false";
        rightObjectPermission.viewAllRecords._text = "false";
        leftObjectPermissions.push(rightObjectPermission);

      }// End if

    }// End for right

    // Process user permissions
    for (let right = 0; right < rightUserPermissions.length; right++) {

      let found = false,
        rightUserPermission: UserPermission = rightUserPermissions[right];

      for (let left = 0; left < leftUserPermissions.length; left++) {

        let leftUserPermission: UserPermission = leftUserPermissions[left];

        if (rightUserPermission.name._text === leftUserPermission.name._text) {

          found = true;
          break;

        }// End if

      }// End for left
      // Handle if not found
      if (!found) {

        rightUserPermission.enabled._text = "false";
        leftUserPermissions.push(rightUserPermission);

      }// End if

    }// End for right

    // Process tab visibilities
    for (let right = 0; right < rightTabVisibilities.length; right++) {

      let found = false,
        rightTabVisibility: TabVisibility = rightTabVisibilities[right];

      for (let left = 0; left < leftTabVisibilities.length; left++) {

        let leftTabVisibility: TabVisibility = leftTabVisibilities[left];

        if (rightTabVisibility.tab._text === leftTabVisibility.tab._text) {

          found = true;
          break;

        }// End if

      }// End for left
      // Handle if not found
      if (!found) {

        rightTabVisibility.visibility._text = "Hidden";
        leftTabVisibilities.push(rightTabVisibility);

      }// End if

    }// End for right

    // Process field permissions
    for (let right = 0; right < rightFieldPermissions.length; right++) {

      let found = false,
        rightFieldPermission: FieldPermission = rightFieldPermissions[right];

      for (let left = 0; left < leftFieldPermissions.length; left++) {

        let leftFieldPermission: FieldPermission = leftFieldPermissions[left];

        if (rightFieldPermission.field._text === leftFieldPermission.field._text) {

          found = true;
          break;

        }// End if

      }// End for left
      // Handle if not found
      if (!found) {

        rightFieldPermission.editable._text = "false";
        rightFieldPermission.readable._text = "false";
        leftFieldPermissions.push(rightFieldPermission);

      }// End if

    }// End for right

    // Process custom permissions
    for (let right = 0; right < rightCustomPermissions.length; right++) {

      let found = false,
        rightCustomPermission: CustomPermission = rightCustomPermissions[right];

      for (let left = 0; left < leftCustomPermissions.length; left++) {

        let leftCustomPermission: CustomPermission = leftCustomPermissions[left];

        if (rightCustomPermission.name._text === leftCustomPermission.name._text) {

          found = true;
          break;

        }// End if

      }// End for left
      // Handle if not found
      if (!found) {

        rightCustomPermission.enabled._text = "false";
        leftCustomPermissions.push(rightCustomPermission);

      }// End if

    }// End for right

    // Process class accesses
    for (let right = 0; right < rightClassAccesses.length; right++) {

      let found = false,
        rightClassAccess: ClassAccess = rightClassAccesses[right];

      for (let left = 0; left < leftClassAccesses.length; left++) {

        let leftClassAccess: ClassAccess = leftClassAccesses[left];

        if (rightClassAccess.apexClass._text === leftClassAccess.apexClass._text) {

          found = true;
          break;

        }// End if

      }// End for left
      // Handle if not found
      if (!found) {

        rightClassAccess.enabled._text = "false";
        leftClassAccesses.push(rightClassAccess);

      }// End if

    }// End for right

    // Process application visibilities
    for (let right = 0; right < rightApplicationVisibilities.length; right++) {

      let found = false,
        rightApplicationVisibility: ApplicationVisibility = rightApplicationVisibilities[right];

      for (let left = 0; left < leftApplicationVisibilities.length; left++) {

        let leftApplicationVisibility: ApplicationVisibility = leftApplicationVisibilities[left];

        if (rightApplicationVisibility.application._text === leftApplicationVisibility.application._text) {

          found = true;
          break;

        }// End if

      }// End for left
      // Handle if not found
      if (!found) {

        rightApplicationVisibility.default._text = "false";
        rightApplicationVisibility.visible._text = "false";
        leftApplicationVisibilities.push(rightApplicationVisibility);

      }// End if

    }// End for right

    // Process page accesses
    for (let right = 0; right < rightPageAccesses.length; right++) {

      let found = false,
        rightPageAccess: PageAccess = rightPageAccesses[right];

      for (let left = 0; left < leftPageAccesses.length; left++) {

        let leftPageAccess: PageAccess = leftPageAccesses[left];

        if (rightPageAccess.apexPage._text === leftPageAccess.apexPage._text) {

          found = true;
          break;

        }// End if

      }// End for left
      // Handle if not found
      if (!found) {

        rightPageAccess.enabled._text = "false";
        leftPageAccesses.push(rightPageAccess);

      }// End if

    }// End for right

    // Process record type visibilities
    for (let right = 0; right < rightRecordTypeVisibilities.length; right++) {

      let found = false,
        rightRecordTypeVisibility: RecordTypeVisibility = rightRecordTypeVisibilities[right];

      for (let left = 0; left < leftRecordTypeVisibilities.length; left++) {

        let leftRecordTypeVisibility: RecordTypeVisibility = leftRecordTypeVisibilities[left];

        if (rightRecordTypeVisibility.recordType._text === leftRecordTypeVisibility.recordType._text) {

          found = true;
          break;

        }// End if

      }// End for left
      // Handle if not found
      if (!found) {

        rightRecordTypeVisibility.default._text = "false";
        rightRecordTypeVisibility.visible._text = "false";
        leftRecordTypeVisibilities.push(rightRecordTypeVisibility);

      }// End if

    }// End for right

    // Update left profile record
    MdapiCommon.jsonToXmlFile(
      leftJsonObject,
      leftItem.filePath
    );

  }// End if

  protected reconWalkDirectories(): void {

    let sourceCheckZero: number = this.config.sourceFileTotal -
      (this.config.sourceFileIgnored + this.config.sourceFileProcessed);

    if (sourceCheckZero !== 0) {

      this.ux.log("--------------------------------");
      this.ux.log(`sourceFileIgnored    : ${this.config.sourceFileIgnored}`);
      this.ux.log(`sourceFileProcessed  : ${this.config.sourceFileProcessed}`);
      this.ux.log(`sourceFileTotal      : ${this.config.sourceFileTotal}`);
      this.ux.log(`sourceCheckZero      : ${sourceCheckZero}`);
      this.ux.log("--------------------------------");
      console.warn("sourceCheckZero recon failure expecting 0 to balance");

    }// End if

    let targetCheckZero: number = this.config.targetFileTotal -
      (this.config.targetFileIgnored + this.config.targetFileProcessed);

    if (targetCheckZero !== 0) {

      this.ux.log("--------------------------------");
      this.ux.log(`targetFileIgnored    : ${this.config.targetFileIgnored}`);
      this.ux.log(`targetFileProcessed  : ${this.config.targetFileProcessed}`);
      this.ux.log(`targetFileTotal      : ${this.config.targetFileTotal}`);
      this.ux.log(`targetCheckZero      : ${targetCheckZero}`);
      this.ux.log("--------------------------------");
      console.warn("targetCheckZero recon failure expecting 0 to balance");

    }// End if

  }// End if

  protected reconSourceAndTarget(): void {

    let packageCheckZero: number = this.diffStats.packageCombinedCount -
      (this.diffStats.packageDiffCount + this.diffStats.packageMatchCount);

    if (packageCheckZero !== 0) {

      this.ux.log("--------------------------------");
      this.ux.log(`packageDiffCount         : ${this.diffStats.packageDiffCount}`);
      this.ux.log(`packageMatchCount        : ${this.diffStats.packageMatchCount}`);
      this.ux.log(`packageCombinedCount     : ${this.diffStats.packageCombinedCount}`);
      this.ux.log(`packageCheckZeroSum      : ${packageCheckZero}`);
      this.ux.log("--------------------------------");
      console.warn("packageCheckZeroSum recon failure expecting 0 to balance");

    }// End if

    let destructiveCheckZero: number = this.diffStats.destructiveCombinedCount -
      (this.diffStats.destructiveDiffCount + this.diffStats.destructiveIgnoreCount + this.diffStats.destructiveMatchCount);

    if (destructiveCheckZero !== 0) {

      this.ux.log("--------------------------------");
      this.ux.log(`destructiveDiffCount     : ${this.diffStats.destructiveDiffCount}`);
      this.ux.log(`destructiveIgnoreCount   : ${this.diffStats.destructiveIgnoreCount}`);
      this.ux.log(`destructiveMatchCount    : ${this.diffStats.destructiveMatchCount}`);
      this.ux.log(`destructiveCombinedCount : ${this.diffStats.destructiveCombinedCount}`);
      this.ux.log(`destructiveCheckZero     : ${destructiveCheckZero}`);
      this.ux.log("--------------------------------");
      console.warn("destructiveCheckZero recon failure expecting 0 to balance");

    }// End if

  }// End if

  protected compareSourceAndTarget(): void {

    // Compare left to right
    for (let filePath in this.leftFilePathDiffRecordRegister) {

      let leftItem: DiffRecord = this.leftFilePathDiffRecordRegister[filePath],
        rightItem: DiffRecord = this.rightFilePathDiffRecordRegister[filePath];

      if (!rightItem) {

        leftItem.diffType = DiffType.Left;
        leftItem.diffSize = leftItem.fileSize;
        this.packageDiffRecords[leftItem.metadataName].push(leftItem);
        this.diffStats.packageDiffCount++;
        if (MdapiConfig.metadataObjectHasChildren(leftItem.metadataObject)) {

          this.compareEdgeChildren(leftItem);

        }// End if

      }// End if
      else if (leftItem.fileHash !== rightItem.fileHash) {

        leftItem.diffType = DiffType.Diff;
        leftItem.diffSize = leftItem.fileSize - rightItem.fileSize;
        this.packageDiffRecords[leftItem.metadataName].push(leftItem);
        this.diffStats.packageDiffCount++;
        if (MdapiConfig.metadataObjectHasChildren(leftItem.metadataObject)) {

          this.compareChildMetadata(
            leftItem,
            rightItem
          );

        }// End if
        else if (leftItem.metadataName === MdapiConfig.Profile) {

          this.compareProfileObjectPermissions(
            leftItem,
            rightItem
          );

        }// End else if

      }// End if
      else if (leftItem.fileHash === rightItem.fileHash) {

        leftItem.diffType = DiffType.Match;
        leftItem.diffSize = leftItem.fileSize - rightItem.fileSize; // Should be zero
        if (leftItem.diffSize !== 0) {

          throw "unexpected left to right filehash equal but length diff not zero";

        }
        this.packageMatchResults[leftItem.metadataName].push(leftItem);
        this.diffStats.packageMatchCount++;

      }// End else if

      // For audit (check or recon)
      this.packageCombinedResults[leftItem.metadataName].push(leftItem);
      this.diffStats.packageCombinedCount++;

    }// End for

    // Compare right to left
    for (let filePathKey in this.rightFilePathDiffRecordRegister) {

      let leftItem: DiffRecord = this.leftFilePathDiffRecordRegister[filePathKey],
        rightItem: DiffRecord = this.rightFilePathDiffRecordRegister[filePathKey];

      if (!leftItem) {

        rightItem.diffType = DiffType.Right;
        rightItem.diffSize = rightItem.fileSize;
        this.destructiveDiffRecords[rightItem.metadataName].push(rightItem);
        this.diffStats.destructiveDiffCount++;
        if (MdapiConfig.metadataObjectHasChildren(rightItem.metadataObject)) {

          this.compareEdgeChildren(rightItem);

        }// End if

      } else if (rightItem.fileHash !== leftItem.fileHash) {

        rightItem.diffType = DiffType.Diff;
        rightItem.diffSize = rightItem.fileSize - leftItem.fileSize;
        this.destructiveIgnoreResults[rightItem.metadataName].push(rightItem);
        this.diffStats.destructiveIgnoreCount++;
        // Left already included in comparison.

      } else if (rightItem.fileHash === leftItem.fileHash) {

        rightItem.diffType = DiffType.Match;
        rightItem.diffSize = rightItem.fileSize - leftItem.fileSize; // Should be zero
        if (rightItem.diffSize !== 0) {

          throw "unexpected right to left filehash equal but length diff not zero";

        }
        this.destructiveMatchResults[rightItem.metadataName].push(rightItem);
        this.diffStats.destructiveMatchCount++;
        // Excluded not need to transport. ignore details inner comparisons already done before

      }// End else if

      this.destructiveCombinedResults[rightItem.metadataName].push(rightItem);
      this.diffStats.destructiveCombinedCount++;

    }// End for

  }// End method

  protected createPackageFile(packageFile: string, diffRecords: Record<string, Array<DiffRecord>>, changeType: ChangeType): void {

    let xmlContent: string = MdapiConfig.packageXmlHeader(),

      metadataObjectNames: Array<string> = MdapiConfig.sortDiffRecordTypes(diffRecords);

    for (let i = 0; i < metadataObjectNames.length; i++) {

      let metadataObjectName: string = metadataObjectNames[i];

      if (diffRecords[metadataObjectName].length === 0) {

        continue;

      }// End if

      let rawMembers: Array<DiffRecord> = diffRecords[metadataObjectName],
        limitedMembers: Array<string> = [],
        limitedComments: Map<string, string> = new Map<string, string>(),

        // Create comments
        comments = "<!-- \n";

      for (let x = 0; x < rawMembers.length; x++) {

        let diffRecord: DiffRecord = rawMembers[x],
          title: string = diffRecord.title === null ? "" : `name (${diffRecord.title}), `;

        comments += `${diffRecord.diffType}: ${diffRecord.directory
          }${MdapiCommon.PATH_SEP}${MdapiCommon.isolateLeafNode(diffRecord.filePath)}, ${title
          } delta-size ${diffRecord.diffSize} (bytes)` + `, file-size ${diffRecord.fileSize} (bytes), file-hash (${diffRecord.fileHash}) \n`;

        if (changeType === ChangeType.DestructiveChanges && diffRecord.folderXml) {

          let excludeFolderMessage = `NOTE: excluding folder type from destructiveChanges (${diffRecord.memberName}), review manually in target org`;

          this.ux.log(excludeFolderMessage);
          comments += `${excludeFolderMessage}\n`;

        }// End if
        else {

          limitedMembers.push(diffRecord.memberName);
          let comment: string = diffRecord.comment ? `: ${diffRecord.comment}` : "";

          limitedComments.set(
            diffRecord.memberName,
            diffRecord.diffType + comment
          );

        }// End else

      }// End for

      comments += " -->";

      // Ensure only unique entries
      let members: Array<string> = [...new Set(limitedMembers)].sort();

      if (members.length > 0) {

        let isGlobalException = changeType === ChangeType.DestructiveChanges &&
          this.isGlobalDestructiveException(metadataObjectName) ||
          changeType === ChangeType.Package && this.isGlobalPackageException(metadataObjectName);

        if (isGlobalException) { // Comment out type which throws error when deploying.

          xmlContent += "<!-- \n";
          let exceptionMessage = `NOTE: excluding meta type from ${changeType} (${metadataObjectName}), review manually in target org`;

          this.ux.log(exceptionMessage);
          xmlContent += `${exceptionMessage}\n`;

        }// End if

        xmlContent += `${MdapiCommon.TWO_SPACE}<types>\n`;
        xmlContent += `${MdapiCommon.FOUR_SPACE}<name>${metadataObjectName}</name>\n`;

        for (let y = 0; y < members.length; y++) {

          let member = members[y];

          if (!member) {

            this.ux.error(`${metadataObjectName} member unexpected blank`);
            throw "unexpected blank member";

          } // No blanks
          else if (MdapiConfig.isExcludedFile(member)) {

            continue;

          } // E.g. lwc tech files.
          else if (changeType === ChangeType.DestructiveChanges && this.isDestructiveException(
            metadataObjectName,
            member
          ) ||
            changeType === ChangeType.Package && this.isPackageException(
              metadataObjectName,
              member
            )) {

            xmlContent += `<!-- EXCLUDED:${MdapiCommon.FOUR_SPACE}<members>${member}</members> -->\n`;

          } else {

            xmlContent += `${MdapiCommon.FOUR_SPACE}<members>${member}</members>`;
            (!this.ignoreComments && !isGlobalException) ? xmlContent += ` <!-- ${limitedComments.get(member)} -->` : "";
            xmlContent += "\n";

          }

        }// End for

        xmlContent += `${MdapiCommon.TWO_SPACE}</types>\n`;

        if (isGlobalException) {

          xmlContent += ` -->\n`;

        }// End if

      }// End if

      if (!this.ignoreComments) {

        xmlContent += `${comments}\n`;

      }

    }// End for

    xmlContent += `${MdapiCommon.TWO_SPACE}<version>${this.apiVersion}</version>\n`;
    xmlContent += MdapiConfig.packageXmlFooter();

    if (!existsSync(this.sourceDeployDirTarget)) {

      mkdirSync(this.sourceDeployDirTarget);
      this.ux.log(`${this.sourceDeployDirTarget} directory created`);

    }// End if

    writeFileSync(
      packageFile,
      xmlContent
    );

  }// End method

  protected createEmptyPackageFile(): void {

    let xmlContent = MdapiConfig.packageXmlHeader();

    xmlContent += `${MdapiCommon.TWO_SPACE}<!-- NOTE: ./src directory includes deployable changset files -->\n`;
    xmlContent += `${MdapiCommon.TWO_SPACE}<version>${this.apiVersion}</version>\n`;
    xmlContent += MdapiConfig.packageXmlFooter();

    if (!existsSync(this.sourceDeployDirTarget)) {

      mkdirSync(this.sourceDeployDirTarget);

    }// End if

    writeFileSync(
      this.emptyPackageXml,
      xmlContent
    );

  }// End method

  protected createCsvFile(filePackageCsv: string, packageDiffRecords: Record<string, Array<DiffRecord>>, destructiveDiffRecords: Record<string, Array<DiffRecord>>): void {

    let csvContent: string = 'Key,Type,Name,File Size,Diff Size,Hash,Diff Type,Diff Direction,Directory,Path\n';

    let diffObjectNames: Array<string> = MdapiConfig.sortDiffRecordTypes(packageDiffRecords);

    let destDiffObjectNames: Array<string> = MdapiConfig.sortDiffRecordTypes(destructiveDiffRecords);

    for (let i = 0; i < diffObjectNames.length; i++) {

      let metadataObjectName: string = diffObjectNames[i];

      if (packageDiffRecords[metadataObjectName].length === 0) {
        continue;
      }// End if

      let rawMembers: Array<DiffRecord> = packageDiffRecords[metadataObjectName];

      for (let x = 0; x < rawMembers.length; x++) {

        let diffRecord: DiffRecord = rawMembers[x];

        csvContent += `${diffRecord.metadataName}-${diffRecord.memberName},${diffRecord.metadataName},${diffRecord.memberName},${diffRecord.fileSize},${diffRecord.diffSize},${diffRecord.fileHash},Package,${diffRecord.diffType},${diffRecord.directory},${diffRecord.filePath}\n`;
      }// End for
    }

    for (let i = 0; i < destDiffObjectNames.length; i++) {

      let metadataObjectName: string = destDiffObjectNames[i];

      if (destructiveDiffRecords[metadataObjectName].length === 0) {
        continue;
      }// End if

      let rawMembers: Array<DiffRecord> = destructiveDiffRecords[metadataObjectName];

      for (let x = 0; x < rawMembers.length; x++) {

        let diffRecord: DiffRecord = rawMembers[x];

        csvContent += `${diffRecord.metadataName}-${diffRecord.memberName},${diffRecord.metadataName},${diffRecord.memberName},${diffRecord.fileSize},${diffRecord.diffSize},${diffRecord.fileHash},Destructive Package,${diffRecord.diffType},${diffRecord.directory},${diffRecord.filePath}\n`;
      }// End for
    }

    writeFileSync(
      filePackageCsv,
      csvContent
    );

  }// End method

  protected createPackageXmls(): void {

    this.createPackageFile(
      this.filePackageXml,
      this.packageDiffRecords,
      ChangeType.Package
    );

    this.createPackageFile(
      this.fileDestructiveChangesXml,
      this.destructiveDiffRecords,
      ChangeType.DestructiveChanges
    );

    if (this.createcsv) {

      this.createCsvFile(
        this.deploymentFilePackageCsv,
        this.packageDiffRecords,
        this.destructiveDiffRecords
      );

    }

    this.createEmptyPackageFile();

  }// End method

  protected preparePackageDirectory(): void {

    // Only want to transport what is necessary
    for (let metaType in this.packageMatchResults) {

      let matchResults: Array<DiffRecord> = this.packageMatchResults[metaType];

      for (let x = 0; x < matchResults.length; x++) {

        let matchResult: DiffRecord = matchResults[x],
          found = false,
          // Before deleting make sure not part of diff results (e.g. nested bundle).
          diffRecords: Array<DiffRecord> = this.packageDiffRecords[metaType];

        // Check if diff entry exists
        for (let y = 0; y < diffRecords.length; y++) {

          let diffRecord: DiffRecord = diffRecords[y];

          if (matchResult.memberKey === diffRecord.memberKey) { // The path and meta name is key

            found = true;
            break;

          }// End if

        }// End for

        if (!found) {

          // Delete left file if no diff found
          try {

            let { filePath } = matchResult;

            if (existsSync(filePath)) { // Dummy inner meta types (e.g. fields) wont be deleted

              unlinkSync(filePath);

            }// End if

          } catch (error) {

            this.ux.log(error);
            throw error;

          }// End catch

        }// End if

      }// End for

    }// End for

  }// End method

  protected copyDeploymentFiles(): void {

    copySync(
      this.sourceRetrieveDir,
      this.sourceDeployDirTargetSource
    );
    this.ux.log(`${this.sourceRetrieveDir} moved to ${this.sourceDeployDirTargetSource}`);
    removeSync(this.sourceRetrieveDir);

    copyFileSync(
      this.filePackageXml,
      this.deploymentFilePackageXml
    );
    this.ux.log(`${this.deploymentFilePackageXml} file created`);
    unlinkSync(this.filePackageXml);

    copyFileSync(
      this.fileDestructiveChangesXml,
      this.deploymentFileDestructiveChangesXml
    );
    this.ux.log(`${this.deploymentFileDestructiveChangesXml} file created`);
    unlinkSync(this.fileDestructiveChangesXml);

  }// End process

  // Recursive walk directory function
  protected postWalkDir(dir: string, callback: any): void {

    let fileItems: Array<string> = readdirSync(dir);

    for (let x = 0; x < fileItems.length; x++) {

      let fileItem: string = fileItems[x],
        dirPath: string = path.join(
          dir,
          fileItem
        ),
        isDirectory: boolean = statSync(dirPath).isDirectory();

      if (isDirectory) {

        let files: Array<string> = readdirSync(dirPath);

        if (!files || files.length === 0) {

          // Clean empty folders
          if (existsSync(dirPath)) {

            removeSync(dirPath);

          }

        }// End if
        else {

          this.postWalkDir(
            dirPath,
            callback
          );

        }// End else

      }// End if
      else {

        callback(
          this,
          path.join(
            dir,
            fileItem
          ),
          dir
        );

      }// End else

    }// End for

  }// End method

  protected init(): void {

    this.config = MdapiConfig.createConfig();
    this.settings = MdapiConfig.createSettings();

    this.settings.apiVersion = this.apiVersion;

    this.diffStats = <DiffStats>{
      "packageDiffCount": 0,
      "packageMatchCount": 0,
      "packageCombinedCount": 0,
      "destructiveDiffCount": 0,
      "destructiveIgnoreCount": 0,
      "destructiveMatchCount": 0,
      "destructiveCombinedCount": 0
    };

    this.ux.log("setting up excluded meta directory and file items...");

    if (this.revisionFrom && this.revisionTo) {

      this.versionControlled = true;

    }

  }// End method

  protected async checkoutRevisions(): Promise<void> {

    return new Promise((resolve, reject) => {

      if (this.versionControlled) {

        let command = `git checkout ${this.revisionFrom}`;

        this.ux.log(command);
        MdapiCommon.command(command).then(
          (result) => {

            this.ux.log(result);

            this.ux.log(`copying ${MdapiConfig.srcFolder} to ${this.sourceRetrieveDir}`);
            copySync(
              MdapiConfig.srcFolder,
              this.sourceRetrieveDir
            );

            this.ux.log(`git checkout ${this.revisionTo}`);
            MdapiCommon.command(`git checkout ${this.revisionTo}`).then(
              (result) => {

                this.ux.log(result);

                this.ux.log(`copying ${MdapiConfig.srcFolder} to ${this.targetRetrieveDir}`);
                copySync(
                  MdapiConfig.srcFolder,
                  this.targetRetrieveDir
                );

                resolve();

              },
              (error) => {

                this.ux.error(error);
                reject(error);

              }
            );

          },
          (error) => {

            this.ux.error(error);
            reject(error);

          }
        );

      }// End if
      else {

        resolve();

      }// End else

    });

  }// End method

  public async process(): Promise<void> {

    return new Promise((resolve, reject) => {

      this.ux.log("initialising...");
      this.init();

      this.ux.startSpinner("setup folders");
      this.setupFolders();
      this.ux.stopSpinner();

      this.ux.log("checking revisions (please standby)...");
      this.checkoutRevisions().then(() => {

          this.ux.log("check local backup and restore...");
          this.checkLocalBackupAndRestore();

          // Async call
          this.ux.startSpinner("describe metadata");
          MdapiConfig.describeMetadata(
            this.org,
            this.config,
            this.settings
          ).then(() => {

            this.ux.stopSpinner();

            this.ux.log("setup diff records...");
            this.setupDiffRecords();

            this.ux.log("walk directories...");
            this.walkDirectories();

            this.ux.log("recon walk directories...");
            this.reconWalkDirectories();

            this.ux.log("compare source and target...");
            this.compareSourceAndTarget();

            this.ux.log("recon source and target...");
            this.reconSourceAndTarget();

            this.ux.log("prepare package directory...");
            this.preparePackageDirectory();

            this.ux.log("prepare manifest file(s)...");
            this.createPackageXmls();

            this.ux.log("copy deployment files...");
            this.copyDeploymentFiles();

            this.ux.log("finishing up...");
            resolve();

          },
            (error) => {
              this.ux.stopSpinner();
              reject(error);
            }
          );
        },
        (error) => {
          reject(error);
        }
      );

    });

  }// End process

}// End class
