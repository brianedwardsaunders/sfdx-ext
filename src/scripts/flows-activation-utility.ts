/**
 * @name FlowsActivationUtility (activate or deactivate)
 * @author brianewardsaunders
 * @date 2019-07-10
 */

import {
    existsSync, mkdirSync, readdirSync, removeSync, rename, unlinkSync
} from "fs-extra";
import {
    FileProperties, ListMetadataQuery, QueryResult
} from "jsforce";

import {Org} from "@salesforce/core";
import {UX} from "@salesforce/command";
import {IConfig, ISettings, MdapiConfig} from "./mdapi-config";
import {MdapiCommon} from "./mdapi-common";
import path = require("path");

export interface Flow {
    flowId: string,
    flowDefinitionId: string;
    developerName: string;
    versionNumber: number;
    status: string; // 'Active' | 'Draft' | 'Obsolete' | 'InvalidDraft';
}

export class FlowsActivationUtility {

    constructor (
        protected org: Org,
        protected ux: UX,
        protected orgAlias: string,
        protected apiVersion: string,
        protected deactivate: boolean
    ) {
        // Noop
    }// End constructor

    protected includedFlows: Record<string, Flow> = {};

    protected ignoredFlows: Record<string, Flow> = {};

    // Define working folders
    protected stageOrgAliasDirectoryPath: string = (MdapiCommon.stageRoot + MdapiCommon.PATH_SEP + this.orgAlias);

    protected retrievePath: string = (this.stageOrgAliasDirectoryPath + MdapiCommon.PATH_SEP + MdapiCommon.retrieveRoot);

