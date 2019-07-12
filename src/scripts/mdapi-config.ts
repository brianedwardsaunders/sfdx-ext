/**
 * @name MdapiChangesetUtility
 * @author brianewardsaunders 
 * @date 2019-07-10
 */
import { DescribeMetadataResult, MetadataObject, FileProperties, QueryResult } from "jsforce";
import { Org } from "@salesforce/core";
import { Common } from "./common";

export interface IConfig {
  metadataTypes: Array<string>; // e.g. ['ApexClass', 'CustomObjet'] // from describeMetada also acts a key index for metadataObjectLookup and metadataObjectMembersLookup
  metadataFolders: Array<string>;  // e.g. ['ReportFolder', 'DocumentFolder'] // don't exist so inject
  metadataTypeChildren: Array<string>; // e.g. ['CustomField']; // exist only within childXmlNames
  metadataObjectLookup: Record<string, MetadataObject>; // e.g. {'ApexClass, Array<MetadataObject>} quick lookup to object based on meta type name
  metadataObjectMembersLookup: Record<string, Array<FileProperties>>; // e.g. {'ApexClass', Array<FileProperties>} where files are members 
};

export interface ISettings {
  ignoreHiddenOrNonEditable: boolean;
  ignoreInstalled: boolean;
  ignoreNamespaces: boolean;
  ignoreStaticResources: boolean;
  ignoreFolders: boolean;
  apiVersion: string;
}

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
  public static DeveloperName: string = 'DeveloperName';

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
    "EmailTemplate": MdapiConfig.EmailFolder, // does not follow typical name and folder convention
    "Report": MdapiConfig.ReportFolder
  };

  public static isUnsupportedMetaType(metaType: string): boolean {
    for (var x: number = 0; x < MdapiConfig.unsupportedMetadataTypes.length; x++) {
      let unsupportedMetadataType: string = MdapiConfig.unsupportedMetadataTypes[x];
      if (unsupportedMetadataType === metaType) { return true; }// end if
    }// end for
    return false;
  }// end method

  protected static isHiddenOrNonEditable(metaItem: FileProperties): boolean {

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

  public static ignoreHiddenOrNonEditable(settings: ISettings, metaItem: FileProperties): boolean {

    if (!settings.ignoreHiddenOrNonEditable) { return false; }
    return MdapiConfig.isHiddenOrNonEditable(metaItem);

  }// end method

  protected static isIgnoreNamespaces(metaItem: FileProperties): boolean {

    return (metaItem.namespacePrefix && (metaItem.namespacePrefix !== null) &&
      (metaItem.namespacePrefix !== '')); // pi or Finserv etc

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
    for (var x: number = 0; (fileProperties && (x < fileProperties.length)); x++) {
      let fileProps: FileProperties = fileProperties[x];
      members.push(fileProps.fullName);
    }
    return members.sort();
  }// end method

  /**
   * used to setup additional metadata types e.g. Folders (ReportFolder) and Children (e.g. CustomField)
   * @param config 
   * @param metaTypeNameArray 
   */
  public static describeMetadataArray(config: IConfig, metaTypeNameArray: Array<string>) {

    for (var x: number = 0; x < metaTypeNameArray.length; x++) {

      let metaTypeName: string = metaTypeNameArray[x];
      config.metadataTypes.push(metaTypeName);
      config.metadataObjectMembersLookup[metaTypeName] = [];

      config.metadataObjectLookup[metaTypeName] = (<MetadataObject>
        {
          directoryName: null,
          inFolder: false,
          metaFile: false,
          suffix: null,
          xmlName: metaTypeName,
          childXmlNames: null
        });
    }// end for

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

        let metadataObjects: Array<MetadataObject> = result.metadataObjects;

        for (var x: number = 0; x < metadataObjects.length; x++) {

          let metadataObject: MetadataObject = metadataObjects[x];
          let metaTypeName: string = metadataObject.xmlName;

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

          if (metadataObject.inFolder) {
            let metaTypeFolderName: string = MdapiConfig.metadataTypeFolderLookup[metaTypeName];
            config.metadataFolders.push(metaTypeFolderName); // e.g. ReportFolder
          }// end if

          if (metadataObject.childXmlNames && (metadataObject.childXmlNames instanceof Array)) {

            for (var y: number = 0; y < metadataObject.childXmlNames.length; y++) {
              let childXmlName = metadataObject.childXmlNames[y];
              if (MdapiConfig.isUnsupportedMetaType(childXmlName)) { continue; }
              config.metadataTypeChildren.push(childXmlName);
            }// end for

          }// end if

        }// end for

        MdapiConfig.describeMetadataArray(config, config.metadataFolders);

        MdapiConfig.describeMetadataArray(config, config.metadataTypeChildren);

        config.metadataTypes.sort();

        resolve();

      }, (error: any) => {
        reject(error);
      });// end describe

    });// end promise

  }// end method

  /**
   * set StandardValueSets not queryable  
   * https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/standardvalueset_names.htm
   * @param config 
   */
  public static setStandardValueSets(config: IConfig): void {

    for (var x: number = 0; x < MdapiConfig.standardValueSets.length; x++) {
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
  public static async resolvePersonAccountRecordTypes(org: Org, config: IConfig): Promise<any> {

    return new Promise((resolve, reject) => {

      org.getConnection().query("SELECT DeveloperName, SobjectType, IsPersonType FROM RecordType " +
        " WHERE SobjectType = 'Account' AND IsPersonType = true").then((result: QueryResult<any>) => {

          if (result.records) {

            for (var x: number = 0; x < result.records.length; x++) {

              let record: Object = result.records[x];
              let personRecordType: string = (MdapiConfig.PersonAccount + Common.DOT + record[MdapiConfig.DeveloperName]);

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
    for (var x: number = 0; x < config.metadataTypes.length; x++) {
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

}// end class
