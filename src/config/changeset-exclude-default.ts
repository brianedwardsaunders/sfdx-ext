import { ChangesetExclude } from "../scripts/mdapi-config";

/**
 * @name ChangesetExcludeDefault (see mdapi-changeset-utility)
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

export class ChangesetExcludeDefault implements ChangesetExclude {

    public directoryExcludes: Array<string> = [
        "profilePasswordPolicies",
        "profileSessionSettings",
        "animationRules",
        "flowDefinitions",
        "reports/LeadInsightsReports",
        "reports/unfiled$public",
        "dashboards/LeadInsightsDashboards"
    ];
    public fileExcludes: Array<string> = [
        "applications/FinServ__BankingConsoleFinancialServicesCloud.app",
        "applications/FinServ__FinancialServicesCloudRetailBanking.app",
        "applications/FinServ__InsuranceConsoleFinancialServicesCloud.app",
        "applications/FinServ__FSC_Lightning.app",
        "appMenus/AppSwitcher.appMenu",
        "certs/mulesoft_entities_api_certificate.crt-meta.xml",
        "certs/mulesoft_entities_api_certificate.crt",
        "certs/aw_mulesoft.crt-meta.xml",
        "certs/aw_mulesoft.crt",
        "connectedApps/GitLab.connectedApp",
        "profiles/B2BMA Integration User.profile",
        "pathAssistants/Default_Opportunity.pathAssistant",
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
        "dashboards/Sales_and_Marketing_Dashboards/Best_Practices_Dashboard6.dashboard",
        "contentassets/elliegif1.asset",
        "contentassets/elliegif1.asset-meta.xml",
        "contentassets/online_pay_final.asset",
        "contentassets/online_pay_final.asset-meta.xml"
    ];

}// end class



























