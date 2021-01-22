import {ChangesetExclude} from "../scripts/mdapi-config";

/**
 * @name ChangesetExcludeDefault (see mdapi-changeset-utility)
 * @author brianewardsaunders
 * @date 2019-07-10
 * @date 2020-01-08 updated to more generic list use switch for specific excludes
 */

export class ChangesetExcludeDefault implements ChangesetExclude {

    public directoryExcludes: Array<string> = [
        "profilePasswordPolicies",
        "profileSessionSettings",
        "animationRules",
        "flowDefinitions",
        "reports/unfiled$public",
        "reports/LeadInsightsReports",
        "dashboards/LeadInsightsDashboards",
        "managedContentTypes",
        "managedTopics",
        "audience", // Todo remove here and below
        "campaignInfluenceModels",
        "moderation",
        "navigationMenus",
        "networks",
        "presenceDeclineReasons",
        "presenceUserConfigs",
        "queueRoutingConfigs",
        /*
         * "serviceChannels",
         * "servicePresenceStatuses",
         * "sharingSets",
         * "entitlementProcesses",
         * "milestoneTypes",
         */
        "userCriteria",
        "wave"
    ];

    public fileExcludes: Array<string> = [
        "appMenus/AppSwitcher.appMenu",
        "pathAssistants/Default_Opportunity.pathAssistant"
    ];

}// End class


