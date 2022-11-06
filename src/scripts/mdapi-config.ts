/**
 * @name MdapiConfig
 * @author brianewardsaunders
 * @date 2019-07-10
 */

import type { DescribeMetadataResult, DescribeMetadataObject, FileProperties, ListMetadataQuery } from "jsforce/api/metadata";
import { QueryResult } from "jsforce";
import { Stats, createWriteStream, existsSync, mkdirSync, mkdirp, readFileSync, statSync, unlinkSync, writeFileSync } from "fs-extra";
import { Org } from "@salesforce/core";
import { MdapiCommon } from "./mdapi-common";
import path = require("path");
import yauzl = require("yauzl");

export interface IConfig {
    metadataTypes: Array<string>; // E.g. ['ApexClass', 'CustomObjet'] // from describeMetada also acts a key index for metadataObjectLookup and metadataObjectMembersLookup
    metadataFolders: Array<string>; // E.g. ['ReportFolder', 'DocumentFolder'] // don't exist so inject
    metadataTypeChildren: Array<string>; // E.g. ['CustomField']; // exist only within childXmlNames
    metadataObjectLookup: Record<string, DescribeMetadataObject>; // E.g. {'ApexClass, Array<MetadataObject>} quick lookup to object based on meta type name
    metadataObjectMembersLookup: Record<string, Array<FileProperties>>; // E.g. {'ApexClass', Array<FileProperties>} where files are members
    metadataDirectoryLookup: Record<string, Array<DescribeMetadataObject>>; // E.g. {'objects', Array<MetaObject>} // one directory can have multiple types.
    metadataObjects: Array<DescribeMetadataObject>; // E.g. directly from describemetadata.metadataObjects
    sourceFileTotal: number,
    targetFileTotal: number,
    sourceFileIgnored: number,
    targetFileIgnored: number,
    sourceFileProcessed: number,
    targetFileProcessed: number
}

export interface ISettings {
    ignoreHiddenOrNonEditable?: boolean;
    ignoreInstalled?: boolean;
    ignoreNamespaces?: boolean;
    ignoreStaticResources?: boolean;
    ignoreFolders?: boolean;
    apiVersion: string;
}

export enum RelativePosition {
    Source = "Source",
    Target = "Target"
}

export enum ChangeType {
    Package = "Package",
    DestructiveChanges = "DestructiveChanges"
}

export enum DiffType {
    Left = "Left",
    Right = "Right",
    Match = "Match",
    Diff = "Diff",
    None = "None"
}

export interface DiffRecord {
    memberKey: string;
    memberName: string, // E.g. Account
    filePath: string;
    fileHash: number; // Only hash as contents is large
    directory: string; // Sfdx directory e.g. triggers
    folderXml: boolean;
    metadataName: string;
    metadataObject: DescribeMetadataObject;
    fileSize: number;
    lastModified: Date;
    diffType: DiffType;
    diffSize: number; // Init
    fileContent: string; // Specifically for profile
    title: string; // Name info
    comment: string;
}

export interface ChangesetExclude {
    directoryExcludes: Array<string>;
    fileExcludes: Array<string>;
}

export interface Profile {
    layoutAssignments?: LayoutAssignment | Array<LayoutAssignment>;
    userPermissions?: UserPermission | Array<UserPermission>;
    tabVisibilities?: TabVisibility | Array<TabVisibility>;
    fieldPermissions?: FieldPermission | Array<FieldPermission>;
    objectPermissions?: ObjectPermission | Array<ObjectPermission>;
    customPermissions?: CustomPermission | Array<CustomPermission>;
    classAccesses?: ClassAccess | Array<ClassAccess>;
    applicationVisibilities?: ApplicationVisibility | Array<ApplicationVisibility>;
    pageAccesses?: PageAccess | Array<PageAccess>;
    recordTypeVisibilities?: RecordTypeVisibility | Array<RecordTypeVisibility>;
    custom: Textable;
}

export interface RecordTypeVisibility {
    default: Textable;
    recordType: Textable;
    visible: Textable;
}

export interface PageAccess {
    apexPage: Textable;
    enabled: Textable;
}

export interface ApplicationVisibility {
    application: Textable;
    default: Textable;
    visible: Textable;
}

export interface ObjectPermission {
    allowCreate: Textable;
    allowDelete: Textable;
    allowEdit: Textable;
    allowRead: Textable;
    modifyAllRecords: Textable;
    viewAllRecords: Textable;
    object: Textable;
}

export interface ClassAccess {
    apexClass: Textable;
    enabled: Textable;
}

export interface FieldPermission {
    field: Textable;
    editable: Textable;
    readable: Textable;
}

export interface CustomPermission {
    enabled: Textable;
    name: Textable;
}

export interface TabVisibility {
    tab: Textable;
    visibility: Textable; // DefaultOn, DefaultOff, Hidden
}

export interface UserPermission {
    name: Textable;
    enabled: Textable;
}

export interface LayoutAssignment {
    layout: Textable;
    recordType?: Textable;
}

export interface CustomObject {
    listViews: ListView | Array<ListView>;
}

export interface CustomObjectChild {
    fullName?: Textable;
    label?: Textable;
    actionName?: Textable;
    type?: Textable;
}

export interface ListView {
    fullName: Textable;
    columns: Textable | Array<Textable>;
    label: Textable;
}

export interface Dashboard {
    dashboardType: Textable;
    runningUser: Textable;
    title: Textable;
}

export interface Report {
    name: Textable;
}

export interface OrgPreferenceSettings {
    preferences: Preference | Array<Preference>;
}

export interface Preference {
    settingName: Textable;
    settingValue: Textable;
}

export interface SearchSettings {
    searchSettingsByObject: SearchSettingsByObject;
}

export interface SearchSettingsByObject {
    searchSettingsByObject: SearchSettingsByObject | Array<SearchSettingsByObject>;
    enhancedLookupEnabled?: Textable;
    lookupAutoCompleteEnabled?: Textable;
    name?: Textable;
    resultsPerPageCount?: Textable;
}

export interface Textable {
    _text: string;
}

export class MdapiConfig {

    public static forceapp = "force-app";

    public static unpackagedFolder = "unpackaged";

    public static unpackaged1Folder = "unpackaged1";

    public static unpackaged2Folder = "unpackaged2";

    public static srcFolder = "src";

    public static manifestFolder = "manifest";

    public static unpackagedZip = "unpackaged.zip";

    public static unpackaged1Zip = "unpackaged1.zip";

    public static unpackaged2Zip = "unpackaged2.zip";

    public static packageXml = "package.xml";

    public static diffCsv = "package.csv";

    public static package1Xml = "package1.xml";

    public static package2Xml = "package2.xml";

    public static packageManifest = "package.manifest";

    public static describeMetadataJson = "describeMetadata.json";

    public static destructiveChangesManifest = "destructiveChanges.manifest";

    public static destructiveChangesXml = "destructiveChanges.xml";

    public static destructiveChangesPostXml = "destructiveChangesPost.xml";

    public static destructiveChangesPreXml = "destructiveChangesPre.xml";

    public static StaticResource = "StaticResource";

    public static PermissionSet = "PermissionSet";

    public static FlexiPage = "FlexiPage";