    protected zipFilePath: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip);

    protected targetDirectoryUnpackaged: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedFolder);

    protected targetDirectorySource: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);

    protected manifestDirectory: string = (this.stageOrgAliasDirectoryPath + MdapiCommon.PATH_SEP + MdapiConfig.manifestFolder);

    protected filePackageXmlPath = (this.manifestDirectory + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);

    protected config: IConfig;

    protected settings: ISettings;

    protected async retrieveMetadata (): Promise<any> {

        this.ux.log(`retrieve directory ${this.retrievePath}`);

        return new Promise((resolve, reject) => {

            if (existsSync(this.retrievePath)) {

                removeSync(this.retrievePath);

            }// End if

            mkdirSync(this.retrievePath);

            let retrieveCommand = `sfdx force:mdapi:retrieve -s -k ${this.filePackageXmlPath
            } -r ${this.retrievePath} -w -1 -u ${this.orgAlias}`;

            MdapiCommon.command(retrieveCommand).then(
                (result: any) => {

                    this.ux.log(result);
                    resolve();

                },
                (error: any) => {

                    this.ux.error(error);
                    reject(error);

                }
            );

        }); // End promise

    }// End method

    protected packageFile (): void {

        if (!existsSync(this.manifestDirectory)) {

            mkdirSync(this.manifestDirectory);
            this.ux.log(`created manifest directory ${this.manifestDirectory}`);

        }// End if

        MdapiConfig.createPackageFile(
            this.config,
            this.settings,
            this.filePackageXmlPath
        );

    }// End method

    protected init (): void {

        // Setup config and setting properties
        this.config = MdapiConfig.createConfig();
        this.settings = MdapiConfig.createSettings();

        this.settings.apiVersion = this.apiVersion;

        if (!existsSync(MdapiCommon.stageRoot)) {

            mkdirSync(MdapiCommon.stageRoot);
            this.ux.log(`staging ${MdapiCommon.stageRoot} directory created`);

        }// End if

        // Check if working directory exists
        if (!existsSync(this.stageOrgAliasDirectoryPath)) {

            mkdirSync(this.stageOrgAliasDirectoryPath);
            this.ux.log(`staging alias ${this.stageOrgAliasDirectoryPath} directory created`);

        }// End if

    }// End method

    protected async unzip (): Promise<any> {

        if (existsSync(this.targetDirectorySource)) {

            removeSync(this.targetDirectorySource);

        }// End if

        await MdapiConfig.unzipUnpackaged(
            this.zipFilePath,
            this.targetDirectoryUnpackaged
        );

        if (existsSync(this.zipFilePath)) {

            unlinkSync(this.zipFilePath);

        }// End if

        await rename(
            this.targetDirectoryUnpackaged,
            this.targetDirectorySource
        );

    }// End method

    protected async querylistMetadata (metadataType: string): Promise<void> {

        return new Promise((resolve, reject) => {

            let metaQueries: Array<ListMetadataQuery> = [{"type": metadataType}];

            this.org.getConnection().metadata.list(
                metaQueries,
                this.apiVersion
            ).then(
                (result: Array<FileProperties>) => {

                    result = MdapiCommon.objectToArray(result);

                    for (let x = 0; x < result.length; x++) {

                        let metaItem: FileProperties = result[x];

                        this.config.metadataObjectMembersLookup[metadataType].push(metaItem);

                    }// End for

                    resolve();

                },
                (error: any) => {

                    reject(error);

                }
            );// End promise

        });

    }// End method

    protected updateFlowDefinitionFilesToDeactivate (): void {

        let directory: string = this.targetDirectorySource + MdapiCommon.PATH_SEP + MdapiConfig.flowDefinitions,
            fileItems: Array<string> = readdirSync(directory);

        for (let x = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x],
                filePath: string = path.join(
                    directory,
                    fileItem
                ),
                jsonObject: object = MdapiCommon.xmlFileToJson(filePath),
                flowDefinition: object = jsonObject[MdapiConfig.FlowDefinition],

                activeVersionNumber: object = flowDefinition[MdapiConfig.activeVersionNumber];

            if (!activeVersionNumber) {

                flowDefinition[MdapiConfig.activeVersionNumber] = {"_text": 0};

            }// End if

            flowDefinition[MdapiConfig.activeVersionNumber]._text = 0;
            MdapiCommon.jsonToXmlFile(
                jsonObject,
                filePath
            );

        }// End for

    }// End method

    protected updateFlowDefinitionFilesToActivate (): void {

        let directory: string = this.targetDirectorySource + MdapiCommon.PATH_SEP + MdapiConfig.flowDefinitions,
            fileItems: Array<string> = readdirSync(directory);

        for (let x = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x],
                filePath: string = path.join(
                    directory,
                    fileItem
                ),
                developerName: string = fileItem.split(MdapiCommon.DOT)[0];

            // Included means need to activate.
            if (this.includedFlows[developerName]) {

                let jsonObject: object = MdapiCommon.xmlFileToJson(filePath),

                    includedFlow: Flow = this.includedFlows[developerName],

                    flowDefinition: object = jsonObject[MdapiConfig.FlowDefinition],

                    activeVersionNumber: object = flowDefinition[MdapiConfig.activeVersionNumber];

                if (!activeVersionNumber) {

                    flowDefinition[MdapiConfig.activeVersionNumber] = {"_text": 0};

                }// End if

                flowDefinition[MdapiConfig.activeVersionNumber]._text = includedFlow.versionNumber;
                MdapiCommon.jsonToXmlFile(
                    jsonObject,
                    filePath
                );

            }// End if
            else if (this.ignoredFlows[developerName]) {

                if (existsSync(filePath)) {

                    unlinkSync(filePath);

                }// End if

            }// End if
            else {

                throw "unexpected event could not resolve flow definition developer name";

            }// End else

        }// End for

    }// End method

    protected updateIncludedPackageXml (): void {

        for (let x = 0; x < this.config.metadataTypes.length; x++) {

            let metaType: string = this.config.metadataTypes[x];

            if (this.config.metadataObjectMembersLookup[metaType].length === 0) {

                continue;

            }

            let metaItems: Array<FileProperties> = this.config.metadataObjectMembersLookup[metaType];

            for (let y = 0; y < metaItems.length; y++) {

                let fileProperties: FileProperties = metaItems[y];

                if (this.ignoredFlows[fileProperties.fullName]) { // Exclude already active

                    metaItems.splice(
                        y,
                        1
                    );
                    break;

                }// End if

            }// End for

        }// End for

        let updatePackageXml: string = this.targetDirectorySource + MdapiCommon.PATH_SEP + MdapiConfig.packageXml;

        MdapiConfig.createPackageFile(
            this.config,
            this.settings,
            updatePackageXml
        );

    }// End method

    public async deploy (): Promise<void> {

        return new Promise((resolve, reject) => {

            let command = `sfdx force:mdapi:deploy -g -w -1 -u ${this.orgAlias} -d ${this.targetDirectorySource}`;

            this.ux.log(command);

            MdapiCommon.command(command).then(
                (result) => {

                    this.ux.log(result);
                    resolve();

                },
                (error) => {

                    this.ux.error(error);
                    reject(error);

                }
            );

        });// End promise

    }// End if

    /*
     * Cannot reactive previous version
     * the version of the flow you're updating was active and can't be overwritten
     */
    protected async queryLatestAndActivateFlows (): Promise<void> {

        let result: QueryResult<object> = await this.org.getConnection().tooling.query("SELECT DeveloperName, LatestVersion.VersionNumber, LatestVersion.Status FROM FlowDefinition"),
            queryRecords: Array<object> = MdapiCommon.objectToArray(result.records);

        for (let x = 0; x < queryRecords.length; x++) {

            let record: object = queryRecords[x],

                flowDefinitionId: string = MdapiCommon.isolateLeafNode(
                    record[MdapiConfig.attributes].url,
                    MdapiCommon.PATH_SEP
                ),
                developerName: string = record[MdapiConfig.DeveloperName],
                latestVersion: object = record[MdapiConfig.LatestVersion],
                flowId: string = MdapiCommon.isolateLeafNode(
                    latestVersion[MdapiConfig.attributes].url,
                    MdapiCommon.PATH_SEP
                ),
                status: string = latestVersion[MdapiConfig.Status],
                versionNumber: number = latestVersion[MdapiConfig.VersionNumber];

            if (status === MdapiConfig.Obsolete) { // Exclude drafts and invalid draft and already active

                this.includedFlows[developerName] = <Flow>{
                    flowId,
                    flowDefinitionId,
                    developerName,
                    versionNumber,
                    status
                };// End if

            }// End method
            else {

                this.ignoredFlows[developerName] = <Flow>{
                    flowId,
                    flowDefinitionId,
                    developerName,
                    versionNumber,
                    status
                };// End else

            }// End else

        }// End for

    }// End method

    public async process (): Promise<void> {

        // Init
        this.ux.startSpinner("initialising");
        this.init();
        this.ux.stopSpinner();

        // Async calls
        this.ux.startSpinner("describe metadata");
        await MdapiConfig.describeMetadata(
            this.org,
            this.config,
            this.settings
        );
        this.ux.stopSpinner();

        this.ux.startSpinner("list metadata");
        await MdapiConfig.querylistMetadata(
            this.org,
            MdapiConfig.FlowDefinition,
            this.config,
            this.settings
        );
        this.ux.stopSpinner();

        // Create package.xml
        this.ux.startSpinner("package.xml file");
        this.packageFile();
        this.ux.stopSpinner();

        // Retrieve metadata files
        this.ux.startSpinner("retrieve metadata");
        await this.retrieveMetadata();
        this.ux.stopSpinner();

        // Unzip retrieve and backup zip
        this.ux.startSpinner("unzipping");
        await this.unzip();
        this.ux.stopSpinner();

        // Iterate FlowDefinitions files and update
        if (this.deactivate) {

            this.ux.startSpinner("deactivate flow definition files");
            this.updateFlowDefinitionFilesToDeactivate();
            this.ux.stopSpinner();

        }// End if
        else {

            this.ux.startSpinner("query latest flows");
            await this.queryLatestAndActivateFlows();
            this.ux.stopSpinner();

            this.ux.startSpinner("activate flow definition files");
            this.updateFlowDefinitionFilesToActivate();
            this.ux.stopSpinner();

            this.ux.startSpinner("update package.xml");
            this.updateIncludedPackageXml();
            this.ux.stopSpinner();

        }// End else

        this.ux.startSpinner("deploy");
        await this.deploy();
        this.ux.stopSpinner();

    }// End process

}// End class
