/**
 * @name MdapiConfig
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

import { DescribeMetadataResult, MetadataObject, FileProperties, QueryResult, ListMetadataQuery } from "jsforce";
import { writeFileSync, mkdirp, createWriteStream, readFileSync, statSync, Stats, existsSync, unlinkSync, mkdirSync } from "fs-extra";
import { Org } from "@salesforce/core";
import { MdapiCommon } from "./mdapi-common";
import path = require('path');
import yauzl = require('yauzl');

export interface IConfig {
  metadataTypes: Array<string>; // e.g. ['ApexClass', 'CustomObjet'] // from describeMetada also acts a key index for metadataObjectLookup and metadataObjectMembersLookup
  metadataFolders: Array<string>;  // e.g. ['ReportFolder', 'DocumentFolder'] // don't exist so inject
  metadataTypeChildren: Array<string>; // e.g. ['CustomField']; // exist only within childXmlNames
  metadataObjectLookup: Record<string, MetadataObject>; // e.g. {'ApexClass, Array<MetadataObject>} quick lookup to object based on meta type name
  metadataObjectMembersLookup: Record<string, Array<FileProperties>>; // e.g. {'ApexClass', Array<FileProperties>} where files are members 
  metadataDirectoryLookup: Record<string, Array<MetadataObject>>; // e.g. {'objects', Array<MetaObject>} // one directory can have multiple types.
  metadataObjects: Array<MetadataObject>; // e.g. directly from describemetadata.metadataObjects
};

export interface ISettings {
  ignoreHiddenOrNonEditable?: boolean;
  ignoreInstalled?: boolean;
  ignoreNamespaces?: boolean;
  ignoreStaticResources?: boolean;
  ignoreFolders?: boolean;
  apiVersion: string;
};

export enum RelativePosition {
  Source = 'Source',
  Target = 'Target'
};

export enum ChangeType {
  Package = 'Package',
  DestructiveChanges = 'DestructiveChanges'
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
  folderXml: boolean;
  metadataName: string;
  metadataObject: MetadataObject;
  fileSize: number;
  lastModified: Date;
  diffType: DiffType;
  diffSize: number; // init
};

export interface ChangesetExclude {
  directoryExcludes: Array<string>;
  fileExcludes: Array<string>;
};

export interface Profile {
  layoutAssignments?: LayoutAssignment | Array<LayoutAssignment>;
  userPermissions?: UserPermission | Array<UserPermission>;
  tabVisibilities?: TabVisibility | Array<TabVisibility>;
  fieldPermissions?: FieldPermission | Array<FieldPermission>;
  custom: Textable;
};

export interface FieldPermission {
  field: Textable;
};

export interface TabVisibility {
  tab: Textable;
};

export interface UserPermission {
  name: Textable;
};

export interface LayoutAssignment {
  layout: Textable;
  recordType?: Textable;
};

export interface CustomObject {
  listViews: ListView | Array<ListView>;
};

export interface CustomObjectChild {
  fullName: Textable;
};

export interface ListView {
  fullName: Textable;
  columns: Textable | Array<Textable>;
  label: Textable;
};

export interface Dashboard {
  runningUser: Textable;
};

export interface OrgPreferenceSettings {
  preferences: Preference | Array<Preference>;
};

export interface Preference {
  settingName: Textable;
  settingValue: Textable;
};

export interface Textable {
  _text: string;
};

export class MdapiConfig {

  public static forceapp: string = 'force-app';
  public static unpackagedFolder: string = 'unpackaged';
  public static srcFolder: string = 'src';
  public static manifestFolder: string = 'manifest';
  public static unpackagedZip: string = 'unpackaged.zip';
  public static packageXml: string = 'package.xml';
  public static packageManifest: string = 'package.manifest';
  public static describeMetadataJson: string = 'describeMetadata.json';
  public static destructiveChangesManifest: string = 'destructiveChanges.manifest';
  public static destructiveChangesXml: string = 'destructiveChanges.xml';
  public static destructiveChangesPostXml: string = 'destructiveChangesPost.xml';
  public static destructiveChangesPreXml: string = 'destructiveChangesPre.xml';

  public static StaticResource: string = 'StaticResource';
  public static PermissionSet: string = 'PermissionSet';
  public static FlexiPage: string = 'FlexiPage';
  public static StandardValueSet: string = 'StandardValueSet';
  public static Settings: string = 'Settings';
  public static RecordType: string = 'RecordType';
  public static PersonAccount: string = 'PersonAccount';
  public static Dashboard: string = 'Dashboard';
  public static Document: string = 'Document';
  public static Email: string = 'Email';
  public static EmailTemplate: string = 'EmailTemplate';
  public static Report: string = 'Report';
  public static Folder: string = 'Folder';
  public static FlowDefinition: string = 'FlowDefinition';
  public static Flow: string = 'Flow';
  public static ReportFolder: string = 'ReportFolder';
  public static EmailFolder: string = 'EmailFolder';
  public static DocumentFolder: string = 'DocumentFolder';
  public static DashboardFolder: string = 'DashboardFolder';
  public static OrgPreferenceSettings: string = 'OrgPreferenceSettings';

  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_managedtopics.htm
  public static ManagedTopic: string = 'ManagedTopic';
  public static ApexClass: string = 'ApexClass';
  public static ApexComponent: string = 'ApexComponent';
  public static ApexPage: string = 'ApexPage';
  public static ApexTrigger: string = 'ApexTrigger';
  public static LightningComponentBundle: string = 'LightningComponentBundle';
  public static AuraDefinitionBundle: string = 'AuraDefinitionBundle';
  public static Translation: string = 'Translation';
  public static CustomPermission: string = 'CustomPermission';
  public static CustomSetting: string = 'CustomSetting';
  public static CustomLabel: string = 'CustomLabel';
  public static SharingReason: string = 'SharingReason';
  public static CompactLayout: string = 'CompactLayout';
  public static PlatformCachePartition: string = 'PlatformCachePartition';
  public static HomePageComponent: string = 'HomePageComponent';
  public static DeveloperName: string = 'DeveloperName';
  public static LatestVersion: string = 'LatestVersion';
  public static VersionNumber: string = 'VersionNumber';
  public static Status: string = 'Status';
  public static Active: string = 'Active';
  public static Obsolete: string = 'Obsolete';

  // special case e.g. static resources
  public static metaXmlSuffix: string = "-meta.xml";
  // namespaced
  public static doubleUnderscore: string = "__";

  /** SPECIFIC DIR CONSTANTS*/
  public static aura: string = "aura";
  public static lwc: string = "lwc";
  public static objects: string = "objects";
  public static dashboards: string = "dashboards";
  public static email: string = "email";
  public static reports: string = "reports";
  public static documents: string = "documents";
  public static profiles: string = "profiles";
  public static settings: string = "settings";
  public static _name: string = "name"; // reserved es6 property
  public static tab: string = "tab";
  public static settingName: string = "settingName";

  // Bot related
  // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_bot.htm
  public static bots: string = 'bots';
  public static Bot: string = 'Bot';
  public static BotVersion: string = 'BotVersion';
  public static botVersions: string = 'botVersions';

  // Territory2
  public static territory2Models: string = 'territory2Models';

  // Object related
  public static Profile: string = "Profile";
  public static CustomObject: string = "CustomObject";
  public static CustomField: string = "CustomField";
  public static Index: string = "Index";
  public static BusinessProcess: string = "BusinessProcess";
  public static WebLink: string = "WebLink";
  public static ValidationRule: string = "ValidationRule";
  public static ListView: string = "ListView";
  public static FieldSet: string = "FieldSet";

  // Workflow related
  public static WorkflowAlert: string = "WorkflowAlert";
  public static WorkflowFieldUpdate: string = "WorkflowFieldUpdate";
  public static WorkflowFlowAction: string = "WorkflowFlowAction";
  public static WorkflowKnowledgePublish: string = "WorkflowKnowledgePublish";
  public static WorkflowOutboundMessage: string = "WorkflowOutboundMessage";
  public static WorkflowSend: string = "WorkflowSend";
  public static WorkflowRule: string = "WorkflowRule";
  public static WorkflowTask: string = "WorkflowTask";

  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_assignmentrule.htm
  public static AssignmentRule: string = "AssignmentRule";
  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_autoresponserules.htm 
  public static AutoResponseRule: string = "AutoResponseRule";
  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_escalationrules.htm
  public static EscalationRule: string = "EscalationRule";
  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_matchingrule.htm
  public static MatchingRule: string = "MatchingRule";
  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_sharingrules.htm
  public static SharingOwnerRule: string = "SharingOwnerRule";
  public static SharingCriteriaRule: string = "SharingCriteriaRule";
  public static SharingTerritoryRule: string = "SharingTerritoryRule";

  // the double barrel name exceptions
  public static keywords: string = "keywords";
  public static moderation: string = "moderation";
  public static userCriteria: string = "userCriteria";
  public static duplicateRules: string = "duplicateRules";
  public static customMetadata: string = "customMetadata";

  public static flows: string = "flows";
  public static status: string = "status";
  public static flowDefinitions: string = "flowDefinitions";
  public static activeVersionNumber: string = "activeVersionNumber";
  public static attributes: string = "attributes";

  public static field: string = "field";
  public static fields: string = "fields";
  public static indexes: string = "indexes";
  public static businessProcesses: string = "businessProcesses";
  public static recordTypes: string = "recordTypes";
  public static compactLayouts: string = "compactLayouts";
  public static webLinks: string = "webLinks";
  public static validationRules: string = "validationRules";
  public static sharingReasons: string = "sharingReasons";
  public static listViews: string = "listViews"
  public static fieldSets: string = "fieldSets";
  public static labels: string = "labels";
  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_workflow.htm
  public static alerts: string = "alerts";
  public static fieldUpdates: string = "fieldUpdates";
  public static flowActions: string = "flowActions";
  public static knowledgePublishes: string = "knowledgePublishes";
  public static outboundMessages: string = "outboundMessages";
  public static rules: string = "rules";
  public static tasks: string = "tasks";
  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_assignmentrule.htm
  public static assignmentRule: string = "assignmentRule";
  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_autoresponserules.htm
  public static autoresponseRule: string = "autoresponseRule";
  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_escalationrules.htm
  public static escalationRule: string = "escalationRule";
  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_matchingrule.htm
  public static matchingRules: string = "matchingRules";
  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_sharingrules.htm
  public static sharingCriteriaRules: string = "sharingCriteriaRules";
  public static sharingOwnerRules: string = "sharingOwnerRules";
  public static sharingTerritoryRules: string = "sharingTerritoryRules";

  //name field used in metadata object files 
  public static fullName: string = "fullName";
  public static label: string = "label";
  public static _text: string = "_text";
  public static columns: string = "columns";

  //https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_retrieveresult.htm
  public static beta: string = 'beta';
  public static deleted: string = 'deleted';
  public static deprecated: string = 'deprecated';
  public static installed: string = 'installed';
  public static released: string = 'released';
  public static unmanaged: string = 'unmanaged';

  // query error invalid field
  public static INVALID_FIELD: string = 'INVALID_FIELD';

  // https://developer.salesforce.com/docs/atlas.en-us.packagingGuide.meta/packagingGuide/packaging_component_attributes.htm
  public static hiddenOrNonEditableInstalledMetaTypes = [
    // following are (hidden or non-editable) if managed
    MdapiConfig.ApexClass,
    MdapiConfig.ApexComponent,
    MdapiConfig.ApexPage,
    MdapiConfig.ApexTrigger,
    MdapiConfig.AuraDefinitionBundle,
    MdapiConfig.LightningComponentBundle,
    MdapiConfig.StaticResource,
    MdapiConfig.PermissionSet,
    MdapiConfig.FlexiPage,
    MdapiConfig.Translation,
    MdapiConfig.CustomPermission,
    MdapiConfig.PlatformCachePartition,
    MdapiConfig.SharingReason,
    // according to sfdc reference include as well 
    // custom application (although classic elements can be modified)
    MdapiConfig.CompactLayout,
    MdapiConfig.CustomLabel,
    MdapiConfig.CustomPermission,
    // MdapiConfig.CustomSetting, checkthis
    MdapiConfig.HomePageComponent
  ];

  // prod specific variables
  public static ActiveScratchOrg: string = 'ActiveScratchOrg';
  public static NamespaceRegistry: string = 'NamespaceRegistry';
  public static ScratchOrgInfo: string = 'ScratchOrgInfo';
  public static standard__LightningInstrumentation: string = 'standard__LightningInstrumentation';

  public static destructiveExceptions = {
    Workflow: [MdapiCommon.ASTERIX],
    AssignmentRules: [MdapiCommon.ASTERIX],
    CustomObjectTranslation: [MdapiCommon.ASTERIX],
    Flow: [MdapiCommon.ASTERIX],
    FlowDefinition: [MdapiCommon.ASTERIX],
    CustomObject: [MdapiConfig.ActiveScratchOrg, MdapiConfig.NamespaceRegistry, MdapiConfig.ScratchOrgInfo], // prod specific 
    CustomApplication: [MdapiConfig.standard__LightningInstrumentation] // prod specific 
  };

  // unsupported both sfdx and mdapi as at 46.0
  public static unsupportedMetadataTypes = [
    MdapiConfig.ManagedTopic
  ]; // cannot query listmetadata (error invalid parameter value) with api 46.0

  // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/standardvalueset_names.htm
  public static standardValueSets: Array<string> = [
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

  public static bundleDirectories: Array<string> = [
    MdapiConfig.lwc,
    MdapiConfig.aura
  ];

  public static folderDirectories: Array<string> = [
    MdapiConfig.dashboards,
    MdapiConfig.documents,
    MdapiConfig.email,
    MdapiConfig.reports
  ];

  public static metadataFolders: Array<string> = [
    MdapiConfig.DashboardFolder,
    MdapiConfig.DocumentFolder,
    MdapiConfig.EmailFolder,
    MdapiConfig.ReportFolder
  ];

  public static metadataTypeFolderLookup: Record<string, string> = {
    Dashboard: MdapiConfig.DashboardFolder,
    Document: MdapiConfig.DocumentFolder,
    EmailTemplate: MdapiConfig.EmailFolder, // does not follow typical name and folder convention
    Report: MdapiConfig.ReportFolder
  };

  // CHECK THIS WITH SALESFORCE RELEASE NOTE THE FOLLOWING IS NOT SUPPORTED WITH SFDX AS PART OF API VERSION 46.0
  // FUTURE ENHANCEMENT MAKE THIS A PARAM TO INPUT JSON FILE
  // this must match above directory as of API VERSION 46.0 only applicable to sfdx force:source:retrieve or force:mdapi:convert
  public static nonSfdxSupportedDirectories = [
    'animationRules',
    'audience',
    'bots'
  ];

  // this must match above directory
  public static nonSfdxSupportedMetaTypes = [
    'AnimationRule',
    'Audience',
    'Bot'
  ];

  // exclude from diff compare
  public static directoryExcludes = [
    "src",
    "force-app"
  ];

  // exclude from diff compare
  public static fileExcludes = [
    "jsconfig",
    "eslintrc",
    "package.xml"
  ];

  public static childMetadataDirectories = [
    //label
    MdapiConfig.labels,
    //object
    MdapiConfig.fields,
    MdapiConfig.indexes,
    MdapiConfig.businessProcesses,
    MdapiConfig.recordTypes,
    MdapiConfig.compactLayouts,
    MdapiConfig.webLinks,
    MdapiConfig.validationRules,
    MdapiConfig.sharingReasons,
    MdapiConfig.listViews,
    MdapiConfig.fieldSets,
    //workflow
    MdapiConfig.alerts,
    MdapiConfig.fieldUpdates,
    MdapiConfig.flowActions,
    MdapiConfig.knowledgePublishes,
    MdapiConfig.outboundMessages,
    MdapiConfig.rules,
    MdapiConfig.tasks,
    //assignment rule
    MdapiConfig.assignmentRule,
    //auto response rule
    MdapiConfig.autoresponseRule,
    //escalation rule
    MdapiConfig.escalationRule,
    //matching rule
    MdapiConfig.matchingRules,
    // sharing rules
    MdapiConfig.sharingOwnerRules,
    MdapiConfig.sharingCriteriaRules,
    MdapiConfig.sharingTerritoryRules,
    //ManagedTopic (is uppercase) - weird also part of excludes
    MdapiConfig.ManagedTopic,
    //botversions
    MdapiConfig.botVersions
  ];

  public static childMetadataDirectoryLookup = {
    //Custom Label
    CustomLabel: MdapiConfig.labels,
    //Cusom Object
    CustomField: MdapiConfig.fields,
    Index: MdapiConfig.indexes,
    BusinessProcess: MdapiConfig.businessProcesses,
    RecordType: MdapiConfig.recordTypes,
    CompactLayout: MdapiConfig.compactLayouts,
    WebLink: MdapiConfig.webLinks,
    ValidationRule: MdapiConfig.validationRules,
    SharingReason: MdapiConfig.sharingReasons,
    ListView: MdapiConfig.listViews,
    FieldSet: MdapiConfig.fieldSets,
    //Workflow
    WorkflowAlert: MdapiConfig.alerts,
    WorkflowFieldUpdate: MdapiConfig.fieldUpdates,
    WorkflowSend: MdapiConfig.flowActions, // TODO: double check this is correct
    WorkflowKnowledgePublish: MdapiConfig.knowledgePublishes,
    WorkflowOutboundMessage: MdapiConfig.outboundMessages,
    WorkflowRule: MdapiConfig.rules,
    WorkflowTask: MdapiConfig.tasks,
    //Assignment rule (singular)
    AssignmentRule: MdapiConfig.assignmentRule,
    //Auto Response Rule (singular)
    AutoResponseRule: MdapiConfig.autoresponseRule,
    //Escalation Rule (singular)
    EscalationRule: MdapiConfig.escalationRule,
    //Matching Rules (plural)
    MatchingRule: MdapiConfig.matchingRules,
    //SharingOwnerRule
    SharingOwnerRule: MdapiConfig.sharingOwnerRules,
    SharingCriteriaRule: MdapiConfig.sharingCriteriaRules,
    SharingTerritoryRule: MdapiConfig.sharingTerritoryRules,
    //ManagedTopic
    ManagedTopic: MdapiConfig.ManagedTopic,
    //Botversion
    BotVersion: MdapiConfig.botVersions,
    // Territory2Rule
    Territory2Rule: MdapiConfig.rules
  };

  public static isFolderDirectory(directory: string): boolean {
    let returned: boolean = false;
    MdapiConfig.folderDirectories.forEach((element: string) => {
      if (element === directory) {
        returned = true;
        return; // break inner loop
      }// end if
    });
    return returned;
  }// end method

  public static isBundleDirectory(directory: string): boolean {
    let returned: boolean = false;
    MdapiConfig.bundleDirectories.forEach((element: string) => {
      if (element === directory) {
        returned = true;
        return; // break inner loop
      }// end if
    });
    return returned;
  }// end method

  // territory 2 folders don't follow the describemetadata pattern of child or folder (handled as exception)
  public static isTerritory2ModelsDirectory(directory: string): boolean {
    return (directory === MdapiConfig.territory2Models);
  }// end method

  /**
   * General view or assumption is that excluded namespaced items are installed 
   * or managed packages and should be handled seperately (installed)  
   * aura and lwc types don't appear to have namespace charateristics in bundles so use excludes if necessary
   */
  public static isExcludedNamespaceFile(fileName: string, metadataObject: MetadataObject): boolean {

    let excluded: boolean = false;
    if (fileName && metadataObject &&
      MdapiConfig.isHiddenOrNonEditableInstalledMetaType(metadataObject.xmlName)) {
      if (fileName.includes(MdapiConfig.doubleUnderscore)) {
        excluded = true;
      }// end if
    }// end if
    return excluded;
  }// end method

  public static isExcludedFile(input: string): boolean {
    let excluded: boolean = false;
    MdapiConfig.fileExcludes.forEach(element => {
      if (element === input) {
        excluded = true;
        return; // break inner loop
      }// end if
    });
    return excluded;
  }// end method

  public static isExcludedDirectory(input: string): boolean {
    let excluded: boolean = false;
    MdapiConfig.directoryExcludes.forEach(element => {
      if (element === input) {
        excluded = true;
        return; // break inner loop
      }// end if
    });
    return excluded;
  }// end method

  public static isUnsupportedMetaType(metaType: string): boolean {
    for (let x: number = 0; x < MdapiConfig.unsupportedMetadataTypes.length; x++) {
      let unsupportedMetadataType: string = MdapiConfig.unsupportedMetadataTypes[x];
      if (unsupportedMetadataType === metaType) { return true; }// end if
    }// end for
    return false;
  }// end method

  protected static isHiddenOrNonEditableInstalledMetaType(metadataType: string): boolean {
    if (!metadataType) { return false; }
    for (let x: number = 0; x < MdapiConfig.hiddenOrNonEditableInstalledMetaTypes.length; x++) {
      let hiddenMetaType: string = MdapiConfig.hiddenOrNonEditableInstalledMetaTypes[x];
      if (hiddenMetaType === metadataType) {
        return true;
      }// end if
    }// end for
    return false;
  }// end method

  protected static isHiddenOrNonEditable(metaItem: FileProperties): boolean {

    if ((metaItem && metaItem.manageableState) &&
      (metaItem.manageableState === MdapiConfig.installed)) {
      return MdapiConfig.isHiddenOrNonEditableInstalledMetaType(metaItem.type);
    }// end if
    return false;

  }// end method

  public static ignoreHiddenOrNonEditable(settings: ISettings, metaItem: FileProperties): boolean {

    if (!settings.ignoreHiddenOrNonEditable) { return false; }
    return MdapiConfig.isHiddenOrNonEditable(metaItem);

  }// end method

  protected static isIgnoreNamespaces(metaItem: FileProperties): boolean {

    return (metaItem.namespacePrefix &&
      (metaItem.namespacePrefix !== null) &&
      (metaItem.namespacePrefix !== MdapiCommon.BLANK)); // pi or Finserv etc

  }// end method 

  public static ignoreNamespaces(settings: ISettings, metaItem: FileProperties): boolean {

    if (!settings.ignoreNamespaces) { return false; }
    return MdapiConfig.isIgnoreNamespaces(metaItem);

  }// end method 

  protected static isIgnoreInstalled(metaItem: FileProperties): boolean {

    return (metaItem.manageableState &&
      (metaItem.manageableState === MdapiConfig.installed));

  }// end method 

  public static ignoreInstalled(settings: ISettings, metaItem: FileProperties): boolean {

    if (!settings.ignoreInstalled) {
      return false;
    }// end if
    return MdapiConfig.isIgnoreInstalled(metaItem);

  }// end method 

  public static toSortedMembers(fileProperties: Array<FileProperties>): Array<string> {
    let members: Array<string> = [];
    for (let x: number = 0; (fileProperties && (x < fileProperties.length)); x++) {
      let fileProps: FileProperties = fileProperties[x];
      members.push(fileProps.fullName);
    }// end for
    return members.sort();
  }// end method

  /**
   * used to setup additional metadata types e.g. Folders (ReportFolder) and Children (e.g. CustomField)
   * @param config 
   * @param metaTypeNameArray 
   */
  public static describeMetadataArray(config: IConfig, metaTypeNameArray: Array<string>) {

    for (let x: number = 0; x < metaTypeNameArray.length; x++) {

      let metaTypeName: string = metaTypeNameArray[x];
      config.metadataTypes.push(metaTypeName);
      config.metadataObjectMembersLookup[metaTypeName] = [];
      // there is no specific directory for other types e.g. customfield for mdapi

      config.metadataObjectLookup[metaTypeName] = (<MetadataObject>
        {
          directoryName: MdapiConfig.childMetadataDirectoryLookup[metaTypeName],
          inFolder: false,
          metaFile: false,
          suffix: null,
          xmlName: metaTypeName,
          childXmlNames: null
        });

    }// end for

  }// end method

  public static describeMetadataFile(result: DescribeMetadataResult): void {
    if (!existsSync(MdapiCommon.configRoot)) {
      mkdirSync(MdapiCommon.configRoot);
    }// end if
    let describeMetadataJsonPath: string = (MdapiCommon.configRoot + MdapiCommon.PATH_SEP + MdapiConfig.describeMetadataJson);
    MdapiCommon.jsonToFile(result, describeMetadataJsonPath);
  }// end method

  /**
   * describeMetadata will populate config variables based on describe results
   * 
   * @param org 
   * @param config 
   * @param settings 
   */
  public static describeMetadata(org: Org, config: IConfig, settings: ISettings): Promise<void> {

    return new Promise((resolve, reject) => {

      org.getConnection().metadata.describe(settings.apiVersion).then((result: DescribeMetadataResult) => {

        try {

          MdapiConfig.describeMetadataFile(result);

          let metadataObjects: Array<MetadataObject> = result.metadataObjects;

          config.metadataObjects = metadataObjects;

          for (let x: number = 0; x < metadataObjects.length; x++) {

            let metadataObject: MetadataObject = metadataObjects[x];
            let metaTypeName: string = metadataObject.xmlName;
            let directoryName: string = metadataObject.directoryName;

            if (MdapiConfig.isUnsupportedMetaType(metaTypeName)) { continue; }

            if (settings.ignoreStaticResources && (metaTypeName === MdapiConfig.StaticResource)) {
              continue;
            }// end if

            if (settings.ignoreFolders && metadataObject.inFolder) {
              continue;
            }// end if

            config.metadataTypes.push(metaTypeName);
            config.metadataObjectMembersLookup[metaTypeName] = [];
            config.metadataObjectLookup[metaTypeName] = metadataObject;

            // set directory lookup
            let lookupArray: Array<MetadataObject> = config.metadataDirectoryLookup[directoryName];
            if (!lookupArray) { lookupArray = []; }// end if init array
            lookupArray.push(metadataObject);
            config.metadataDirectoryLookup[directoryName] = lookupArray;

            // setup folders
            if (metadataObject.inFolder) {
              let metaTypeFolderName: string = MdapiConfig.metadataTypeFolderLookup[metaTypeName];
              config.metadataFolders.push(metaTypeFolderName); // e.g. ReportFolder
            }// end if

            // setup child metadata
            if (metadataObject.childXmlNames && (metadataObject.childXmlNames instanceof Array)) {

              for (let y: number = 0; y < metadataObject.childXmlNames.length; y++) {
                let childXmlName = metadataObject.childXmlNames[y];
                if (MdapiConfig.isUnsupportedMetaType(childXmlName)) { continue; }
                config.metadataTypeChildren.push(childXmlName);
              }// end for

            }// end if

          }// end for

          MdapiConfig.describeMetadataArray(config, config.metadataFolders);

          MdapiConfig.describeMetadataArray(config, config.metadataTypeChildren);

          config.metadataTypeChildren.forEach((childmetaType: string) => {
            let childMetadataObject = config.metadataObjectLookup[childmetaType];
            let childDirectoryName: string = MdapiConfig.childMetadataDirectoryLookup[childmetaType];
            let lookupArray: Array<MetadataObject> = config.metadataDirectoryLookup[childDirectoryName];
            if (!lookupArray) { lookupArray = []; }// end if init array
            lookupArray.push(childMetadataObject);
            config.metadataDirectoryLookup[childDirectoryName] = lookupArray;
          });

          config.metadataTypes.sort();

          resolve();

        } catch (exception) {
          console.error(exception);
          reject(exception);
        }// end catch

      }, (error: any) => {
        console.error(error);
        reject(error);
      });// end describe

    });// end promise

  }// end method

  /**
   * set StandardValueSets names list not queryable  
   * https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/standardvalueset_names.htm
   * @param config 
   */
  public static setStandardValueSets(config: IConfig): void {

    for (let x: number = 0; x < MdapiConfig.standardValueSets.length; x++) {
      config.metadataObjectMembersLookup[MdapiConfig.StandardValueSet].push((<FileProperties>
        {
          "type": MdapiConfig.StandardValueSet,
          "createdById": null,
          "createdByName": null,
          "createdDate": null,
          "fileName": null,
          "fullName": MdapiConfig.standardValueSets[x],
          "id": null,
          "lastModifiedById": null,
          "lastModifiedByName": null,
          "lastModifiedDate": null,
          "manageableState": null,
          "namespacePrefix": null,
        })
      );
    }// end for

  }// end method

  /**
   * Queries and includes ommitted RecordTypes into config
   * @param org 
   * @param config 
   */
  public static async resolvePersonAccountRecordTypes(org: Org, config: IConfig): Promise<void> {

    return new Promise((resolve, reject) => {

      org.getConnection().query("SELECT DeveloperName, SobjectType, IsPersonType FROM RecordType " +
        " WHERE SobjectType = 'Account' AND IsPersonType = true").then((result: QueryResult<any>) => {

          if (result.records) {

            for (let x: number = 0; x < result.records.length; x++) {

              let record: Object = result.records[x];
              let personRecordType: string = (MdapiConfig.PersonAccount + MdapiCommon.DOT + record[MdapiConfig.DeveloperName]);

              config.metadataObjectMembersLookup[MdapiConfig.RecordType].push(
                (<FileProperties>{
                  type: MdapiConfig.RecordType,
                  createdById: null,
                  createdByName: null,
                  createdDate: null,
                  fileName: null,
                  fullName: personRecordType,
                  id: null,
                  lastModifiedById: null,
                  lastModifiedByName: null,
                  lastModifiedDate: null,
                  manageableState: null,
                  namespacePrefix: null
                })// end push
              );
            }// end for
          }// end if
          resolve();
        }, (error: any) => {
          if (error && (error instanceof Object)) {
            let errorString: string = JSON.stringify(error);
            if (errorString.includes(MdapiConfig.INVALID_FIELD)) {
              console.log("ignoring person accounts not activated in org");
              resolve();
              return;
            }// end if
          }// end if
          reject(error);
        });

    });// end promise

  }// end method

  /**
   * repositionSettings at end in prep for package.xml creation
   * @param config 
   */
  public static repositionSettings(config: IConfig): void {

    let found: boolean = false;
    for (let x: number = 0; x < config.metadataTypes.length; x++) {
      if (config.metadataTypes[x] === MdapiConfig.Settings) {
        config.metadataTypes.splice(x, 1);
        found = true;
        break;
      }// end if
    }// end if
    if (found) {
      config.metadataTypes.push(MdapiConfig.Settings);
    }// end if

  }// end method

  public static getMetadataNameFromCurrentDirectory(parentDirectory: string): string {
    let segments: Array<string> = parentDirectory.split(path.sep);
    return segments[segments.length - 1]; //  one up
  }// end method

  public static getMetadataNameFromParentDirectory(parentDir: string): string {
    let segments: Array<string> = parentDir.split(path.sep);
    return segments[segments.length - 2]; // two up
  }// end method

  public static isolateMetadataObjectName(fileName: string): string {

    if (fileName.endsWith(MdapiConfig.metaXmlSuffix)) {
      fileName = fileName.replace(MdapiConfig.metaXmlSuffix, MdapiCommon.BLANK);
    }// end if

    let items: Array<string> = fileName.split(MdapiCommon.DOT);

    if (items.length > 1) {
      items.splice((items.length - 1), 1);
    }// end if

    return MdapiCommon.join(items, MdapiCommon.DOT);

  }// end method

  public static createPackageFile(config: IConfig, settings: ISettings, packageXmlPath: string): void {

    let xmlContent: string = this.packageXmlHeader();

    MdapiConfig.repositionSettings(config);

    for (let x: number = 0; x < config.metadataTypes.length; x++) {

      let metaType: string = config.metadataTypes[x];

      if (config.metadataObjectMembersLookup[metaType].length === 0) { continue; }

      let metaItems: Array<FileProperties> = config.metadataObjectMembersLookup[metaType];

      let sortedMembers: Array<string> = MdapiConfig.toSortedMembers(metaItems);

      xmlContent += (MdapiCommon.TWO_SPACE + '<types>\n');

      for (let y: number = 0; y < sortedMembers.length; y++) {
        let item: string = sortedMembers[y];
        xmlContent += (MdapiCommon.FOUR_SPACE + '<members>' + item + '</members>\n');
      }// end for

      xmlContent += (MdapiCommon.FOUR_SPACE + '<name>' + metaType + '</name>\n');
      xmlContent += (MdapiCommon.TWO_SPACE + '</types>\n');

    }// end for

    xmlContent += (MdapiCommon.TWO_SPACE + '<version>' + settings.apiVersion + '</version>\n');
    xmlContent += this.packageXmlFooter();

    writeFileSync(packageXmlPath, xmlContent);

  }// end function

  public static getMetadataObjectFromDirectoryName(config: IConfig, directoryName: string, metaFile?: string): MetadataObject {

    let metadataObjects: Array<MetadataObject> = MdapiCommon.objectToArray(config.metadataDirectoryLookup[directoryName]);

    if (metadataObjects.length === 1) {
      return metadataObjects[0]; // if one only return one
    }// end if
    for (let x: number = 0; x < metadataObjects.length; x++) {
      let metaObject: MetadataObject = metadataObjects[x];
      if (metaObject.suffix && (metaFile.endsWith(metaObject.suffix) ||
        metaFile.endsWith(metaObject.suffix + MdapiConfig.metaXmlSuffix))) { // e.g. for moderation different types
        return metaObject;
      }// end if
    }// end for
    return null; // try to resolve as next step
  }// end method

  public static getMetadataObjectFromFileExtension(config: IConfig, metaFile: string): MetadataObject {

    let metadataObjects: Array<MetadataObject> = MdapiCommon.objectToArray(config.metadataObjects);

    for (let x: number = 0; x < metadataObjects.length; x++) {
      let metaObject: MetadataObject = metadataObjects[x];
      // may require additional checks
      if (metaObject.suffix && metaFile.endsWith(metaObject.suffix)) { // e.g. for moderation different types
        return metaObject;
      }// end if
    }// end for
    return null; // try to resolve as next ste
  }// end method

  public static createConfig(): IConfig {
    return (<IConfig>{
      metadataTypes: [],
      metadataFolders: [],
      metadataTypeChildren: [],
      metadataObjectLookup: {},
      metadataObjectMembersLookup: {},
      metadataDirectoryLookup: {},
      metadataObjects: []
    });
  }// end method

  public static createSettings(): ISettings {
    return (<ISettings>{
      ignoreHiddenOrNonEditable: false,
      ignoreInstalled: false,
      ignoreNamespaces: false,
      ignoreStaticResources: false,
      ignoreFolders: false,
      apiVersion: null
    });
  }// end method

  public static async unzipUnpackaged(zipFilePath: string, targetDirectoryUnpackaged: string): Promise<any> {

    return new Promise((resolve, reject) => {

      yauzl.open(zipFilePath, { lazyEntries: true }, (openErr, zipfile) => {

        if (openErr) {
          reject(openErr);
          return;
        }// end if

        zipfile.readEntry();

        zipfile.once("close", () => {
          resolve();
          return;
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
            let outputDir = path.join(targetDirectoryUnpackaged, path.dirname(entry.fileName));
            let outputFile = path.join(targetDirectoryUnpackaged, entry.fileName);
            mkdirp(outputDir, (mkdirErr: any) => {
              if (mkdirErr) {
                reject(mkdirErr);
                return;
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

  public static async querylistMetadata(org: Org, metadataType: string, config: IConfig, settings: ISettings): Promise<void> {

    return new Promise((resolve, reject) => {

      let metaQueries: Array<ListMetadataQuery> = [{ type: metadataType }];

      org.getConnection().metadata.list(metaQueries, settings.apiVersion).then((result: Array<FileProperties>) => {

        result = MdapiCommon.objectToArray(result);

        for (let x: number = 0; x < result.length; x++) {
          let metaItem: FileProperties = result[x];
          config.metadataObjectMembersLookup[metadataType].push(metaItem);
        }// end for

        resolve();

      }, (error: any) => {
        reject(error);
      });// end promise
    });

  }// end method

  public static inspectMdapiFile(position: RelativePosition, config: IConfig, filePath: string,
    parentDirectory: string, metaRegister: Record<string, DiffRecord>): void {

    let fileName: string = MdapiCommon.isolateLeafNode(filePath); // Account.meta-object.xml
    let directory: string = MdapiCommon.isolateLeafNode(parentDirectory); //objects
    let memberName: string = MdapiConfig.isolateMetadataObjectName(fileName); //Account
    let anchorName: string = MdapiCommon.BLANK; // ''
    let folderXml: boolean = false;

    // don't process top level directories (from excluded list)
    if (MdapiConfig.isExcludedDirectory(directory) ||
      MdapiConfig.isExcludedFile(fileName)) {
      return; // ignore
    }// end if

    // let metadataObject: MetadataObject = MdapiConfig.getMetadataObjectFromFileExtension(config, fileName);
    let metadataObject = MdapiConfig.getMetadataObjectFromDirectoryName(config, directory, fileName);

    if (MdapiConfig.isExcludedNamespaceFile(fileName, metadataObject)) {
      if ((position === RelativePosition.Source) && existsSync(filePath)) {
        // don't want to include in src deploy pacakge and there is a src.backup
        unlinkSync(filePath);
      }// end if 
      return; // ignore
    }// end if

    if (MdapiConfig.isFolderDirectory(directory)) { folderXml = true; } // required to exclude from descructive changes

    // check for unresolve type
    if (!metadataObject) { // if null attempt to resolve

      let metadataParentName = MdapiConfig.getMetadataNameFromParentDirectory(parentDirectory);

      // special handle for bundles e.g. lwc aura
      if (MdapiConfig.isBundleDirectory(metadataParentName)) {
        metadataObject = MdapiConfig.getMetadataObjectFromDirectoryName(config, metadataParentName);
        memberName = MdapiConfig.getMetadataNameFromCurrentDirectory(parentDirectory);
      }// end else if
      // special handle for folder types
      else if (MdapiConfig.isFolderDirectory(metadataParentName)) {
        metadataObject = MdapiConfig.getMetadataObjectFromDirectoryName(config, metadataParentName);
        anchorName = MdapiConfig.getMetadataNameFromCurrentDirectory(parentDirectory);
        memberName = (anchorName + MdapiCommon.PATH_SEP + MdapiConfig.isolateMetadataObjectName(fileName));
      } // end else if
      else if (MdapiConfig.isTerritory2ModelsDirectory(metadataParentName)) {
        metadataObject = MdapiConfig.getMetadataObjectFromDirectoryName(config, metadataParentName, fileName);
        memberName = MdapiConfig.getMetadataNameFromCurrentDirectory(parentDirectory);
      }// end else if
      else {
        //fatal
        console.error('unexpected metatype found at parent directory: ' + parentDirectory
          + ' please check metaobject definitions are up to date - unresolved file path: ' + filePath);
        throw parentDirectory; // terminate 
      }// end else
    }// end if

    // without extension for comparison later may not be unique (e.g. a pair)
    let memberKey: string = (directory + MdapiCommon.PATH_SEP + memberName);
    let relativeFilePath: string = (directory + MdapiCommon.PATH_SEP + fileName);

    // saftey check
    if ((!fileName) || (!directory) || (!metadataObject)) {
      //fatal
      console.error('unexpected unresolved metaobject - key: ', memberKey +
        ' (filename: ' + fileName + ') directory: (' + directory + '), ' +
        ' parentdirectory: ' + parentDirectory + ', metadataobject: ' + metadataObject);
      throw 'unresolved metadataObject';
    }// end if

    let fileContents: string = readFileSync(filePath, MdapiCommon.UTF8);
    let stats: Stats = statSync(filePath);

    let diffRecord: DiffRecord = (<DiffRecord>{
      "memberKey": memberKey,
      "memberName": memberName, // e.g. Account
      "filePath": filePath,
      "fileHash": MdapiCommon.hashCode(fileContents), // only hash as contents is large
      "directory": directory, // sfdx directory e.g. triggers
      "folderXml": folderXml,
      "metadataName": metadataObject.xmlName,
      "metadataObject": metadataObject,
      "fileSize": stats.size,
      "diffType": DiffType.None,
      "diffSize": 0 // init
    });

    // add new unique entry
    metaRegister[relativeFilePath] = diffRecord;

  }// end method

  // children only present on one side so no compare needed but do list
  public static inspectMetaChildren(config: IConfig, packageDiffRecords: Record<string, Array<DiffRecord>>, parent: DiffRecord): void {

    let childMetaObject: Object = MdapiCommon.xmlFileToJson(parent.filePath);
    let childXmlNames: Array<string> = parent.metadataObject.childXmlNames;

    for (let x: number = 0; x < childXmlNames.length; x++) {

      let childMetaName: string = childXmlNames[x];

      if (MdapiConfig.isUnsupportedMetaType(childMetaName)) { continue; }

      let childMetadataObject: MetadataObject = config.metadataObjectLookup[childMetaName];
      let childDirectoryName: string = MdapiConfig.childMetadataDirectoryLookup[childMetaName];
      let parentContents: Object = childMetaObject[parent.metadataName];
      let children: Array<Object> = MdapiCommon.objectToArray(parentContents[childDirectoryName]);

      for (let y: number = 0; y < children.length; y++) {

        let child: Object = children[y];
        let memberName: string = (parent.memberName + MdapiCommon.DOT + child[MdapiConfig.fullName]._text);
        let memberKey: string = (childDirectoryName + MdapiCommon.PATH_SEP + parent.metadataName + MdapiCommon.PATH_SEP + memberName);
        let childString: string = JSON.stringify(child);

        let childItem: DiffRecord = (<DiffRecord>{
          "memberKey": memberKey,
          "memberName": memberName,
          "filePath": (parent.filePath + MdapiCommon.PATH_SEP + childMetaName + MdapiCommon.PATH_SEP + memberName),
          "fileHash": MdapiCommon.hashCode(childString),
          "directory": childDirectoryName,
          "folderXml": false,
          "metadataName": childMetadataObject.xmlName,
          "metadataObject": childMetadataObject,
          "fileSize": childString.length,
          "diffType": parent.diffType,
          "diffSize": 0
        });

        packageDiffRecords[childMetaName].push(childItem);

      }// end for

    }// end for

  }// end method

  public static metadataObjectHasChildren(metadataObject: MetadataObject): boolean {
    return ((metadataObject.childXmlNames) &&
      MdapiCommon.objectToArray(metadataObject.childXmlNames).length > 0);
  }// end method

  public static initDiffRecordsLookup(config: IConfig, diffRecordsLookup: Record<string, Array<DiffRecord>>): void {

    config.metadataTypes.forEach(metaTypeKey => {
      diffRecordsLookup[metaTypeKey] = [];
    });// end for

  }// end method

  public static sortDiffRecordTypes(DiffRecords: Record<string, Array<DiffRecord>>): Array<string> {

    let metadataObjectNames: Array<string> = [];

    for (let metadataObjectName in DiffRecords) {
      metadataObjectNames.push(metadataObjectName);
    }// end for

    metadataObjectNames.sort();
    return metadataObjectNames;

  }// end method

  public static packageXmlHeader(): string {
    let xmlContent: string = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xmlContent += '<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';
    return xmlContent;
  }// end method

  public static packageXmlFooter(): string {
    let xmlContent: string = '</Package>\n';
    return xmlContent;
  }// end method

}// end class