    public static StandardValueSet = "StandardValueSet";

    public static Settings = "Settings";

    public static RecordType = "RecordType";

    public static PersonAccount = "PersonAccount";

    public static Dashboard = "Dashboard";

    public static Document = "Document";

    public static Email = "Email";

    public static EmailTemplate = "EmailTemplate";

    public static Report = "Report";

    public static Folder = "Folder";

    public static FlowDefinition = "FlowDefinition";

    public static Flow = "Flow";

    public static ReportFolder = "ReportFolder";

    public static EmailFolder = "EmailFolder";

    public static DocumentFolder = "DocumentFolder";

    public static DashboardFolder = "DashboardFolder";

    public static OrgPreferenceSettings = "OrgPreferenceSettings";

    public static SearchSettings = "SearchSettings";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_managedtopics.htm
    public static ManagedTopic = "ManagedTopic";

    public static ApexClass = "ApexClass";

    public static ApexComponent = "ApexComponent";

    public static ApexPage = "ApexPage";

    public static ApexTrigger = "ApexTrigger";

    public static AppMenu = "AppMenu";

    public static LightningComponentBundle = "LightningComponentBundle";

    public static AuraDefinitionBundle = "AuraDefinitionBundle";

    public static Translation = "Translation";

    public static CustomPermission = "CustomPermission";

    public static CustomSetting = "CustomSetting";

    public static CustomTab = "CustomTab";

    public static CustomLabel = "CustomLabel";

    public static DataCategoryGroup = "DataCategoryGroup";

    public static DuplicateRule = "DuplicateRule";

    public static SharingReason = "SharingReason";

    public static CompactLayout = "CompactLayout";

    public static CustomApplication = "CustomApplication";

    public static PlatformCachePartition = "PlatformCachePartition";

    public static HomePageComponent = "HomePageComponent";

    public static Layout = "Layout";

    public static DeveloperName = "DeveloperName";

    public static LatestVersion = "LatestVersion";

    public static VersionNumber = "VersionNumber";

    public static Status = "Status";

    public static Active = "Active";

    public static Obsolete = "Obsolete";

    // Special case e.g. static resources
    public static metaXmlSuffix = "-meta.xml";

    // Namespaced
    public static doubleUnderscore = "__";

    /** SPECIFIC DIR CONSTANTS*/
    public static aura = "aura";

    public static lwc = "lwc";

    public static objects = "objects";

    public static dashboards = "dashboards";

    public static email = "email";

    public static reports = "reports";

    public static documents = "documents";

    public static profiles = "profiles";

    public static settings = "settings";

    public static _name = "name"; // Reserved es6 property

    public static tab = "tab";

    public static settingName = "settingName";

    /*
     * Bot related
     * https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_bot.htm
     */
    public static bots = "bots";

    public static Bot = "Bot";

    public static BotVersion = "BotVersion";

    public static botVersions = "botVersions";

    // Territory2
    public static territory2Models = "territory2Models";

    // object related
    public static Profile = "Profile";

    public static QuickAction = "QuickAction";

    public static CustomObject = "CustomObject";

    public static CustomField = "CustomField";

    public static CustomIndex = "CustomIndex";

    public static CustomPageWebLink = "CustomPageWebLink";

    public static Index = "Index";

    public static BusinessProcess = "BusinessProcess";

    public static WebLink = "WebLink";

    // Workflow related
    public static Workflow = "Workflow";
    public static WorkflowKnowledgePublish = "WorkflowKnowledgePublish";
    public static WorkflowTask = "WorkflowTask";
    public static WorkflowAlert = "WorkflowAlert";
    public static WorkflowSend = "WorkflowSend";
    public static WorkflowOutboundMessage = "WorkflowOutboundMessage";
    public static WorkflowRule = "WorkflowRule";
    public static WorkflowFieldUpdate = "WorkflowFieldUpdate";
    public static WorkflowFlowAction = "WorkflowFlowAction";

    public static ValidationRule = "ValidationRule";

    public static ListView = "ListView";

    public static FieldSet = "FieldSet";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_assignmentrule.htm
    public static AssignmentRule = "AssignmentRule";

    public static AssignmentRules = "AssignmentRules";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_autoresponserules.htm
    public static AutoResponseRule = "AutoResponseRule";

    public static AutoResponseRules = "AutoResponseRules";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_escalationrules.htm
    public static EscalationRule = "EscalationRule";

    public static EscalationRules = "EscalationRules";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_matchingrule.htm
    public static MatchingRule = "MatchingRule";

    public static MatchingRules = "MatchingRules";

    public static MilestoneType = "MilestoneType";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_sharingrules.htm
    public static SharingOwnerRule = "SharingOwnerRule";

    public static SharingCriteriaRule = "SharingCriteriaRule";

    public static SharingTerritoryRule = "SharingTerritoryRule";

    // patch for meta item with no type
    public static GlobalValueSetTranslation = "GlobalValueSetTranslation";

    public static globalValueSetTranslations = "globalValueSetTranslations";

    public static StandardValueSetTranslation = "StandardValueSetTranslation";

    public static standardValueSetTranslations = "standardValueSetTranslations";

    // The double barrel name exceptions
    public static keywords = "keywords";

    public static moderation = "moderation";

    public static userCriteria = "userCriteria";

    public static duplicateRules = "duplicateRules";

    public static customMetadata = "customMetadata";

    public static flows = "flows";

    public static status = "status";

    public static flowDefinitions = "flowDefinitions";

    public static activeVersionNumber = "activeVersionNumber";

    public static attributes = "attributes";

    public static field = "field";

    public static fields = "fields";

    public static indexes = "indexes";

    public static businessProcesses = "businessProcesses";

    public static recordTypes = "recordTypes";

    public static compactLayouts = "compactLayouts";

    public static webLinks = "webLinks";

    public static validationRules = "validationRules";

    public static sharingReasons = "sharingReasons";

    public static listViews = "listViews"

    public static fieldSets = "fieldSets";

    public static labels = "labels";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_workflow.htm
    public static alerts = "alerts";

    public static fieldUpdates = "fieldUpdates";

    public static flowActions = "flowActions";

    public static knowledgePublishes = "knowledgePublishes";

    public static outboundMessages = "outboundMessages";

    public static rules = "rules";

    public static tasks = "tasks";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_assignmentrule.htm
    public static assignmentRule = "assignmentRule";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_autoresponserules.htm
    public static autoresponseRule = "autoresponseRule";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_escalationrules.htm
    public static escalationRule = "escalationRule";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_matchingrule.htm
    public static _matchingRules = "matchingRules";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_sharingrules.htm
    public static sharingCriteriaRules = "sharingCriteriaRules";

    public static sharingOwnerRules = "sharingOwnerRules";

    public static sharingTerritoryRules = "sharingTerritoryRules";

    // Name field used in metadata object files
    public static fullName = "fullName";

    public static label = "label";

    public static _text = "_text";

    public static columns = "columns";

    // https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_retrieveresult.htm
    public static beta = "beta";

    public static deleted = "deleted";

    public static deprecated = "deprecated";

    public static installed = "installed";

    public static released = "released";

    public static unmanaged = "unmanaged";

    // Query error invalid field
    public static INVALID_FIELD = "INVALID_FIELD";

