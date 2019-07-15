/**
 * @name ChangesetExcludeDefaults (see mdapi-changeset-utility)
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

export class ChangesetExcludeDefaults {

    public static defaultDirectoryExcludeList: Array<string> = [
        "profilePasswordPolicies", // get all kinds of issues with this org specific
        "profileSessionSettings", // get all kinds of issues with this org specific
        "animationRules", // cannot deploy
        "flowDefinitions", // not required
        "reports/LeadInsightsReports", // salesforce sales einstein can't modify
        "dashboards/LeadInsightsDashboards"
    ];

    public static defaultFileExcludeList: Array<string> = [
        "applications/FinServ__BankingConsoleFinancialServicesCloud.app",
        "applications/FinServ__FinancialServicesCloudRetailBanking.app",
        "applications/FinServ__FSC_Lightning.app",
        "applications/FinServ__InsuranceConsoleFinancialServicesCloud.app",
        "appMenus/AppSwitcher.appMenu", // can't migrate AppSwitcher
        "classes/FinServ__MoiConstants.cls", // can't migrate managed package classes
        "classes/FinServ__MoiConstants.cls-meta.xml",
        //these signed certificates can be migrated
        "certs/mulesoft_entities_api_certificate.crt-meta.xml",
        "certs/mulesoft_entities_api_certificate.crt",
        "certs/aw_mulesoft.crt-meta.xml",
        "certs/aw_mulesoft.crt",
        "connectedApps/GitLab.connectedApp", // will differ from org to org manual setup once
        "profiles/B2BMA Integration User.profile", //'B2BMA Integration User': You may not turn off permission Read All RetailVisitTemplate for this License Type
        "pathAssistants/Default_Opportunity.pathAssistant", // has domain hard coded and can't migrate this thing
        //Cannot modify managed object: entity=CustomPermissionSet
        "permissionsets/FinServ__Advisor.permissionset",
        "permissionsets/FinServ__AdvisorPartnerCommunity.permissionset",
        "permissionsets/FinServ__CustomerCommunityReadOnly.permissionset",
        "permissionsets/FinServ__FinancialServicesCloudBasic.permissionset",
        "permissionsets/FinServ__FinancialServicesCloudStandard.permissionset",
        "permissionsets/FinServ__FSCWaveIntegration.permissionset",
        "permissionsets/FinServ__InsuranceAccess.permissionset",
        "permissionsets/FinServ__LendingAssistant.permissionset",
        "permissionsets/FinServ__PersonalBanker.permissionset",
        "permissionsets/FinServ__RelationshipManager.permissionset",
        "permissionsets/FinServ__Teller.permissionset",
        "permissionsets/pi__Pardot.permissionset",
        "permissionsets/pi__Pardot_Connector_User.permissionset",
        "permissionsets/pi__Pardot_Integration_User.permissionset",
        "permissionsets/pi__Sales_Edge.permissionset",
        //static resources from managed packages ignore can't be migrated
        "staticresources/FinServ__industryresources.resource-meta.xml",
        "staticresources/FinServ__industryresources.resource",
        "staticresources/FinServ__wealthresources.resource-meta.xml",
        "staticresources/FinServ__wealthresources.resource",
        "staticresources/pi__EngageAlertsDownload.resource-meta.xml",
        "staticresources/pi__EngageAlertsDownload.resource",
        "staticresources/pi__EngageSalesTools.resource-meta.xml",
        "staticresources/pi__EngageSalesTools.resource",
        "staticresources/pi__EngagementHistory.resource-meta.xml",
        "staticresources/pi__EngagementHistory.resource",
        "staticresources/pi__Error.resource-meta.xml",
        "staticresources/pi__Error.resource",
        "staticresources/pi__LeadDeck.resource-meta.xml",
        "staticresources/pi__LeadDeck.resource",
        "staticresources/pi__LegacyPardot.resource-meta.xml",
        "staticresources/pi__LegacyPardot.resource",
        "staticresources/pi__MarketingActions.resource-meta.xml",
        "staticresources/pi__MarketingActions.resource",
        "staticresources/pi__MicroCampaign.resource-meta.xml",
        "staticresources/pi__MicroCampaign.resource",
        "staticresources/pi__Mobile_Design_Templates.resource-meta.xml",
        "staticresources/pi__Mobile_Design_Templates.resource",
        "staticresources/pi__Outlook.resource-meta.xml",
        "staticresources/pi__Outlook.resource",
        "staticresources/pi__PardotLightningDesignSystem_unversioned.resource-meta.xml",
        "staticresources/pi__PardotLightningDesignSystem_unversioned.resource",
        "staticresources/pi__Promise.resource-meta.xml",
        "staticresources/pi__Promise.resource",
        "staticresources/pi__ProximaNovaSoft.resource-meta.xml",
        "staticresources/pi__ProximaNovaSoft.resource",
        "staticresources/pi__SalesEdgeErrPage.resource-meta.xml",
        "staticresources/pi__SalesEdgeErrPage.resource",
        "staticresources/pi__ckeditorSalesReach.resource-meta.xml",
        "staticresources/pi__ckeditorSalesReach.resource",
        "staticresources/pi__font_awesome_4_2_0.resource-meta.xml",
        "staticresources/pi__font_awesome_4_2_0.resource",
        "staticresources/pi__icon_utility.resource-meta.xml",
        "staticresources/pi__icon_utility.resource",
        "staticresources/pi__jquery_time_ago.resource-meta.xml",
        "staticresources/pi__jquery_time_ago.resource",
        "staticresources/pi__jquery_ui_1_11_1_custom_has_dialog.resource-meta.xml",
        "staticresources/pi__jquery_ui_1_11_1_custom_has_dialog.resource",
        "staticresources/pi__jquery_ui_1_12_1.resource-meta.xml",
        "staticresources/pi__jquery_ui_1_12_1.resource",
        //test community should not be transported
        "sites/testcommunity.site",
        "siteDotComSites/testcommunity1.site",
        "siteDotComSites/testcommunity1.site-meta.xml",
        "moderation/testcommunity.Banned.keywords",
        "moderation/testcommunity.Block_banned_keywords.rule",
        "moderation/testcommunity.Flag_banned.rule",
        "moderation/testcommunity.Freeze_for_frequent_posting.rule",
        "moderation/testcommunity.Replace_banned.rule",
        "moderation/testcommunity.Review_the_first_post.rule",
        "managedTopics/testcommunity.managedTopics",
        "networks/testcommunity.network",
        "networkBranding/cbtestcommunity.networkBranding",
        "networkBranding/cbtestcommunity.networkBranding-meta.xml",
        "profiles/testcommunity Profile.profile",
        "userCriteria/testcommunity.Customer_Members.userCriteria",
        "userCriteria/testcommunity.Members_without_contribution.userCriteria",
        "userCriteria/testcommunity.Partner_and_Customer_members.userCriteria",
        // installed as part of package always causing issues. e.g. the values of chartSummary and/or groupingColumn are not compatible
        "dashboards/Sales_and_Marketing_Dashboards/Best_Practices_Dashboard6.dashboard",
        // used by standard apps
        "contentassets/elliegif1.asset",
        "contentassets/elliegif1.asset-meta.xml",
        "contentassets/online_pay_final.asset",
        "contentassets/online_pay_final.asset-meta.xml"
        /* 
        // default pathAssistant has domain hard coded and can't migrate this thing
        "dashboards/Sales_and_Marketing_Dashboards/Best_Practices_Dashboard6.dashboard",
        "reports/LeadInsightsReports/SampleReportLeadScoreConversion",
        "pathAssistants/Default_Opportunity.pathAssistant-meta.xml", 
        "dashboards/AdviserPerformanceDashboard/Best_Practices_Dashboard611.dashboard",
        "objects/Account/fields/FinServ__ReferredByUser__c.field-meta.xml",
        "objects/Lead/fields/FinServ__ReferredByUser__c.field-meta.xml",
        "objects/Opportunity/fields/FinServ__ReferredByUser__c.field-meta.xml" 
        */
    ];

}// end class
