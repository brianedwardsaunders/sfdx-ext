/**
 * @name MdapiChangesetUtility
 * @author brianewardsaunders 
 * @date 2019-07-10
 */
import { DescribeMetadataResult, MetadataObject, FileProperties } from "jsforce";
import { Org } from "@salesforce/core";

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

export class MdapiConfig {

  public static unpackagedFolder: string = 'unpackaged';
  public static srcFolder: string = 'src';
  public static manifestFolder: string = 'manifest';
  public static unpackagedZip: string = 'unpackaged.zip';
  public static packageXml: string = 'package.xml';

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
  public static ReportFolder: string = 'ReportFolder';
  public static EmailFolder: string = 'EmailFolder';
  public static DocumentFolder: string = 'DocumentFolder';
  public static DashboardFolder: string = 'DashboardFolder';
  public static ManagedTopic: string = 'ManagedTopic';
  public static ApexClass: string = 'ApexClass';
  public static ApexComponent: string = 'ApexComponent';
  public static ApexPage: string = 'ApexPage';
  public static ApexTrigger: string = 'ApexTrigger';
  public static LightningComponentBundle: string = 'LightningComponentBundle';
  public static AuraDefinitionBundle: string = 'AuraDefinitionBundle';
  public static Translation: string = 'Translation';
  public static CustomPermission: string = 'CustomPermission';
  public static CustomLabel: string = 'CustomLabel';
  public static SharingReason: string = 'SharingReason';
  public static CompactLayout: string = 'CompactLayout';
  public static PlatformCachePartition: string = 'PlatformCachePartition';

  public static installed = 'installed';

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
    MdapiConfig.SharingReason
    // check if following should be included 
    // 'CompactLayout', 
    // 'CustomLabel',  
    // 'HomePageComponent',
    // 'CustomSetting 
  ];

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

  public static metadataFolders: Array<string> = [
    MdapiConfig.DashboardFolder,
    MdapiConfig.DocumentFolder,
    MdapiConfig.EmailFolder,
    MdapiConfig.ReportFolder
  ];

  public static metadataTypeFolderLookup: Record<string, string> = {
    "Dashboard": MdapiConfig.DashboardFolder,
    "Document": MdapiConfig.DocumentFolder,
    "EmailTemplate": MdapiConfig.EmailFolder,
    "Report": MdapiConfig.ReportFolder
  };

  public static isUnsupportedMetaType(metaType: string): boolean {
    for (var x: number = 0; x < MdapiConfig.unsupportedMetadataTypes.length; x++) {
      let unsupportedMetadataType: string = MdapiConfig.unsupportedMetadataTypes[x];
      if (unsupportedMetadataType === metaType) { return true; }// end if
    }// end for
    return false;
  }// end method

  public static isHiddenOrNonEditable(metaItem: FileProperties): boolean {

    if ((metaItem && metaItem.manageableState) &&
      (metaItem.manageableState === MdapiConfig.installed)) {
      for (var x: number = 0; x < MdapiConfig.hiddenOrNonEditableInstalledMetaTypes.length; x++) {
        let hiddenMetaType: string = MdapiConfig.hiddenOrNonEditableInstalledMetaTypes[x];
        if (hiddenMetaType === metaItem.type) {
          return true;
        }// end if
      }// end for
    }// end if
    return false;
  }// end method

  public static toSortedMembers(fileProperties: Array<FileProperties>): Array<string> {
    let members: Array<string> = [];
    for (var x: number = 0; (fileProperties && (x < fileProperties.length)); x++) {
      let fileProps: FileProperties = fileProperties[x];
      members.push(fileProps.fullName);
    }
    return members.sort();
  }// end method

}// end class