    // https://developer.salesforce.com/docs/atlas.en-us.packagingGuide.meta/packagingGuide/packaging_component_attributes.htm
    public static hiddenOrNonEditableInstalledMetaTypes = [
        // Following are (hidden or non-editable) if managed
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
        /*
         * According to sfdc reference include as well
         * custom application (although classic elements can be modified)
         */
        MdapiConfig.CompactLayout,
        MdapiConfig.CustomLabel,
        MdapiConfig.CustomPermission,
        // MdapiConfig.CustomSetting, checkthis
        MdapiConfig.HomePageComponent
    ];

    public static package1MetaTypes = [
        MdapiConfig.ApexClass,
        MdapiConfig.ApexComponent,
        MdapiConfig.ApexPage,
        MdapiConfig.ApexTrigger,
        MdapiConfig.AppMenu,
        MdapiConfig.AssignmentRule,
        MdapiConfig.AssignmentRules,
        MdapiConfig.AuraDefinitionBundle,
        MdapiConfig.AutoResponseRule,
        MdapiConfig.AutoResponseRules,
        MdapiConfig.BusinessProcess,
        MdapiConfig.CompactLayout,
        MdapiConfig.CustomApplication,
        MdapiConfig.CustomField,
        MdapiConfig.CustomIndex,
        MdapiConfig.CustomObject,
        MdapiConfig.CustomPageWebLink,
        MdapiConfig.CustomPermission,
        MdapiConfig.CustomSetting,
        MdapiConfig.CustomTab,
        MdapiConfig.DataCategoryGroup,
        MdapiConfig.DuplicateRule,
        MdapiConfig.EscalationRule,
        MdapiConfig.EscalationRules,
        MdapiConfig.FieldSet,
        MdapiConfig.FlexiPage,
        MdapiConfig.Flow,
        MdapiConfig.FlowDefinition,
        MdapiConfig.HomePageComponent,
        MdapiConfig.Layout,
        MdapiConfig.LightningComponentBundle,
        MdapiConfig.ListView,
        MdapiConfig.MatchingRule,
        MdapiConfig.MatchingRules,
        MdapiConfig.MilestoneType,
        MdapiConfig.PermissionSet,
        MdapiConfig.Profile,
        MdapiConfig.QuickAction,
        MdapiConfig.RecordType,
        MdapiConfig.Settings,
        MdapiConfig.StandardValueSet,
        MdapiConfig.ValidationRule,
        MdapiConfig.WebLink,
        MdapiConfig.Workflow,
        MdapiConfig.WorkflowAlert,
        MdapiConfig.WorkflowFieldUpdate,
        MdapiConfig.WorkflowFlowAction,
        MdapiConfig.WorkflowKnowledgePublish,
        MdapiConfig.WorkflowOutboundMessage,
        MdapiConfig.WorkflowRule,
        MdapiConfig.WorkflowSend,
        MdapiConfig.WorkflowTask
    ];

    // Prod specific variables
    public static ActiveScratchOrg = "ActiveScratchOrg";

    public static NamespaceRegistry = "NamespaceRegistry";

    public static ScratchOrgInfo = "ScratchOrgInfo";

    public static standard__LightningInstrumentation = "standard__LightningInstrumentation";

    public static destructiveExceptions = {
        "Workflow": [MdapiCommon.ASTERIX],
        "AssignmentRules": [MdapiCommon.ASTERIX],
        "CustomObjectTranslation": [MdapiCommon.ASTERIX],
        "Flow": [MdapiCommon.ASTERIX],
        "FlowDefinition": [MdapiCommon.ASTERIX],
        "CustomObject": [
            MdapiConfig.ActiveScratchOrg,
            MdapiConfig.NamespaceRegistry,
            MdapiConfig.ScratchOrgInfo
        ], // Prod specific
        "CustomApplication": [MdapiConfig.standard__LightningInstrumentation] // Prod specific
    };

    public static packageExceptions = {
        "CustomLabel": [MdapiCommon.ASTERIX] // Parent (CustomLabels) deploys but not children
    };

