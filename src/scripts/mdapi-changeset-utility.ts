/**
 * @name MdapiChangesetUtility
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

import {
    existsSync, mkdirSync, removeSync, copySync, readdirSync, statSync,
    writeFileSync, readFileSync, unlinkSync, copyFileSync, Stats
} from "fs-extra";
import { MetadataObject } from "jsforce";
import { Org } from "@salesforce/core";
import { MdapiCommon } from "./mdapi-common";
import { MdapiConfig, IConfig, ISettings } from "./mdapi-config";
import { UX } from "@salesforce/command";
import path = require('path');

export enum ChangeType {
    Package,
    DestructiveChanges
};

export enum DiffType {
    Left = 'Left',
    Right = 'Right',
    Match = 'Match',
    Diff = 'Diff',
    None = 'None'
};

export interface DiffRecord {
    memberKey: string;
    memberName: string, // e.g. Account
    filePath: string;
    fileHash: number; // only hash as contents is large
    directory: string; // sfdx directory e.g. triggers
    metadataName: string;
    metadataObject: MetadataObject;
    fileSize: number;
    lastModified: Date;
    diffType: DiffType;
    diffSize: number; // init
};

export class MdapiChangesetUtility {

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

    /* protected objectChildMetaDirectories = [
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

  

    /* protected metadataFoldersLookup: Object = {
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
    ]; */

    protected leftFilePathDiffRecordRegister: Record<string, DiffRecord> = {}; // e.g. {UniqueFilePath: <DiffRecord>{}}
    protected rightFilePathDiffRecordRegister: Record<string, DiffRecord> = {};

    protected packageDiffRecords: Record<string, Array<DiffRecord>> = {};
    protected packageMatchResults: Record<string, Array<DiffRecord>> = {};
    //protected packageCombinedResults: Record<string, Array<DiffRecord>> = {};

    protected destructiveDiffRecords: Record<string, Array<DiffRecord>> = {};
    protected destructiveIgnoreResults: Record<string, Array<DiffRecord>> = {};
    protected destructiveMatchResults: Record<string, Array<DiffRecord>> = {};

    protected destructiveExceptions = {
        "Workflow": ["*"],
        "AssignmentRules": ["*"],
        "CustomObjectTranslation": ["*"],
        "Flow": ["*"],
        "FlowDefinition": ["*"],
        "CustomObject": ["ActiveScratchOrg", "NamespaceRegistry", "ScratchOrgInfo"], // prod specific 
        "CustomApplication": ["standard__LightningInstrumentation"] // prod specific 
    };

    // PROFILES ARE HANDLED IN ProfileDiff.js as this folder likely contains partial profile only.
    protected directoryRemoveList: Array<string> = [
        "/profilePasswordPolicies", // get all kinds of issues with this org specific
        "/profileSessionSettings", // get all kinds of issues with this org specific
        "/animationRules", // cannot deploy
        "/flowDefinitions" // not required
    ];

    // SFDC WONT ALLOW THE MIGRATION OF THESE FILES (FIELDS PART OF MANAGED PACKAGE)
    // ERROR Cannot modify managed object: entity=FieldAttributes, component=0DH4J0000001LaB, field=BusinessStatus, state=installed
    // manually check field history tracking
    // IqScore is EMPTY AND EISTEING ACTIVATION DEPENDENT
    protected fileRemoveList: Array<string> = [
        "/applications/FinServ__BankingConsoleFinancialServicesCloud.app",
        "/applications/FinServ__FinancialServicesCloudRetailBanking.app",
        "/applications/FinServ__FSC_Lightning.app",
        "/applications/FinServ__InsuranceConsoleFinancialServicesCloud.app",
        "/appMenus/AppSwitcher.appMenu", // can't migrate AppSwitcher
        "/classes/FinServ__MoiConstants.cls", // can't migrate managed package classes
        "/classes/FinServ__MoiConstants.cls-meta.xml",
        //these signed certificates can be migrated
        "/certs/mulesoft_entities_api_certificate.crt-meta.xml",
        "/certs/mulesoft_entities_api_certificate.crt",
        "/certs/aw_mulesoft.crt-meta.xml",
        "/certs/aw_mulesoft.crt",
        "/connectedApps/GitLab.connectedApp", // will differ from org to org manual setup once
        "/profiles/B2BMA Integration User.profile", //'B2BMA Integration User': You may not turn off permission Read All RetailVisitTemplate for this License Type
        "/pathAssistants/Default_Opportunity.pathAssistant", // has domain hard coded and can't migrate this thing
        //Cannot modify managed object: entity=CustomPermissionSet
        "/permissionsets/FinServ__Advisor.permissionset",
        "/permissionsets/FinServ__AdvisorPartnerCommunity.permissionset",
        "/permissionsets/FinServ__CustomerCommunityReadOnly.permissionset",
        "/permissionsets/FinServ__FinancialServicesCloudBasic.permissionset",
        "/permissionsets/FinServ__FinancialServicesCloudStandard.permissionset",
        "/permissionsets/FinServ__FSCWaveIntegration.permissionset",
        "/permissionsets/FinServ__InsuranceAccess.permissionset",
        "/permissionsets/FinServ__LendingAssistant.permissionset",
        "/permissionsets/FinServ__PersonalBanker.permissionset",
        "/permissionsets/FinServ__RelationshipManager.permissionset",
        "/permissionsets/FinServ__Teller.permissionset",
        "/permissionsets/pi__Pardot.permissionset",
        "/permissionsets/pi__Pardot_Connector_User.permissionset",
        "/permissionsets/pi__Pardot_Integration_User.permissionset",
        "/permissionsets/pi__Sales_Edge.permissionset",
        //static resources from managed packages ignore can't be migrated
        "/staticresources/FinServ__industryresources.resource-meta.xml",
        "/staticresources/FinServ__industryresources.resource",
        "/staticresources/FinServ__wealthresources.resource-meta.xml",
        "/staticresources/FinServ__wealthresources.resource",
        "/staticresources/pi__EngageAlertsDownload.resource-meta.xml",
        "/staticresources/pi__EngageAlertsDownload.resource",
        "/staticresources/pi__EngageSalesTools.resource-meta.xml",
        "/staticresources/pi__EngageSalesTools.resource",
        "/staticresources/pi__EngagementHistory.resource-meta.xml",
        "/staticresources/pi__EngagementHistory.resource",
        "/staticresources/pi__Error.resource-meta.xml",
        "/staticresources/pi__Error.resource",
        "/staticresources/pi__LeadDeck.resource-meta.xml",
        "/staticresources/pi__LeadDeck.resource",
        "/staticresources/pi__LegacyPardot.resource-meta.xml",
        "/staticresources/pi__LegacyPardot.resource",
        "/staticresources/pi__MarketingActions.resource-meta.xml",
        "/staticresources/pi__MarketingActions.resource",
        "/staticresources/pi__MicroCampaign.resource-meta.xml",
        "/staticresources/pi__MicroCampaign.resource",
        "/staticresources/pi__Mobile_Design_Templates.resource-meta.xml",
        "/staticresources/pi__Mobile_Design_Templates.resource",
        "/staticresources/pi__Outlook.resource-meta.xml",
        "/staticresources/pi__Outlook.resource",
        "/staticresources/pi__PardotLightningDesignSystem_unversioned.resource-meta.xml",
        "/staticresources/pi__PardotLightningDesignSystem_unversioned.resource",
        "/staticresources/pi__Promise.resource-meta.xml",
        "/staticresources/pi__Promise.resource",
        "/staticresources/pi__ProximaNovaSoft.resource-meta.xml",
        "/staticresources/pi__ProximaNovaSoft.resource",
        "/staticresources/pi__SalesEdgeErrPage.resource-meta.xml",
        "/staticresources/pi__SalesEdgeErrPage.resource",
        "/staticresources/pi__ckeditorSalesReach.resource-meta.xml",
        "/staticresources/pi__ckeditorSalesReach.resource",
        "/staticresources/pi__font_awesome_4_2_0.resource-meta.xml",
        "/staticresources/pi__font_awesome_4_2_0.resource",
        "/staticresources/pi__icon_utility.resource-meta.xml",
        "/staticresources/pi__icon_utility.resource",
        "/staticresources/pi__jquery_time_ago.resource-meta.xml",
        "/staticresources/pi__jquery_time_ago.resource",
        "/staticresources/pi__jquery_ui_1_11_1_custom_has_dialog.resource-meta.xml",
        "/staticresources/pi__jquery_ui_1_11_1_custom_has_dialog.resource",
        "/staticresources/pi__jquery_ui_1_12_1.resource-meta.xml",
        "/staticresources/pi__jquery_ui_1_12_1.resource",
        //test community should not be transported
        "/sites/testcommunity.site",
        "/siteDotComSites/testcommunity1.site",
        "/siteDotComSites/testcommunity1.site-meta.xml",
        "/moderation/testcommunity.Banned.keywords",
        "/moderation/testcommunity.Block_banned_keywords.rule",
        "/moderation/testcommunity.Flag_banned.rule",
        "/moderation/testcommunity.Freeze_for_frequent_posting.rule",
        "/moderation/testcommunity.Replace_banned.rule",
        "/moderation/testcommunity.Review_the_first_post.rule",
        "/managedTopics/testcommunity.managedTopics",
        "/networks/testcommunity.network",
        "/networkBranding/cbtestcommunity.networkBranding",
        "/networkBranding/cbtestcommunity.networkBranding-meta.xml",
        "/profiles/testcommunity Profile.profile",
        "/userCriteria/testcommunity.Customer_Members.userCriteria",
        "/userCriteria/testcommunity.Members_without_contribution.userCriteria",
        "/userCriteria/testcommunity.Partner_and_Customer_members.userCriteria"
        /* 
        // default pathAssistant has domain hard coded and can't migrate this thing
        "/pathAssistants/Default_Opportunity.pathAssistant-meta.xml", 
        "/dashboards/AdviserPerformanceDashboard/Best_Practices_Dashboard611.dashboard"
        "/objects/Account/fields/FinServ__ReferredByUser__c.field-meta.xml",
        "/objects/Lead/fields/FinServ__ReferredByUser__c.field-meta.xml",
        "/objects/Opportunity/fields/FinServ__ReferredByUser__c.field-meta.xml" 
        */
    ];

    constructor(
        protected org: Org,
        protected ux: UX,
        protected sourceOrgAlias: string, // left
        protected targetOrgAlias: string, // right
        protected apiVersion: string,
        protected ignoreComments: boolean) {
        // noop
    }// end constructor

    protected config: IConfig;
    protected settings: ISettings;

    // because diff is left sfdx destructive return left to original state
    protected checkLocalBackupAndRestore(): void {
        this.ux.log('checking for local backup [' + this.sourceRetrieveDirBackup + '] ...');
        if (!existsSync(this.sourceRetrieveDirBackup)) { // first time
            mkdirSync(this.sourceRetrieveDirBackup);
            copySync(this.sourceRetrieveDir, this.sourceRetrieveDirBackup);
            this.ux.log('Initial backup [' + this.sourceRetrieveDirBackup + '] created.');
        }// end if
        else {
            this.ux.log('restoring [' + this.sourceRetrieveDir + '] from local backup ' + this.sourceRetrieveDirBackup);
            removeSync(this.sourceRetrieveDir);
            mkdirSync(this.sourceRetrieveDir);
            copySync(this.sourceRetrieveDirBackup, this.sourceRetrieveDir);
            this.ux.log('backup [' + this.sourceRetrieveDir + '] restored.');
        }// end else
    }// end method

    protected setupFolders(): void {

        if (!existsSync(MdapiCommon.stageRoot)) {
            throw "stageRoot folder provided doesn't exist - cannot compare (retrieved) contents";
        }// end if

        // e.g. stage/DevOrg
        this.sourceBaseDir = (MdapiCommon.stageRoot + MdapiCommon.PATH_SEP + this.sourceOrgAlias);
        // e.g. stage/ReleaseOrg
        this.targetBaseDir = (MdapiCommon.stageRoot + MdapiCommon.PATH_SEP + this.targetOrgAlias);
        // e.g. stage/DevOrg/retrieve/src
        this.sourceRetrieveDir = (this.sourceBaseDir + MdapiCommon.PATH_SEP + MdapiCommon.retrieveRoot + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);
        // e.g. stage/DevOrg/retrieve/src.backup
        this.sourceRetrieveDirBackup = (this.sourceRetrieveDir + MdapiCommon.backupExt);
        // e.g. stage/ReleaseOrg/retrieve/src
        this.targetRetrieveDir = (this.targetBaseDir + MdapiCommon.PATH_SEP + MdapiCommon.retrieveRoot + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);
        // e.g. stage/DevOrg/deploy
        this.sourceDeployDir = (this.sourceBaseDir + MdapiCommon.PATH_SEP + MdapiCommon.deployRoot);
        // e.g. stage/DevOrg/deploy/ReleaseOrg
        this.sourceDeployDirTarget = (this.sourceDeployDir + MdapiCommon.PATH_SEP + this.targetOrgAlias);
        // e.g. stage/DevOrg/deploy/ReleaseOrg/src
        this.sourceDeployDirTargetSource = (this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);

        // check deploy exists else create
        if (!existsSync(this.sourceDeployDir)) {
            mkdirSync(this.sourceDeployDir);
        }// end if

        // delete old staging deploy folder
        if (existsSync(this.sourceDeployDirTarget)) {
            removeSync(this.sourceDeployDirTarget);
            this.ux.log('source deploy target directory: [' + this.sourceDeployDirTarget + '] cleaned.');
        }// end if

        // create staging deploy folder
        mkdirSync(this.sourceDeployDirTarget);
        this.ux.log(this.sourceDeployDirTarget + ' directory created.');

        this.emptyPackageXml = (this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);
        this.filePackageXml = (this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.packageManifest);
        this.fileDestructiveChangesXml = (this.sourceDeployDirTarget + MdapiCommon.PATH_SEP + MdapiConfig.destructiveChangesXml);
        this.deploymentFilePackageXml = (this.sourceDeployDirTargetSource + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);

    }// end method

    protected isDestructiveException(metaType: string, element: string) {

        let exception = false;

        if (this.destructiveExceptions[metaType]) {

            let excludeElements: Array<string> = this.destructiveExceptions[metaType];

            if (this.destructiveExceptions[0] === "*") { // all
                exception = true;
            } else {
                for (var x: number = 0; x < excludeElements.length; x++) {
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
            (this.destructiveExceptions[metaType][0] === "*")) {
            return true;
        }// end if
        return false;
    }// end method

    protected initDiffRecords(DiffRecords: Object): void {

        this.config.metadataTypes.forEach(metaTypeKey => {
            DiffRecords[metaTypeKey] = [];
        });// end for

    }// end method

    protected setupDiffRecords(): void {

        this.ux.log('-----------------------------');
        this.ux.log('SETUP DIFF RESULTS');
        this.ux.log('-----------------------------');

        //package
        this.initDiffRecords(this.packageDiffRecords);
        this.initDiffRecords(this.packageMatchResults);
        //this.initDiffRecords(this.packageCombinedResults);

        //destructive
        this.initDiffRecords(this.destructiveDiffRecords);
        this.initDiffRecords(this.destructiveIgnoreResults);
        this.initDiffRecords(this.destructiveMatchResults);

    }// end method

    protected inspectFile(instance: MdapiChangesetUtility, filePath: string, metaRegister: Object, parentDirectory: string): void {

        let directory: string = MdapiCommon.isolateLeafNode(parentDirectory); //objects
        let fileName: string = MdapiCommon.isolateLeafNode(filePath); // Account.meta-object.xml
        let memberName: string = MdapiConfig.isolateMetadataObjectName(fileName); //Account
        let anchorName: string = MdapiCommon.BLANK; // ''

        // don't process top level directories (from excluded list)
        if (MdapiConfig.isExcludedDirectory(directory) || MdapiConfig.isExcludedFile(fileName)) {
            instance.ux.log("ignoring: " + filePath);
            return;
        }// end if

        let metadataObject: MetadataObject = MdapiConfig.getMetadataObjectFromDirectoryName(instance.config, directory, fileName);
        // if (metadataObject && metadataObject.inFolder) { fileName = instance.removeFolderExtension(fileName); }

        // check for unresolve type
        if (!metadataObject) { // if null attempt to resolve

            let metadataParentName = MdapiConfig.getMetadataNameFromParentDirectory(parentDirectory);

            // special handle for object name folder (handle for fields etc.)
            if (MdapiConfig.isBundleDirectory(metadataParentName)) {
                metadataObject = MdapiConfig.getMetadataObjectFromDirectoryName(instance.config, metadataParentName);
                memberName = MdapiConfig.getMetadataNameFromCurrentDirectory(parentDirectory);
            }// end else if
            // special handle for folder types
            else if (MdapiConfig.isFolderDirectory(metadataParentName)) {
                metadataObject = MdapiConfig.getMetadataObjectFromDirectoryName(instance.config, metadataParentName);
                anchorName = MdapiConfig.getMetadataNameFromCurrentDirectory(parentDirectory);
                memberName = (anchorName + MdapiCommon.PATH_SEP + MdapiConfig.isolateMetadataObjectName(fileName));
            } // end else if
            else {
                instance.ux.error('Unexpected MetaType found at parent directory: ' + parentDirectory
                    + ' Please check metaobject definitions are up to date. Unresolved file path: ' + filePath);
                throw parentDirectory; // terminate 
            }// end else
        }// end if

        // without extension for comparison later may not be unique (e.g. a pair)
        let memberKey: string = (directory + MdapiCommon.PATH_SEP + memberName);
        let relativeFilePath: string = (directory + MdapiCommon.PATH_SEP + fileName);

        // saftey check
        if ((!fileName) || (!directory) || (!metadataObject)
        ) {
            instance.ux.error('Unexpected unresolved metaobject - key: ', memberKey +
                ' (fileName: ' + fileName + ') directory: (' + directory + '), ' +
                ' parentDirectory: ' + parentDirectory + ', metadataObject: ' + metadataObject);

            throw 'unresolved metadataObject';
        }// end if

        const fileContents: string = readFileSync(filePath, MdapiCommon.UTF8);
        const stats: Stats = statSync(filePath);

        let DiffRecord: DiffRecord = (<DiffRecord>{
            "memberKey": memberKey,
            "memberName": memberName, // e.g. Account
            "filePath": filePath,
            "fileHash": MdapiCommon.hashCode(fileContents), // only hash as contents is large
            "directory": directory, // sfdx directory e.g. triggers
            "metadataName": metadataObject.xmlName,
            "metadataObject": metadataObject,
            "fileSize": stats.size,
            "diffType": DiffType.None,
            "diffSize": 0 // init
        });

        // add unique entry
        metaRegister[relativeFilePath] = DiffRecord;

    }// end method

    // recursive walk directory function
    protected walkDir(dir: string, metaRegister: Object, callback: any): void {

        let fileItems: Array<string> = readdirSync(dir);

        for (var x: number = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x];
            let dirPath: string = path.join(dir, fileItem);
            let isDirectory: boolean = statSync(dirPath).isDirectory();

            if (isDirectory) {
                this.walkDir(dirPath, metaRegister, callback);
            }// end if
            else {
                callback(this, path.join(dir, fileItem), metaRegister, dir);
            }// end else

        }// end for

    }// end method

    protected walkDirectories(): void {

        this.ux.log('-----------------------------');
        this.ux.log('WALK SOURCE FOR COMPARE ');
        this.ux.log('-----------------------------');

        this.walkDir(this.sourceRetrieveDir, this.leftFilePathDiffRecordRegister, this.inspectFile);

        this.ux.log('-----------------------------');
        this.ux.log('WALK TARGET FOR COMPARE ');
        this.ux.log('-----------------------------');

        this.walkDir(this.targetRetrieveDir, this.rightFilePathDiffRecordRegister, this.inspectFile);

    }// end method

    protected objectToArray(objectOrArray: any): Array<Object> {
        let returned: Array<Object> = [];
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

    // children only present on one side so no compare needed but do list
    protected processEdgeChildren(item: DiffRecord): void {

        let childMetaObject: Object = MdapiCommon.xmlFileToJson(item.filePath);

        let childXmlNames: Array<string> = item.metadataObject.childXmlNames;

        for (var x: number = 0; x < childXmlNames.length; x++) {

            let childMetaName: string = childXmlNames[x];
            if (MdapiConfig.isUnsupportedMetaType(childMetaName)) { continue; }

            let childMetaDirectories: Array<MetadataObject> = this.config.metadataDirectoryLookup[childMetaName];
            if (childMetaDirectories.length !== 1) {
                this.ux.warn('unexpected childMetaDirectory length (' + childMetaDirectories.length + ') was expecting 1: ' + childMetaName);
                throw "unexpected childMetaDirectory length";
            }// end if
            let childMetadataObject: MetadataObject = childMetaDirectories[0];
            let childDirectoryName: string = MdapiConfig.childMetadataDirectoryLookup[childMetaName];

            let parentContents: Object = childMetaObject[item.metadataName];

            let children: Array<Object> = this.objectToArray(parentContents[childDirectoryName]);

            for (var y: number = 0; y < children.length; y++) {

                let child: Object = children[y];
                let fullName: string = child[MdapiConfig.fullName]._text;

            }// end for


            // BCBCBC

            /* let DiffRecord: DiffRecord = (<DiffRecord>{
                "memberKey": memberKey,
                "memberName": memberName, // e.g. Account
                "filePath": filePath,
                "fileHash": MdapiCommon.hashCode(fileContents), // only hash as contents is large
                "directory": directory, // sfdx directory e.g. triggers
                "metadataName": metadataObject.xmlName,
                "metadataObject": metadataObject,
                "fileSize": stats.size,
                "diffType": DiffType.None,
                "diffSize": 0 // init
            }); */


        }// end for

    }// end method

    /* protected compareChildMetadata(leftItem?: DiffRecord, rightItem?: DiffRecord): void {

        let leftObject: Object = MdapiCommon.xmlFileToJson(leftItem.filePath);
        let rightObject: Object = MdapiCommon.xmlFileToJson(rightItem.filePath);

        for (var metaIndex: number = 0; metaIndex < this.objectChildMetaDirectories.length; metaIndex++) {

            let childMetaDirectory: string = this.objectChildMetaDirectories[metaIndex];

            let leftContents: Object = leftObject[this.CustomObject];
            let rightContents: Object = rightObject[this.CustomObject];

            let leftChildren: Array<Object> = this.objectToArray(leftContents[childMetaDirectory]);
            let rightChildren: Array<Object> = this.objectToArray(rightContents[childMetaDirectory]);

            // ---------------------
            // compare left to right
            // ---------------------
            for (var left: number = 0; left < leftChildren.length; left++) {

                let leftChild: Object = leftChildren[left];
                let leftFullName: string = leftChild[this.fullName]._text;

                let leftCheckSum: number = 0;
                let leftSize: number = 0;
                let leftString: string = null;

                let rightCheckSum: number = 0;
                let rightSize: number = 0;
                let rightString: string = null;

                let rightPosition: number = 0;
                let found: boolean = false;

                for (var right: number = 0; right < rightChildren.length; right++) {

                    let rightChild: Object = rightChildren[right];

                    let rightFullName: string = rightChild[this.fullName]._text;

                    if (leftFullName === rightFullName) {
                        rightString = JSON.stringify(rightChild);
                        rightCheckSum = this.hashCode(rightString);
                        rightSize = rightString.length;
                        rightPosition = right;
                        found = true;
                        break;
                    }// end if

                }// end for right

                let typeFileName: string = (leftItem.metaName + "." + leftFullName); // convention in package.xml
                let registerKey: string = (childMetaDirectory + "/" + leftItem.metaName + "/" + typeFileName); // with extension so unique
                leftString = JSON.stringify(leftChild);
                leftCheckSum = this.hashCode(leftString);
                leftSize = leftString.length;

                let DiffRecord: DiffRecord = {
                    "registerKey": registerKey,
                    "checkKey": registerKey,
                    "keyAnchor": leftItem.metaName,
                    "filePath": (leftItem.filePath + '\\' + childMetaDirectory + '\\' + leftFullName), // dummy file name
                    "parentDirectory": this.objects,
                    "fileContents": leftCheckSum, // only hash as contents is large
                    "directory": childMetaDirectory, // directory e.g. objects
                    "isFolderDefinition": false,
                    "metaTypeDefinition": null, // todo
                    "metaType": this.childMetaTypesLookup[childMetaDirectory], // e.g. ApexTrigger
                    "metaName": typeFileName, // e.g. Account.Name
                    "diffType": this.DiffTypeUnprocessed,
                    "lastModified": leftItem.lastModified,
                    "fileSize": leftSize,
                    "diffSize": (leftSize - rightSize) // init
                };

                if (DiffRecord.metaType === undefined) {
                    throw "unexpected scenario child metaType is undefined";
                }// end if

                if (((leftCheckSum === rightCheckSum) && (rightString !== leftString)) ||
                    ((leftCheckSum !== rightCheckSum) && (rightString === leftString))) {
                    throw "unexpected scenario checksum failure";
                }// end if

                if (found && (leftCheckSum === rightCheckSum)) {
                    DiffRecord.diffType = this.DiffTypeMatch;
                    // no difference so don't migrate delete on both sides (right only in-memory delete)
                    leftChildren.splice(left, 1);
                    rightChildren.splice(rightPosition, 1);
                    this.packageMatchResults[DiffRecord.metaType].push(DiffRecord);
                }// end if
                else if (found && (leftCheckSum !== rightCheckSum)) {
                    DiffRecord.diffType = this.DiffTypeDiff;
                    this.packageDiffRecords[DiffRecord.metaType].push(DiffRecord);
                } // end else
                else if (!found) {// new entry on left                    
                    DiffRecord.diffType = this.DiffTypeLeft;
                    this.packageDiffRecords[DiffRecord.metaType].push(DiffRecord);
                }// end if
                else {
                    throw "unexpected scenario";
                }// end else

                this.packageCombinedResults[DiffRecord.metaType].push(DiffRecord);

            }// end for left

            // ---------------------
            // compare right to left
            // ---------------------

            for (var right: number = 0; right < rightChildren.length; right++) {

                let found: boolean = false;
                let rightChild: Object = rightChildren[right];
                let rightFullName: string = rightChild[this.fullName]._text;

                let rightCheckSum: number = 0;
                let rightSize: number = 0;
                let rightString: string = null;

                let leftCheckSum: number = 0;
                let leftSize: number = 0;
                let leftString: string = null;

                for (var left: number = 0; left < leftChildren.length; left++) {

                    let leftChild: Object = leftChildren[left];
                    let leftFullName: string = leftChild[this.fullName]._text;

                    if (rightFullName === leftFullName) {
                        leftString = JSON.stringify(leftChild);
                        leftCheckSum = this.hashCode(leftString);
                        leftSize = leftString.length;
                        found = true;
                        break;
                    }// end if

                }// end for right

                let typeFileName: string = (rightItem.metaName + "." + rightFullName); // convention in package.xml
                let registerKey: string = (childMetaDirectory + "/" + rightItem.metaName + "/" + typeFileName); // with extension so unique
                rightString = JSON.stringify(rightChild);
                rightCheckSum = this.hashCode(rightString);

                let DiffRecord: DiffRecord = {
                    "registerKey": registerKey,
                    "checkKey": registerKey,
                    "keyAnchor": rightItem.metaName,
                    "filePath": (rightItem.filePath + '\\' + childMetaDirectory + '\\' + rightFullName), // dummy file name
                    "parentDirectory": this.objects,
                    "fileContents": rightCheckSum, // only hash as content is large
                    "directory": childMetaDirectory, // directory e.g. fields
                    "isFolderDefinition": false,
                    "metaTypeDefinition": null,
                    "metaType": this.childMetaTypesLookup[childMetaDirectory], // e.g. CustomField
                    "metaName": typeFileName, // e.g. Account.Name
                    "diffType": this.DiffTypeUnprocessed,
                    "lastModified": rightItem.lastModified,
                    "fileSize": rightSize,
                    "diffSize": (rightSize - leftSize) // init
                };

                if (DiffRecord.metaType === undefined) {
                    throw "unexpected scenario child metaType is undefined";
                }// end if

                if (((rightCheckSum === leftCheckSum) && (leftString !== rightString)) ||
                    ((rightCheckSum !== leftCheckSum) && (leftString === rightString))) {
                    throw "unexpected scenario checksum failure";
                }// end if

                if (found === false) {
                    DiffRecord.diffType = DiffType.Right;
                    this.destructiveDiffRecords[DiffRecord.metaType].push(DiffRecord);
                }// end if
                else if (rightCheckSum !== leftCheckSum) {
                    DiffRecord.diffType = this.DiffTypeDiff; // already in left diff
                    this.destructiveIgnoreResults[DiffRecord.metaType].push(DiffRecord);
                }// end else if
                else {// same unlikely to still exist
                    DiffRecord.diffType = this.DiffTypeDiff;
                    this.destructiveMatchResults[DiffRecord.metaType].push(DiffRecord);
                }// end else

            }// end for right

        }// end for

        MdapiCommon.jsonToXmlFile(leftObject, leftItem.filePath);

    }// end method

    */

    /*
    // bot version is required for deploy
    protected injectBotVersion(leftItem: DiffRecord, rightItem?: DiffRecord) {

        let leftObject: Object = MdapiCommon.xmlFileToJson(leftItem.filePath);

        let rightObject: Object;

        if (rightItem) {
            rightObject = MdapiCommon.xmlFileToJson(rightItem.filePath);
        }// end if

        let leftChildren: Array<Object> = this.objectToArray(leftObject[MdapiConfig.Bot].botVersions);

        let leftFullName: string = null;
        let leftCheckSum: number = 0;
        let leftSize: number = 0;
        let leftChanged: boolean = false;

        let rightFullName: string = null;
        let rightSize: number = 0;
        let rightChanged: boolean = false;

        for (var left: number = 0; left < leftChildren.length; left++) {

            let leftChild: Object = leftChildren[left];
            let compareName: string = leftChild[MdapiConfig.fullName]._text;

            if (leftFullName === null) {
                leftFullName = compareName; // e.g. v1
                leftChanged = true;
            }// end if
            else if (leftFullName.localeCompare(compareName) < 0) {
                leftFullName = compareName;
                leftChanged = true;
            }// end else if
            // check if change
            if (leftChanged) {
                let leftString = JSON.stringify(leftChild);
                leftCheckSum = MdapiCommon.hashCode(leftString);
                leftSize = leftString.length;
                leftChanged = false; // reset
            }// end if

        }// end for

        if (rightObject) { // if was previous version check right against left for compare info

            let rightChildren: Array<Object> = this.objectToArray(rightObject[MdapiConfig.Bot].botVersions);

            for (var right: number = 0; right < rightChildren.length; right++) {

                let rightChild: Object = rightChildren[right];
                let compareName: string = rightChild[MdapiConfig.fullName]._text;

                if (rightFullName === null) {
                    rightFullName = compareName; // e.g. v1
                    rightChanged = true;
                }// end if
                else if (rightFullName.localeCompare(compareName) < 0) {
                    rightFullName = compareName;
                    rightChanged = true;
                }// end else if

                // check if change
                if (rightChanged) {
                    let rightString: string = JSON.stringify(rightChild);
                    rightSize = rightString.length;
                    rightChanged = false; // reset
                }// end if

                if (rightFullName === leftFullName) {
                    break; // found a match to diff size otherwise biggest (old) one 
                }// end if

            }// end for

        }// end if

        let typeFileName: string = (leftItem.memberName + "." + leftFullName); // convention in package.xml
        let registerKey: string = (MdapiConfig.botVersions + "/" + leftItem.memberName + "/" + typeFileName); // with extension so unique
        let diffType: DiffType = (rightItem) ? DiffType.Change : DiffType.Left;

        let DiffRecord: DiffRecord = {
            "memberKey": registerKey,
            "memberName": typeFileName,
            "filePath": (leftItem.filePath + '\\' + MdapiConfig.botVersions + '\\' + leftFullName), // dummy file name
            "fileHash": leftCheckSum, // only hash as contents is large
            "directory": this.botVersions, // directory e.g. objects
            "metaTypeObject": null, // todo
            "fileStats": stats,
            "stats": stats,
            "fileSize": leftSize,
            "diffSize": (leftSize - rightSize) // init
        };

        export interface DiffRecord {
            memberKey: string;
            memberName: string, // e.g. Account
            filePath: string;
            fileHash: number; // only hash as contents is large
            directory: string; // sfdx directory e.g. triggers
            metaTypeObject: MetadataObject;
            fileStats: Stats;
            diffType: DiffType;
            diffSize: number; // init
        };

        this.packageDiffRecords[DiffRecord.metaTypeObject.xmlName].push(DiffRecord);
        // this.packageCombinedResults[DiffRecord.metaTypeObject.xmlName].push(DiffRecord);

    }// end method
    */

    protected compareSourceAndTarget(): void {

        console.log('-----------------------------');
        console.log('COMPARE SOURCE WITH TARGET ');
        console.log('-----------------------------');

        //compare left to right
        for (var filePath in this.leftFilePathDiffRecordRegister) {

            let leftItem: DiffRecord = this.leftFilePathDiffRecordRegister[filePath];
            let rightItem: DiffRecord = this.rightFilePathDiffRecordRegister[filePath];

            if (!rightItem) {
                leftItem.diffType = DiffType.Left;
                leftItem.diffSize = leftItem.fileSize;
                this.packageDiffRecords[leftItem.metadataName].push(leftItem);
                if (leftItem.metadataObject.childXmlNames &&
                    (leftItem.metadataObject.childXmlNames.length > 0)) {

                }// end if
            }// end if
            else if (leftItem.fileHash !== rightItem.fileHash) {
                leftItem.diffType = DiffType.Diff;
                leftItem.diffSize = (leftItem.fileSize - rightItem.fileSize);
                this.packageDiffRecords[leftItem.metadataName].push(leftItem);
                if (leftItem.metadataObject.childXmlNames &&
                    (leftItem.metadataObject.childXmlNames.length > 0)) {

                }// end if
            }// end if
            else if (leftItem.fileHash === rightItem.fileHash) {
                leftItem.diffType = DiffType.Match;
                leftItem.diffSize = (leftItem.fileSize - rightItem.fileSize); // should be zero
                this.packageMatchResults[leftItem.metadataName].push(leftItem);
            }// end else if

            // this.packageCombinedResults[leftItem.metaType].push(leftItem);

        }// end for

        console.log('-----------------------------');
        console.log('COMPARE TARGET WITH SOURCE ');
        console.log('-----------------------------');
        //compare right to left
        for (var filePathKey in this.rightFilePathDiffRecordRegister) {

            let leftItem: DiffRecord = this.leftFilePathDiffRecordRegister[filePathKey];
            let rightItem: DiffRecord = this.rightFilePathDiffRecordRegister[filePathKey];

            if (!leftItem) {
                rightItem.diffType = DiffType.Right; // 
                rightItem.diffSize = rightItem.fileSize;
                this.destructiveDiffRecords[rightItem.metadataName].push(rightItem);
                if (rightItem.metadataObject.childXmlNames &&
                    (rightItem.metadataObject.childXmlNames.length > 0)) {

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
                this.destructiveMatchResults[rightItem.metadataName].push(rightItem);
                // excluded not need to transport. ignore details inner comparisons already done before
            }// end else if

        }// end for

    }// end method

    // console.log(destructiveDiffRecords);
    protected sortDiffRecordsTypes(DiffRecords: Record<string, Array<DiffRecord>>): Array<string> {

        var metadataObjectNames: Array<string> = [];

        for (var metadataObjectName in DiffRecords) {
            metadataObjectNames.push(metadataObjectName);
        }// end for

        metadataObjectNames.sort();
        return metadataObjectNames;

    }// end method

    protected createPackageFile(packageFile: string, DiffRecords: Record<string, Array<DiffRecord>>, changeType: ChangeType): void {

        var xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xmlContent += '<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';

        let metadataObjectNames: Array<string> = this.sortDiffRecordsTypes(DiffRecords);

        for (var i: number = 0; i < metadataObjectNames.length; i++) {

            let metadataObjectName: string = metadataObjectNames[i];

            if (DiffRecords[metadataObjectName].length === 0) {
                console.log('ignoring metaType: ' + metadataObjectName);
                continue;
            }// end if

            let rawMembers: Array<DiffRecord> = DiffRecords[metadataObjectName];
            let limitedMembers: Array<string> = [];

            // create comments
            let comments: string = "<!-- \n";

            for (var x: number = 0; x < rawMembers.length; x++) {

                let DiffRecord: DiffRecord = rawMembers[x];

                comments += (DiffRecord.diffType + ", " + DiffRecord.directory +
                    MdapiCommon.PATH_SEP + MdapiCommon.isolateLeafNode(DiffRecord.filePath)
                    + ", delta-size " + DiffRecord.diffSize + " (bytes)" + ", file-size "
                    + DiffRecord.fileSize + " (bytes), file-hash [" + DiffRecord.fileHash
                    + "]. \n");

                limitedMembers.push(DiffRecord.memberName);

                /* if (isDestructive && diff.isFolderDefinition) {
                    let excludeFolderMessage = 'NOTE: Excluding folder type from destructiveChanges ['
                        + diff.memberName + '], review and delete manually in target org.';

                    console.log(excludeFolderMessage);
                    comments += (excludeFolderMessage + '\n');
                }// end if
                else {
                   
                }// end else */

            }//end for

            comments += " -->";

            // ensure only unique entries
            var members = [...new Set(limitedMembers)];

            members.sort();

            if (members.length > 0) {

                let isGlobalException = ((changeType === ChangeType.DestructiveChanges) &&
                    this.isGlobalDestructiveException(metadataObjectName));

                if (isGlobalException) { // comment out type which throws error when deploying.
                    xmlContent += "<!-- \n";
                    let exceptionMessage = 'NOTE: Excluding meta type from destructiveChanges ['
                        + metadataObjectName + '], review and delete manually in target org.';
                    console.log(exceptionMessage);
                    xmlContent += (exceptionMessage + '\n');
                }// end if

                xmlContent += MdapiCommon.TWO_SPACE + '<types>\n';
                xmlContent += MdapiCommon.FOUR_SPACE + '<name>' + metadataObjectName + '</name>\n';

                for (var y = 0; y < members.length; y++) {
                    let member = members[y];
                    if (!(member)) {
                        this.ux.error(metadataObjectName + " member unexpected blank")
                        throw "unexpected blank member";
                    } // no blanks
                    else if (MdapiConfig.isExcludedFile(member)) { continue; } // e.g. lwc tech files.
                    else if (((changeType === ChangeType.DestructiveChanges) &&
                        this.isDestructiveException(metadataObjectName, member))) {
                        xmlContent += '<!-- EXCLUDED    <members>' + member + '</members> -->\n';
                    }
                    else { xmlContent += MdapiCommon.FOUR_SPACE + '<members>' + member + '</members>\n'; }
                }// end for

                xmlContent += MdapiCommon.TWO_SPACE + '</types>\n';

                if (isGlobalException) {
                    xmlContent += " -->";
                }// end if

            }// end if

            if (!this.ignoreComments) { xmlContent += comments + '\n'; }

        }// end for

        xmlContent += MdapiCommon.TWO_SPACE + '<version>' + this.apiVersion + '</version>\n';
        xmlContent += '</Package>\n';

        if (!existsSync(this.sourceDeployDirTarget)) {
            mkdirSync(this.sourceDeployDirTarget);
            console.info(this.sourceDeployDirTarget + ' directory created.');
        }// end if

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

        this.createPackageFile(
            this.filePackageXml,
            this.packageDiffRecords,
            ChangeType.Package);

        console.log('-----------------------------');
        console.log('CREATE DESTRUCTIVECHANGES.XML');
        console.log('-----------------------------');

        this.createPackageFile(
            this.fileDestructiveChangesXml,
            this.destructiveDiffRecords,
            ChangeType.DestructiveChanges);

        console.log('-----------------------------');
        console.log('DIFF PROCESS COMPLETED  ');
        console.log('-----------------------------');

        this.createEmptyPackageFile();

    }// end method

    protected preparePackageDirectory(): void {

        console.log('-----------------------------');
        console.log('DELETING SOURCE FILE MATCHES ');
        console.log('-----------------------------');

        // only want to transport what is necessary
        for (var metaType in this.packageMatchResults) {

            var matchResults: Array<DiffRecord> = this.packageMatchResults[metaType];

            for (var x: number = 0; x < matchResults.length; x++) {

                let matchResult = matchResults[x];
                let found: boolean = false;
                // before deleting make sure not part of diff results (e.g. nested bundle).
                let diffRecords: Array<DiffRecord> = this.packageDiffRecords[metaType];

                // check if diff entry exists
                for (var y: number = 0; y < diffRecords.length; y++) {

                    let diffRecord = diffRecords[y];

                    if (matchResult.memberKey === diffRecord.memberKey) { // the path and meta name is key
                        found = true;
                        break;
                    }// end if

                }// end for

                if (!found) {
                    // delete left file if no diff found
                    try {
                        let filePath = matchResult.filePath;
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

        for (var x: number = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x];
            let dirPath: string = path.join(dir, fileItem);
            let isDirectory: boolean = statSync(dirPath).isDirectory();

            if (isDirectory) {
                this.postWalkDir(dirPath, callback);
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

                var jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);

                var listViews = instance.objectToArray(jsonObject[MdapiConfig.CustomObject].listViews);

                for (var x: number = 0; x < listViews.length; x++) {
                    let listView = listViews[x];
                    let columns: Array<Object> = instance.objectToArray(listView["columns"]);
                    for (var y: number = 0; y < columns.length; y++) {
                        let column = columns[y];
                        if (column["_text"] === 'LEAD_SCORE') {
                            columns.splice(y, 1); // pop
                            break;
                        }// end if
                    }// end if
                }// end for

                MdapiCommon.jsonToXmlFile(jsonObject, filePath);

            }// end if
            else if (filePath.endsWith('Task.object')) {

                var jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);

                var listViews = instance.objectToArray(jsonObject[MdapiConfig.CustomObject].listViews);

                // FIXME should actually be looking for duplicates and removing. on all list views....
                for (var x: number = 0; x < listViews.length; x++) {
                    let count: number = 0;
                    let listView = listViews[x];
                    let listViewLabel: string = listView["fullName"]._text;
                    for (var y: number = 0; y < listViews.length; y++) {
                        let listViewCompare = listViews[y];
                        let listViewCompareLabel: string = listViewCompare["fullName"]._text;
                        if (listViewLabel === listViewCompareLabel) {
                            count++;
                            if (count > 1) {
                                listViews.splice(y, 1); // remove duplicates
                            }// end if
                        }// end if
                    }// end if 
                }// end if 

                // too long ENCODED:{!FilterNames.Task_DelegatedTasks}
                for (var x: number = 0; x < listViews.length; x++) {
                    let listView = listViews[x];
                    // Value too long for field: Name maximum length is:40
                    if (listView["fullName"]._text === 'UnscheduledTasks' &&
                        listView["label"]._text === 'ENCODED:{!FilterNames.Task_UnscheduledTasks}') {
                        listView["label"]._text = 'Unscheduled Tasks';
                    }// end if
                    else if (listView["fullName"]._text === 'CompletedTasks' &&
                        listView["label"]._text === 'ENCODED:{!FilterNames.Task_CompletedTasks}') {
                        listView["label"]._text = 'Completed Tasks';
                    }// end if
                    else if (listView["fullName"]._text === 'DelegatedTasks' &&
                        listView["label"]._text === 'ENCODED:{!FilterNames.Task_DelegatedTasks}') {
                        listView["label"]._text = 'Delegated Tasks';
                    }// end if
                }// end for

                MdapiCommon.jsonToXmlFile(jsonObject, filePath);

            }// end if

        }// end else if
        // check profile issues
        else if (typeFolder === MdapiConfig.profiles) {

            var jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);

            //  set standard profile user permssions to blank as should not be able to change.
            if (jsonObject[MdapiConfig.Profile].custom._text === 'false') {
                jsonObject[MdapiConfig.Profile].userPermissions = [];
            }// end if

            var userPermissions = instance.objectToArray(jsonObject[MdapiConfig.Profile].userPermissions);

            for (var x: number = 0; x < userPermissions.length; x++) {
                let userPerm = userPermissions[x];
                if (userPerm["name"]._text === 'ManageSandboxes') {
                    userPermissions.splice(x, 1); // pop
                    break;
                }// end if
            }// end for

            // this causes errors
            var tabVisibilities = instance.objectToArray(jsonObject[MdapiConfig.Profile].tabVisibilities);

            for (var x: number = 0; x < tabVisibilities.length; x++) {
                let tabVisibility = tabVisibilities[x];
                // You can't edit tab settings for SocialPersona, as it's not a valid tab.
                if (tabVisibility["tab"]._text === 'standard-SocialPersona') {
                    tabVisibilities.splice(x, 1); // pop
                    break;
                }// end if
            }// end for

            var fieldPermissions = instance.objectToArray(jsonObject[MdapiConfig.Profile].fieldPermissions);

            // field service field being injected in to PersonLifeEvent object (remove)
            for (var x: number = 0; x < fieldPermissions.length; x++) {
                let fieldPermission = fieldPermissions[x];
                if (fieldPermission["field"]._text === 'PersonLifeEvent.LocationId') {
                    fieldPermissions.splice(x, 1); // pop
                    break;
                }// end if
            }// end for

            MdapiCommon.jsonToXmlFile(jsonObject, filePath);

        }// end if (profile)
        // check dashboard run as issues
        else if (grandParentFolder === MdapiConfig.dashboards) {

            console.log('dashboard screening ' + grandParentFolder + ' ' + typeFolder);

            var jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);

            var dashboard = jsonObject["Dashboard"];

            if (!(dashboard.runningUser === undefined)) {
                delete dashboard.runningUser;
            }// end if

            MdapiCommon.jsonToXmlFile(jsonObject, filePath);

        }// end if (dashboards)
        else if (typeFolder === 'settings') {

            if (filePath.endsWith('OrgPreference.settings')) {

                var jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);

                var preferences = instance.objectToArray(jsonObject["OrgPreferenceSettings"].preferences);

                for (var x: number = 0; x < preferences.length; x++) {
                    let preference = preferences[x];
                    ////You do not have sufficient rights to access the organization setting: CompileOnDeploy
                    if (preference["settingName"]._text === 'CompileOnDeploy') {
                        preferences.splice(x, 1);
                    }// end if
                }// end for

                MdapiCommon.jsonToXmlFile(jsonObject, filePath);

            }// end if

        }// end if

    }// end method

    protected postScreenDeploymentFiles(): void {

        this.postWalkDir(this.sourceDeployDirTargetSource, this.postInspectFile);

        this.ux.log('-----------------------------');
        this.ux.log('POST SCREENING COMPLETE  ');
        this.ux.log('-----------------------------');

    }// end process

    protected deleteExcludedDirectories(): void {

        this.ux.log('-----------------------------');
        this.ux.log('DELETE EXCLUDED DIRECTORIES');
        this.ux.log('-----------------------------');

        this.directoryRemoveList.forEach(folder => {

            let leftDir = (this.sourceRetrieveDir + folder);
            this.ux.log('Deleting ' + leftDir + ' (if exists) ...');

            if (existsSync(leftDir)) {
                removeSync(leftDir);
                this.ux.log(leftDir + ' deleted.');
            }// end if

            let rightDir = (this.targetRetrieveDir + folder);
            this.ux.log('Deleting ' + rightDir + ' (if exists) ...');
            if (existsSync(rightDir)) {
                removeSync(rightDir);
                this.ux.log(rightDir + ' deleted.');
            }// end if
        });
    }// end method

    protected deleteExcludedFiles() {

        this.ux.log('-----------------------------');
        this.ux.log('DELETE EXCLUDED FILES');
        this.ux.log('-----------------------------');

        this.fileRemoveList.forEach(filePath => {

            let leftFile = (this.sourceRetrieveDir + filePath);
            this.ux.log('Deleting ' + leftFile + ' (if exists) ...');

            if (existsSync(leftFile)) {
                unlinkSync(leftFile);
                this.ux.log(leftFile + ' deleted.');
            }// end if

            let rightFile = (this.targetRetrieveDir + filePath);
            this.ux.log('Deleting ' + rightFile + ' (if exists) ...');
            if (existsSync(rightFile)) {
                unlinkSync(rightFile);
                this.ux.log(rightFile + ' deleted.');
            }// end if
        });
    }// end method

    protected init(): void {
        this.config = MdapiConfig.createConfig();
        this.settings = MdapiConfig.createSettings();
        this.settings.apiVersion = this.apiVersion;
    }// end method

    public async process(): Promise<void> {

        this.init();

        this.setupFolders(); // ok

        this.checkLocalBackupAndRestore(); // ok

        // async calls
        this.ux.startSpinner('describemetadata');
        await MdapiConfig.describeMetadata(this.org, this.config, this.settings); // ok
        this.ux.stopSpinner();

        this.deleteExcludedDirectories(); // ok

        this.deleteExcludedFiles(); // ok

        this.setupDiffRecords(); // ok

        this.walkDirectories(); // ok

        this.compareSourceAndTarget();

        this.preparePackageDirectory();

        this.createPackageXmls();

        this.copyDeploymentFiles();

        this.postScreenDeploymentFiles();

    }// end process

}// end class