    // Unsupported both sfdx and mdapi as at 46.0
    public static unsupportedMetadataTypes = [MdapiConfig.ManagedTopic]; // Cannot query listmetadata (error invalid parameter value) with api 46.0

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
        "Dashboard": MdapiConfig.DashboardFolder,
        "Document": MdapiConfig.DocumentFolder,
        "EmailTemplate": MdapiConfig.EmailFolder, // Does not follow typical name and folder convention
        "Report": MdapiConfig.ReportFolder
    };

    /*
     * CHECK THIS WITH SALESFORCE RELEASE NOTE THE FOLLOWING IS NOT SUPPORTED WITH SFDX AS PART OF API VERSION 46.0
     * FUTURE ENHANCEMENT MAKE THIS A PARAM TO INPUT JSON FILE
     * this must match above directory as of API VERSION 46.0 only applicable to sfdx force:source:retrieve or force:mdapi:convert
     */
    public static nonSfdxSupportedDirectories = [
        "animationRules",
        "audience",
        "bots",
        "managedContentTypes",
        "managedTopics"
    ];

    // This must match above directory
    public static nonSfdxSupportedMetaTypes = [
        "AnimationRule",
        "Audience",
        "Bot",
        "ManagedContentType",
        "ManagedTopic"
    ];

    // Exclude from diff compare
    public static directoryExcludes = [
        "src",
        "force-app"
    ];

    // Exclude from diff compare
    public static fileExcludes = [
        "jsconfig",
        "eslintrc",
        "package.xml"
    ];

    public static childMetadataDirectories = [
        // Label
        MdapiConfig.labels,
        // object
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
        // Workflow
        MdapiConfig.alerts,
        MdapiConfig.fieldUpdates,
        MdapiConfig.flowActions,
        MdapiConfig.knowledgePublishes,
        MdapiConfig.outboundMessages,
        MdapiConfig.rules,
        MdapiConfig.tasks,
        // Assignment rule
        MdapiConfig.assignmentRule,
        // Auto response rule
        MdapiConfig.autoresponseRule,
        // Escalation rule
        MdapiConfig.escalationRule,
        // Matching rule
        MdapiConfig._matchingRules,
        // Sharing rules
        MdapiConfig.sharingOwnerRules,
        MdapiConfig.sharingCriteriaRules,
        MdapiConfig.sharingTerritoryRules,
        // ManagedTopic (is uppercase) - weird also part of excludes
        MdapiConfig.ManagedTopic,
        // Botversions
        MdapiConfig.botVersions
    ];

    public static childMetadataDirectoryLookup = {
        // Custom Label
        "CustomLabel": MdapiConfig.labels,
        // Cusom object
        "CustomField": MdapiConfig.fields,
        "Index": MdapiConfig.indexes,
        "BusinessProcess": MdapiConfig.businessProcesses,
        "RecordType": MdapiConfig.recordTypes,
        "CompactLayout": MdapiConfig.compactLayouts,
        "WebLink": MdapiConfig.webLinks,
        "ValidationRule": MdapiConfig.validationRules,
        "SharingReason": MdapiConfig.sharingReasons,
        "ListView": MdapiConfig.listViews,
        "FieldSet": MdapiConfig.fieldSets,
        // Workflow
        "WorkflowAlert": MdapiConfig.alerts,
        "WorkflowFieldUpdate": MdapiConfig.fieldUpdates,
        "WorkflowSend": MdapiConfig.flowActions, // TODO: double check this is correct
        "WorkflowKnowledgePublish": MdapiConfig.knowledgePublishes,
        "WorkflowOutboundMessage": MdapiConfig.outboundMessages,
        "WorkflowRule": MdapiConfig.rules,
        "WorkflowTask": MdapiConfig.tasks,
        // Assignment rule (singular)
        "AssignmentRule": MdapiConfig.assignmentRule,
        // Auto Response Rule (singular)
        "AutoResponseRule": MdapiConfig.autoresponseRule,
        // Escalation Rule (singular)
        "EscalationRule": MdapiConfig.escalationRule,
        // Matching Rules (plural)
        "MatchingRule": MdapiConfig._matchingRules,
        // SharingOwnerRule
        "SharingOwnerRule": MdapiConfig.sharingOwnerRules,
        "SharingCriteriaRule": MdapiConfig.sharingCriteriaRules,
        "SharingTerritoryRule": MdapiConfig.sharingTerritoryRules,
        // ManagedTopic
        "ManagedTopic": MdapiConfig.ManagedTopic,
        // Botversion
        "BotVersion": MdapiConfig.botVersions,
        // Territory2Rule (need to handle this as exception has folders)
        "Territory2Rule": MdapiConfig.rules
    };

    public static isFolderRootDirectory(directory: string): boolean {

        let returned = false;

        MdapiConfig.folderDirectories.forEach((element: string) => {

            if (element === directory) {

                returned = true;
                // Break inner loop

            }// End if

        });

        return returned;

    }// End method

    public static resolveIfAncestorIsFolderDirectory(filepath: string): string {

        let returned: string = null;

        MdapiConfig.folderDirectories.forEach((element: string) => {

            if (filepath.includes(path.sep + element + path.sep)) {

                returned = element;
                // Break inner loop

            }// End if

        });

        return returned;

    }// End method

    public static extractAncestorDirectoryPath(filePath: string, baseDirectory: string): string {

        let returned = "";
        let items: Array<string> = filePath.split(path.sep),
            flag = false;

        for (let i = 0; i < items.length - 1; i++) {

            let token: string = items[i];

            if (token === baseDirectory) {

                flag = true;
                continue;

            } // End if
            else if (flag) {

                returned += token;
                if (i < items.length - 2) {

                    returned += MdapiCommon.PATH_SEP;

                }

            }// End else if

        }// End for

        return returned;

    }// End method

    public static isBundleDirectory(directory: string): boolean {

        let returned = false;

        MdapiConfig.bundleDirectories.forEach((element: string) => {

            if (element === directory) {

                returned = true;
                // Break inner loop

            }// End if

        });

        return returned;

    }// End method

    // Territory 2 folders don't follow the describemetadata pattern of child or folder (handled as exception)
    public static isTerritory2ModelsDirectory(directory: string): boolean {

        return directory === MdapiConfig.territory2Models;

    }// End method

    /**
     * General view or assumption is that excluded namespaced items are installed
     * or managed packages and should be handled seperately (installed)
     * aura and lwc types don't appear to have namespace charateristics in bundles so use excludes if necessary
     */
    public static isExcludedNamespaceFile(fileName: string, metadataObject: DescribeMetadataObject): boolean {

        let excluded = false;

        if (fileName && metadataObject &&
            MdapiConfig.isHiddenOrNonEditableInstalledMetaType(metadataObject.xmlName)) {

            if (fileName.includes(MdapiConfig.doubleUnderscore)) {

                excluded = true;

            }// End if

        }// End if

        return excluded;

    }// End method

    public static isExcludedFile(input: string): boolean {

        let excluded = false;

        MdapiConfig.fileExcludes.forEach((element) => {

            if (element === input) {

                excluded = true;

                // Break inner loop

            }// End if

        });

        return excluded;

    }// End method

    public static isExcludedDirectory(input: string): boolean {

        let excluded = false;

        MdapiConfig.directoryExcludes.forEach((element) => {

            if (element === input) {

                excluded = true;

                // Break inner loop

            }// End if

        });

        return excluded;

    }// End method

    public static isUnsupportedMetaType(metaType: string): boolean {

        for (let x = 0; x < MdapiConfig.unsupportedMetadataTypes.length; x++) {

            let unsupportedMetadataType: string = MdapiConfig.unsupportedMetadataTypes[x];

            if (unsupportedMetadataType === metaType) {

                return true;

            }// End if

        }// End for

        return false;

    }// End method

    public static isPackage1MetaType(metaType: string): boolean {

        for (let x = 0; x < MdapiConfig.package1MetaTypes.length; x++) {

            let package1MetaType: string = MdapiConfig.package1MetaTypes[x];

            // console.error(metaType + ' ' + package1MetaType + ' ' + package1MetaType === metaType);

            if (package1MetaType === metaType) {

                return true;

            }// End if

        }// End for

        return false;

    }// End method

    protected static isHiddenOrNonEditableInstalledMetaType(metadataType: string): boolean {

        if (!metadataType) {

            return false;

        }
        for (let x = 0; x < MdapiConfig.hiddenOrNonEditableInstalledMetaTypes.length; x++) {

            let hiddenMetaType: string = MdapiConfig.hiddenOrNonEditableInstalledMetaTypes[x];

            if (hiddenMetaType === metadataType) {

                return true;

            }// End if

        }// End for

        return false;

    }// End method

    protected static isHiddenOrNonEditable(metaItem: FileProperties): boolean {

        if (metaItem && metaItem.manageableState &&
            metaItem.manageableState === MdapiConfig.installed) {

            return MdapiConfig.isHiddenOrNonEditableInstalledMetaType(metaItem.type);

        }// End if

        return false;

    }// End method

    public static ignoreHiddenOrNonEditable(settings: ISettings, metaItem: FileProperties): boolean {

        if (!settings.ignoreHiddenOrNonEditable) {

            return false;

        }

        return MdapiConfig.isHiddenOrNonEditable(metaItem);

    }// End method

    protected static isIgnoreNamespaces(metaItem: FileProperties): boolean {

        return metaItem.namespacePrefix &&
            metaItem.namespacePrefix !== null &&
            metaItem.namespacePrefix !== MdapiCommon.BLANK; // Pi or Finserv etc

    }// End method

    public static ignoreNamespaces(settings: ISettings, metaItem: FileProperties): boolean {

        if (!settings.ignoreNamespaces) {

            return false;

        }

        return MdapiConfig.isIgnoreNamespaces(metaItem);

    }// End method

    protected static isIgnoreInstalled(metaItem: FileProperties): boolean {

        return metaItem.manageableState &&
            metaItem.manageableState === MdapiConfig.installed;

    }// End method

    public static ignoreInstalled(settings: ISettings, metaItem: FileProperties): boolean {

        if (!settings.ignoreInstalled) {

            return false;

        }// End if

        return MdapiConfig.isIgnoreInstalled(metaItem);

    }// End method

    public static toSortedMembers(fileProperties: Array<FileProperties>): Array<string> {

        let members: Array<string> = [];

        for (let x = 0; fileProperties && x < fileProperties.length; x++) {

            let fileProps: FileProperties = fileProperties[x];

            members.push(fileProps.fullName);

        }// End for

        return members.sort();

    }// End method

    /**
     * Used to setup additional metadata types e.g. Folders (ReportFolder) and Children (e.g. CustomField)
     * @param config
     * @param metaTypeNameArray
     */
    public static describeMetadataArray(config: IConfig, metaTypeNameArray: Array<string>) {

        for (let x = 0; x < metaTypeNameArray.length; x++) {

            let metaTypeName: string = metaTypeNameArray[x];

            config.metadataTypes.push(metaTypeName);
            config.metadataObjectMembersLookup[metaTypeName] = [];
            // There is no specific directory for other types e.g. customfield for mdapi

            config.metadataObjectLookup[metaTypeName] = <DescribeMetadataObject>
                {
                    "directoryName": MdapiConfig.childMetadataDirectoryLookup[metaTypeName],
                    "inFolder": false,
                    "metaFile": false,
                    "suffix": null,
                    "xmlName": metaTypeName,
                    "childXmlNames": null
                };

        }// End for

    }// End method

    public static describeMetadataFile(result: DescribeMetadataResult): void {

        if (!existsSync(MdapiCommon.configRoot)) {

            mkdirSync(MdapiCommon.configRoot);

        }// End if
        let describeMetadataJsonPath: string = MdapiCommon.configRoot + MdapiCommon.PATH_SEP + MdapiConfig.describeMetadataJson;

        MdapiCommon.jsonToFile(
            result,
            describeMetadataJsonPath
        );

    }// End method

    /**
     * DescribeMetadata will populate config variables based on describe results
     *
     * @param org
     * @param config
     * @param settings
     */
    public static async describeMetadata(org: Org, config: IConfig, settings: ISettings): Promise<void> {

        return new Promise((resolve, reject) => {

            org.getConnection().metadata.describe(settings.apiVersion).then(
                (result: DescribeMetadataResult) => {

                    try {

                        MdapiConfig.describeMetadataFile(result);

                        let metadataObjects: Array<DescribeMetadataObject> = MdapiCommon.objectToArray(result.metadataObjects);

                        config.metadataObjects = metadataObjects;

                        for (let x = 0; x < metadataObjects.length; x++) {

                            let metadataObject: DescribeMetadataObject = metadataObjects[x],
                                metaTypeName: string = metadataObject.xmlName,
                                { directoryName } = metadataObject;

                            if (MdapiConfig.isUnsupportedMetaType(metaTypeName)) {
                                continue;
                            }

                            if (settings.ignoreStaticResources && metaTypeName === MdapiConfig.StaticResource) {
                                continue;
                            }// End if

                            if (settings.ignoreFolders && metadataObject.inFolder) {
                                continue;
                            }// End if

                            config.metadataTypes.push(metaTypeName);
                            config.metadataObjectMembersLookup[metaTypeName] = [];
                            config.metadataObjectLookup[metaTypeName] = metadataObject;

                            // Set directory lookup
                            let lookupArray: Array<DescribeMetadataObject> = config.metadataDirectoryLookup[directoryName];

                            if (!lookupArray) {

                                lookupArray = [];

                            }// End if init array
                            lookupArray.push(metadataObject);
                            config.metadataDirectoryLookup[directoryName] = lookupArray;

                            // Setup folders
                            if (metadataObject.inFolder) {

                                let metaTypeFolderName: string = MdapiConfig.metadataTypeFolderLookup[metaTypeName];

                                config.metadataFolders.push(metaTypeFolderName); // E.g. ReportFolder

                            }// End if

                            // Setup child metadata
                            if (metadataObject.childXmlNames) {

                                metadataObject.childXmlNames = MdapiCommon.objectToArray(metadataObject.childXmlNames);

                                for (let y = 0; y < metadataObject.childXmlNames.length; y++) {

                                    let childXmlName = metadataObject.childXmlNames[y];

                                    if (MdapiConfig.isUnsupportedMetaType(childXmlName)) {
                                        continue;
                                    }
                                    config.metadataTypeChildren.push(childXmlName);

                                }// End for

                            }// End if

                        }// End for

                        MdapiConfig.describeMetadataArray(
                            config,
                            config.metadataFolders
                        );

                        MdapiConfig.describeMetadataArray(
                            config,
                            config.metadataTypeChildren
                        );

                        config.metadataTypeChildren.forEach((childmetaType: string) => {

                            let childMetadataObject = config.metadataObjectLookup[childmetaType],
                                childDirectoryName: string = MdapiConfig.childMetadataDirectoryLookup[childmetaType],
                                lookupArray: Array<DescribeMetadataObject> = config.metadataDirectoryLookup[childDirectoryName];

                            if (!lookupArray) {

                                lookupArray = [];

                            }// End if init array
                            lookupArray.push(childMetadataObject);
                            config.metadataDirectoryLookup[childDirectoryName] = lookupArray;

                        });

                        config.metadataTypes.sort();

                        resolve();

                    } catch (exception) {
                        console.error('describeMetadata exception occurred: ' + exception);
                        reject(exception);
                    }// End catch

                },
                (error: any) => {
                    console.error('describeMetadata error occurred: ' + error);
                    reject(error);
                }
            );// End describe

        });// End promise

    }// End method

    /**
     * Set StandardValueSets names list not queryable
     * https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/standardvalueset_names.htm
     * @param config
     */
    public static setStandardValueSets(config: IConfig): void {

        for (let x = 0; x < MdapiConfig.standardValueSets.length; x++) {

            config.metadataObjectMembersLookup[MdapiConfig.StandardValueSet].push(<FileProperties>
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
                    "namespacePrefix": null
                });

        }// End for

    }// End method

    /**
     * Queries and includes ommitted RecordTypes into config
     * @param org
     * @param config
     */
    public static async resolvePersonAccountRecordTypes(org: Org, config: IConfig): Promise<void> {

        return new Promise((resolve, reject) => {

            org.getConnection().query("SELECT DeveloperName, SobjectType, IsPersonType FROM RecordType " +
                " WHERE SobjectType = 'Account' AND IsPersonType = true").
                then(
                    (result: QueryResult<any>) => {

                        if (result.records) {

                            for (let x = 0; x < result.records.length; x++) {

                                let record: object = result.records[x],
                                    personRecordType: string = MdapiConfig.PersonAccount + MdapiCommon.DOT + record[MdapiConfig.DeveloperName];

                                config.metadataObjectMembersLookup[MdapiConfig.RecordType].push(<FileProperties>{
                                    "type": MdapiConfig.RecordType,
                                    "createdById": null,
                                    "createdByName": null,
                                    "createdDate": null,
                                    "fileName": null,
                                    "fullName": personRecordType,
                                    "id": null,
                                    "lastModifiedById": null,
                                    "lastModifiedByName": null,
                                    "lastModifiedDate": null,
                                    "manageableState": null,
                                    "namespacePrefix": null
                                }// End push
                                );

                            }// End for

                        }// End if
                        resolve();

                    },
                    (error: any) => {

                        if (error && error instanceof Object) {

                            let errorString: string = JSON.stringify(error);

                            if (errorString.includes(MdapiConfig.INVALID_FIELD)) {

                                console.log("ignoring person accounts not activated in org");
                                resolve();

                                return;

                            }// End if

                        }// End if
                        reject(error);

                    }
                );

        });// End promise

    }// End method

    /**
     * RepositionSettings at end in prep for package.xml creation
     * @param config
     */
    public static repositionSettings(config: IConfig): void {

        let found = false;

        for (let x = 0; x < config.metadataTypes.length; x++) {

            if (config.metadataTypes[x] === MdapiConfig.Settings) {

                config.metadataTypes.splice(
                    x,
                    1
                );
                found = true;
                break;

            }// End if

        }// End if
        if (found) {

            config.metadataTypes.push(MdapiConfig.Settings);

        }// End if

    }// End method

    public static getMetadataNameFromCurrentDirectory(parentDirectory: string): string {

        let segments: Array<string> = parentDirectory.split(path.sep);

        return segments[segments.length - 1]; //  One up

    }// End method

    public static getMetadataNameFromParentDirectory(parentDir: string): string {

        let segments: Array<string> = parentDir.split(path.sep);

        return segments[segments.length - 2]; // Two up

    }// End method

    public static isolateMetadataObjectName(fileName: string): string {

        if (fileName.endsWith(MdapiConfig.metaXmlSuffix)) {

            fileName = fileName.replace(
                MdapiConfig.metaXmlSuffix,
                MdapiCommon.BLANK
            );

        }// End if

        let items: Array<string> = fileName.split(MdapiCommon.DOT);

        if (items.length > 1) {

            items.splice(
                items.length - 1,
                1
            );

        }// End if

        return MdapiCommon.join(
            items,
            MdapiCommon.DOT
        );

    }// End method

    public static createCsvFile(config: IConfig, packageCsvPath: string, orgAlias: string): void {

        let csvContent: string;

        csvContent = `Key,Type,Name,Alias\n`;

        for (let x = 0; x < config.metadataTypes.length; x++) {

            let metaType: string = config.metadataTypes[x];

            if (config.metadataObjectMembersLookup[metaType].length === 0) {
                // if no entry continue
                continue;
            }

            let metaItems: Array<FileProperties> = config.metadataObjectMembersLookup[metaType],
                sortedMembers: Array<string> = MdapiConfig.toSortedMembers(metaItems);

            for (let y = 0; y < sortedMembers.length; y++) {

                let item: string = MdapiConfig.patchMetaItemNameCsv(metaType, sortedMembers[y]);

                csvContent += `${metaType}-${item},${metaType},${item},${orgAlias}\n`;

            }// End for

        }// End for

        writeFileSync(
            packageCsvPath,
            csvContent
        );

    }// End function

    public static patchMetaItemNameCsv (metaType:string, name: string) 
    {
        if (metaType === MdapiConfig.CustomIndex) 
        {
            return name.replace(/,/g, ";");
        }
        return name;
    }

    public static createPackageFile(config: IConfig, settings: ISettings, packageXmlPath: string): void {

        let xmlContent: string = this.packageXmlHeader();

        // MdapiConfig.repositionSettings(config);

        for (let x = 0; x < config.metadataTypes.length; x++) {

            let metaType: string = config.metadataTypes[x];

            if (config.metadataObjectMembersLookup[metaType].length === 0) {
                // if no entry continue
                continue;
            }

            if (packageXmlPath.endsWith(this.packageXml)) {
                // do nothing carry on
            }
            else if (packageXmlPath.endsWith(this.package1Xml)) {
                if (MdapiConfig.isPackage1MetaType(metaType) === false) {
                    continue;
                }
            }
            else if (packageXmlPath.endsWith(this.package2Xml)) {
                if (MdapiConfig.isPackage1MetaType(metaType) === true) {
                    continue;
                }
            }

            let metaItems: Array<FileProperties> = config.metadataObjectMembersLookup[metaType],
                sortedMembers: Array<string> = MdapiConfig.toSortedMembers(metaItems);

            xmlContent += `${MdapiCommon.TWO_SPACE}<types>\n`;

            for (let y = 0; y < sortedMembers.length; y++) {

                let item: string = sortedMembers[y];

                xmlContent += `${MdapiCommon.FOUR_SPACE}<members>${item}</members>\n`;

            }// End for

            xmlContent += `${MdapiCommon.FOUR_SPACE}<name>${metaType}</name>\n`;
            xmlContent += `${MdapiCommon.TWO_SPACE}</types>\n`;

        }// End for

        xmlContent += `${MdapiCommon.TWO_SPACE}<version>${settings.apiVersion}</version>\n`;
        xmlContent += this.packageXmlFooter();

        writeFileSync(
            packageXmlPath,
            xmlContent
        );

    }// End function

    public static getMetadataObjectFromDirectoryName(config: IConfig, directoryName: string, metaFile?: string): DescribeMetadataObject {

        let metadataObjects: Array<DescribeMetadataObject> = MdapiCommon.objectToArray(config.metadataDirectoryLookup[directoryName]);

        if (metadataObjects.length === 1) {

            return metadataObjects[0]; // If one only return one

        }// End if
        for (let x = 0; x < metadataObjects.length; x++) {

            let metaObject: DescribeMetadataObject = metadataObjects[x];

            if (metaObject.suffix && (metaFile.endsWith(metaObject.suffix) ||
                metaFile.endsWith(metaObject.suffix + MdapiConfig.metaXmlSuffix))) { // E.g. for moderation different types

                return metaObject;

            }// End if

        }// End for

        return null; // Try to resolve as next step

    }// End method

    public static getMetadataObjectFromFileExtension(config: IConfig, metaFile: string): DescribeMetadataObject {

        let metadataObjects: Array<DescribeMetadataObject> = MdapiCommon.objectToArray(config.metadataObjects);

        for (let x = 0; x < metadataObjects.length; x++) {

            let metaObject: DescribeMetadataObject = metadataObjects[x];
            // May require additional checks


            if (metaObject.suffix && metaFile.endsWith(metaObject.suffix)) { // E.g. for moderation different types

                return metaObject;

            }// End if

        }// End for

        return null; // Try to resolve as next ste

    }// End method

    public static createConfig(): IConfig {

        return <IConfig>{
            "metadataTypes": [],
            "metadataFolders": [],
            "metadataTypeChildren": [],
            "metadataObjectLookup": {},
            "metadataObjectMembersLookup": {},
            "metadataDirectoryLookup": {},
            "metadataObjects": [],
            "sourceFileTotal": 0,
            "targetFileTotal": 0,
            "sourceFileIgnored": 0,
            "targetFileIgnored": 0,
            "sourceFileProcessed": 0,
            "targetFileProcessed": 0
        };

    }// End method

    public static createSettings(): ISettings {

        return <ISettings>{
            "ignoreHiddenOrNonEditable": false,
            "ignoreInstalled": false,
            "ignoreNamespaces": false,
            "ignoreStaticResources": false,
            "ignoreFolders": false,
            "apiVersion": null
        };

    }// End method

    public static async unzipUnpackaged(zipFilePath: string, targetDirectoryUnpackaged: string): Promise<any> {

        return new Promise((resolve, reject) => {

            yauzl.open(
                zipFilePath,
                { "lazyEntries": true },
                (openErr, zipfile) => {

                    if (openErr) {

                        reject(openErr);

                        return;

                    }// End if

                    zipfile.readEntry();

                    zipfile.once(
                        "close",
                        () => {
                            resolve(null);
                        }
                    );// End close

                    zipfile.on(
                        "entry",
                        (entry: any) => {

                            zipfile.openReadStream(
                                entry,
                                (unzipErr, readStream) => {

                                    if (unzipErr) {

                                        return reject(unzipErr);

                                    }// End if
                                    else if ((/\/$/).test(entry.fileName)) { // Read directory

                                        zipfile.readEntry();

                                        return;

                                    }// End else if
                                    let outputDir = path.join(
                                        targetDirectoryUnpackaged,
                                        path.dirname(entry.fileName)
                                    ),
                                        outputFile = path.join(
                                            targetDirectoryUnpackaged,
                                            entry.fileName
                                        );

                                    mkdirp(
                                        outputDir,
                                        (mkdirErr: any) => {

                                            if (mkdirErr) {

                                                reject(mkdirErr);

                                                return;

                                            }// End if
                                            readStream.pipe(createWriteStream(outputFile));
                                            readStream.on(
                                                "end",
                                                () => {

                                                    zipfile.readEntry();

                                                }
                                            );

                                        }
                                    ); // End mkdirp

                                }
                            ); // End open stream

                        }
                    ); // End on

                }
            ); // End open

        }); // End promise

    }// End method

    public static async querylistMetadata(org: Org, metadataType: string, config: IConfig, settings: ISettings): Promise<void> {

        return new Promise((resolve, reject) => {

            let metaQueries: Array<ListMetadataQuery> = [{ "type": metadataType }];

            org.getConnection().metadata.list(
                metaQueries,
                settings.apiVersion
            ).then(
                (result: Array<FileProperties>) => {

                    result = MdapiCommon.objectToArray(result);

                    for (let x = 0; x < result.length; x++) {

                        let metaItem: FileProperties = result[x];

                        config.metadataObjectMembersLookup[metadataType].push(metaItem);

                    }// End for

                    resolve();

                },
                (error: any) => {

                    reject(error);

                }
            );// End promise

        });

    }// End method

    public static inspectMdapiFile(
        position: RelativePosition, config: IConfig, filePath: string,
        parentDirectory: string, metaRegister: Record<string, DiffRecord>
    ): void {

        let fileName: string = MdapiCommon.isolateLeafNode(filePath), // Account.meta-object.xml
            directory: string = MdapiCommon.isolateLeafNode(parentDirectory), // Objects or Folder
            memberName: string = MdapiConfig.isolateMetadataObjectName(fileName), // Account (package.xml)
            anchorName: string = directory, // 'default e.g. objects but can be overwritten for folders e.g. reports
            folderXml = false;

        if (position === RelativePosition.Source) {

            config.sourceFileTotal++;

        } // End if
        else if (position === RelativePosition.Target) {

            config.targetFileTotal++;

        }// End else if

        // Don't process top level directories (from excluded list)
        if (MdapiConfig.isExcludedDirectory(directory) ||
            MdapiConfig.isExcludedFile(fileName)) {

            if (position === RelativePosition.Source) {

                config.sourceFileIgnored++;

            } // End if
            else if (position === RelativePosition.Target) {

                config.targetFileIgnored++;

            }// End else if

            return; // Ignore

        }// End if

        // Let metadataObject: MetadataObject = MdapiConfig.getMetadataObjectFromFileExtension(config, fileName);
        let metadataObject = MdapiConfig.getMetadataObjectFromDirectoryName(
            config,
            directory,
            fileName
        );

        if (MdapiConfig.isExcludedNamespaceFile(
            fileName,
            metadataObject
        )) {

            if (position === RelativePosition.Source && existsSync(filePath)) {

                // Don't want to include in src deploy pacakge and there is src.backup
                unlinkSync(filePath);

            }// End if
            if (position === RelativePosition.Source) {

                config.sourceFileIgnored++;

            } // End if
            else if (position === RelativePosition.Target) {

                config.targetFileIgnored++;

            }// End else if

            return; // Ignore

        }// End if

        // Init root check required to exclude from destructive changes
        if (MdapiConfig.isFolderRootDirectory(directory)) {

            folderXml = true;

        } // E.g. reports cannot reside in root

        // Check for unresolve type
        if (!metadataObject) { // If null attempt to resolve

            // One folder up
            let metadataParentName = MdapiConfig.getMetadataNameFromParentDirectory(parentDirectory),
                metadataCurrentName = MdapiConfig.getMetadataNameFromCurrentDirectory(parentDirectory);

            // Special handle for bundles e.g. lwc aura
            if (MdapiConfig.isBundleDirectory(metadataParentName)) {

                metadataObject = MdapiConfig.getMetadataObjectFromDirectoryName(
                    config,
                    metadataParentName
                );
                anchorName = metadataObject.directoryName + MdapiCommon.PATH_SEP + directory; // E.g. lwc/MyComponent
                memberName = metadataCurrentName; // E.g. MyComponent

            }// End else if
            // Special handle for folder types (direct)
            else if (MdapiConfig.isFolderRootDirectory(metadataParentName)) {

                metadataObject = MdapiConfig.getMetadataObjectFromDirectoryName(
                    config,
                    metadataParentName
                );
                anchorName = metadataObject.directoryName + MdapiCommon.PATH_SEP + metadataCurrentName;
                memberName = metadataCurrentName + MdapiCommon.PATH_SEP + MdapiConfig.isolateMetadataObjectName(fileName);
                folderXml = MdapiConfig.isFolderXmlFile(filePath);

            }// End else if
            else if (MdapiConfig.isTerritory2ModelsDirectory(metadataParentName)) {

                metadataObject = MdapiConfig.getMetadataObjectFromDirectoryName(
                    config,
                    metadataParentName,
                    fileName
                );
                anchorName = metadataObject.directoryName + MdapiCommon.PATH_SEP + metadataCurrentName;
                memberName = metadataCurrentName;

            }// End else if
            else {

                /*
                 * Handle nested folders (e.g. dashboards e.g. dashboards\Service_Dashboard\Manager_Dashboard\...)
                 * Check if contains nested folder in filepath (e.g. report and dashboard nested folders)
                 */
                metadataParentName = MdapiConfig.resolveIfAncestorIsFolderDirectory(filePath);

                if (metadataParentName) {

                    metadataObject = MdapiConfig.getMetadataObjectFromDirectoryName(
                        config,
                        metadataParentName
                    );
                    // AnchorName = (metadataObject.directoryName + MdapiCommon.PATH_SEP + metadataCurrentName);
                    anchorName = metadataObject.directoryName + MdapiCommon.PATH_SEP +
                        MdapiConfig.extractAncestorDirectoryPath(
                            filePath,
                            metadataParentName
                        );
                    // Immediate relative folder per package.xml
                    memberName = metadataCurrentName + MdapiCommon.PATH_SEP + MdapiConfig.isolateMetadataObjectName(fileName);
                    folderXml = MdapiConfig.isFolderXmlFile(filePath);

                } else {

                    // Potentially Fatal event (log warning - could be significant diff between environments or reduced subset of metadata)
                    console.warn(`unexpected metatype found at parent directory: ${parentDirectory
                        } please check metaobject definitions are up to date - unresolved file path: ${filePath}`);
                    return; // return

                }

            }// End else

        }// End if

        // Without extension for comparison later may not be unique (e.g. a pair)
        let memberKey: string = anchorName + MdapiCommon.PATH_SEP + memberName,
            relativeFilePath: string = anchorName + MdapiCommon.PATH_SEP + fileName;

        // Saftey check
        if (!fileName || !anchorName || !metadataObject) {

            // Fatal
            console.error(
                "unexpected unresolved metaobject - key: ",
                `${memberKey
                } (filename: ${fileName}) anchorName: (${anchorName}), ` +
                ` parentdirectory: ${parentDirectory}, metadataobject: ${metadataObject}`
            );
            throw "unresolved metadataObject";

        }// End if

        let fileContents: string = readFileSync(
            filePath,
            'utf8'
        ),
            stats: Stats = statSync(filePath),

            diffRecord: DiffRecord = <DiffRecord>{
                memberKey, // E.g. objects/Account
                memberName, // E.g. Account (as it appears in the package.xml)
                filePath, // Full file path
                "fileHash": MdapiCommon.hashCode(fileContents), // Only hash as contents is large
                directory, // Sfdx directory e.g. triggers
                folderXml,
                "metadataName": metadataObject.xmlName,
                metadataObject,
                "fileSize": stats.size,
                "diffType": DiffType.None,
                "diffSize": 0,
                "fileContent": null,
                "title": null,
                "comment": null
            };

        // Provide clarity in xml comments (name of report or dashboard)
        if (!folderXml && diffRecord.metadataName === MdapiConfig.Report) {

            diffRecord.title = MdapiConfig.extractReportName(filePath);
            diffRecord.comment = diffRecord.title;

        } // End if
        else if (!folderXml && diffRecord.metadataName === MdapiConfig.Dashboard) {

            diffRecord.title = MdapiConfig.extractDashboardTitle(filePath);
            diffRecord.comment = diffRecord.title;

        }// End else if

        // Add new unique entry
        metaRegister[relativeFilePath] = diffRecord;

        /*
         * Console.log('1. memberKey        : ' + memberKey);
         * console.log('2. relativeFilePath : ' + relativeFilePath);
         * console.log('3. memberName       : ' + memberName);
         * console.log('4. directory        : ' + directory);
         * console.log('5. folderXml        : ' + folderXml);
         * console.log(' ');
         */

        if (position === RelativePosition.Source) {

            config.sourceFileProcessed++;

        } // End if

        else if (position === RelativePosition.Target) {

            config.targetFileProcessed++;

        }// End else if

    }// End method

    public static extractReportName(filePath: string): string {

        let jsonObject: object = MdapiCommon.xmlFileToJson(filePath),
            report: Report = jsonObject[MdapiConfig.Report];

        return report.name._text;

    }// End if

    public static extractDashboardTitle(filePath: string): string {

        let jsonObject: object = MdapiCommon.xmlFileToJson(filePath),
            dashboard: Dashboard = jsonObject[MdapiConfig.Dashboard];

        return dashboard.title._text;

    }// End if

    public static isFolderXmlFile(filePath: string): boolean {

        if (!filePath.endsWith(MdapiConfig.metaXmlSuffix)) {

            return false;

        }

        let jsonObject: object = MdapiCommon.xmlFileToJson(filePath);

        if (MdapiConfig.DashboardFolder in jsonObject) {

            return true;

        } else if (MdapiConfig.ReportFolder in jsonObject) {

            return true;

        } else if (MdapiConfig.DocumentFolder in jsonObject) {

            return true;

        } else if (MdapiConfig.EmailFolder in jsonObject) {

            return true;

        }

        return false;

    }// End if

    // Children only present on one side so no compare needed but do list
    public static inspectMetaChildren(config: IConfig, packageDiffRecords: Record<string, Array<DiffRecord>>, parent: DiffRecord): void {

        let childMetaObject: object = MdapiCommon.xmlFileToJson(parent.filePath),
            childXmlNames: Array<string> = MdapiCommon.objectToArray(parent.metadataObject.childXmlNames);

        for (let x = 0; x < childXmlNames.length; x++) {

            let childMetaName: string = childXmlNames[x];

            if (MdapiConfig.isUnsupportedMetaType(childMetaName)) {
                continue;
            }

            let childMetadataObject: DescribeMetadataObject = config.metadataObjectLookup[childMetaName],
                childDirectoryName: string = MdapiConfig.childMetadataDirectoryLookup[childMetaName],
                parentContents: object = childMetaObject[parent.metadataName],
                children: Array<object> = MdapiCommon.objectToArray(parentContents[childDirectoryName]);

            for (let y = 0; y < children.length; y++) {

                let child: object = children[y],
                    memberName: string = parent.memberName + MdapiCommon.DOT + child[MdapiConfig.fullName]._text,
                    memberKey: string = childDirectoryName + MdapiCommon.PATH_SEP + parent.metadataName + MdapiCommon.PATH_SEP + memberName,
                    childString: string = JSON.stringify(child),

                    childItem: DiffRecord = <DiffRecord>{
                        memberKey,
                        memberName,
                        "filePath": parent.filePath + MdapiCommon.PATH_SEP + childMetaName + MdapiCommon.PATH_SEP + memberName,
                        "fileHash": MdapiCommon.hashCode(childString),
                        "directory": childDirectoryName,
                        "folderXml": false,
                        "metadataName": childMetadataObject.xmlName,
                        "metadataObject": childMetadataObject,
                        "fileSize": childString.length,
                        "diffType": parent.diffType,
                        "diffSize": 0,
                        "fileContent": null,
                        "title": null
                    };

                packageDiffRecords[childMetaName].push(childItem);

            }// End for

        }// End for

    }// End method

    public static metadataObjectHasChildren(metadataObject: DescribeMetadataObject): boolean {

        return metadataObject.childXmlNames &&
            MdapiCommon.objectToArray(metadataObject.childXmlNames).length > 0;

    }// End method

    public static initDiffRecordsLookup(config: IConfig, diffRecordsLookup: Record<string, Array<DiffRecord>>): void {

        config.metadataTypes.forEach((metaTypeKey) => {

            diffRecordsLookup[metaTypeKey] = [];

        });// End for

    }// End method

    public static sortDiffRecordTypes(DiffRecords: Record<string, Array<DiffRecord>>): Array<string> {

        let metadataObjectNames: Array<string> = [];

        for (let metadataObjectName in DiffRecords) {

            metadataObjectNames.push(metadataObjectName);

        }// End for

        metadataObjectNames.sort();

        return metadataObjectNames;

    }// End method

    public static packageXmlHeader(): string {

        let xmlContent = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";

        xmlContent += "<Package xmlns=\"http://soap.sforce.com/2006/04/metadata\">\n";

        return xmlContent;

    }// End method

    public static packageXmlFooter(): string {

        let xmlContent = "</Package>\n";

        return xmlContent;

    }// End method

}// End class
