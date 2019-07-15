/**
 * @name MdapiRetrieveUtility
 * @author brianewardsaunders 
 * @date 2019-07-10
 * @acknowledgement amtrack/force-dev-tool (author acknowledgement)
 */

import {
    existsSync, mkdirSync, removeSync, unlinkSync, rename, readdirSync
} from 'fs-extra'
import {
    ListMetadataQuery, FileProperties, QueryResult
} from 'jsforce';

import { Org } from '@salesforce/core';
import { UX } from '@salesforce/command';
import { MdapiConfig, IConfig, ISettings } from './mdapi-config';
import { MdapiCommon } from './mdapi-common';
import path = require('path');

export interface BatchCtrl {
    counter: number;
    resolve: Function;
    reject: Function;
}

export interface Params {
    metaType: string;
    folder?: string;
}

export interface Flow {
    flowId: string,
    flowDefinitionId: string;
    developerName: string;
    versionNumber: number;
    status: string;  // 'Active' | 'Draft' | 'Obsolete' | 'InvalidDraft';
}

export class FlowsActivationUtility {

    constructor(
        protected org: Org,
        protected ux: UX,
        protected orgAlias: string,
        protected apiVersion: string,
        protected deactivate: boolean) {
        // noop
    }// end constructor

    protected includedFlows: Record<string, Flow> = {};
    protected ignoredFlows: Record<string, Flow> = {};

    protected BATCH_SIZE: number = 30;

    // define working folders
    protected stageOrgAliasDirectoryPath: string = (MdapiCommon.stageRoot + MdapiCommon.PATH_SEP + this.orgAlias);
    protected retrievePath: string = (this.stageOrgAliasDirectoryPath + MdapiCommon.PATH_SEP + MdapiCommon.retrieveRoot);
    protected zipFilePath: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip);
    protected targetDirectoryUnpackaged: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedFolder);
    protected targetDirectorySource: string = (this.retrievePath + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);
    protected manifestDirectory: string = (this.stageOrgAliasDirectoryPath + MdapiCommon.PATH_SEP + MdapiConfig.manifestFolder);
    protected filePackageXmlPath = (this.manifestDirectory + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);

    protected config: IConfig;
    protected settings: ISettings;

    protected transientMetadataTypes: Array<string> = [];

    protected async retrieveMetadata(): Promise<any> {

        this.ux.log('retrieve directory: ' + this.retrievePath);

        return new Promise((resolve, reject) => {

            if (existsSync(this.retrievePath)) {
                removeSync(this.retrievePath);
            }// end if

            mkdirSync(this.retrievePath);

            let retrieveCommand: string = ('sfdx force:mdapi:retrieve -s -k ' + this.filePackageXmlPath
                + ' -r ' + this.retrievePath + ' -w -1 -u ' + this.orgAlias);

            MdapiCommon.command(retrieveCommand).then((result: any) => {

                this.ux.log(result);
                resolve();

            }, (error: any) => {
                this.ux.error(error);
                reject(error);
            });

        }); // end promise

    }// end method

    protected packageFile(): void {

        if (!existsSync(this.manifestDirectory)) {
            mkdirSync(this.manifestDirectory);
            this.ux.log('created manifest directory [' + this.manifestDirectory + '].');
        }// end if

        MdapiConfig.createPackageFile(this.config, this.settings, this.filePackageXmlPath);

    }// end method

    protected init(): void {

        // setup config and setting properties
        this.config = MdapiConfig.createConfig();
        this.settings = MdapiConfig.createSettings();

        this.settings.apiVersion = this.apiVersion;

        if (!existsSync(MdapiCommon.stageRoot)) {
            mkdirSync(MdapiCommon.stageRoot);
            this.ux.log('staging [' + MdapiCommon.stageRoot + '] directory created.');
        }// end if

        // check if working directory exists
        if (!existsSync(this.stageOrgAliasDirectoryPath)) {
            mkdirSync(this.stageOrgAliasDirectoryPath);
            this.ux.log('staging alias [' + this.stageOrgAliasDirectoryPath + '] directory created.');
        }// end if

    }// end method

    protected async unzip(): Promise<any> {

        if (existsSync(this.targetDirectorySource)) {
            removeSync(this.targetDirectorySource);
        }// end if

        await MdapiConfig.unzipUnpackaged(this.zipFilePath, this.targetDirectoryUnpackaged);

        if (existsSync(this.zipFilePath)) {
            unlinkSync(this.zipFilePath);
        }// end if

        await rename(this.targetDirectoryUnpackaged, this.targetDirectorySource);

    }// end method

    protected async querylistMetadata(metadataType: string): Promise<void> {

        return new Promise((resolve, reject) => {

            let metaQueries: Array<ListMetadataQuery> = [{ "type": metadataType }];

            this.org.getConnection().metadata.list(metaQueries, this.apiVersion).then((result: Array<FileProperties>) => {

                result = MdapiCommon.objectToArray(result);

                for (let x: number = 0; x < result.length; x++) {
                    let metaItem: FileProperties = result[x];
                    this.config.metadataObjectMembersLookup[metadataType].push(metaItem);
                }// end for

                resolve();

            }, (error: any) => {
                reject(error);
            });// end promise
        });

    }// end method

    protected updateFlowDefinitionFilesToDeactivate(): void {

        let directory: string = (this.targetDirectorySource + MdapiCommon.PATH_SEP + MdapiConfig.flowDefinitions);

        let fileItems: Array<string> = readdirSync(directory);

        for (let x: number = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x];
            let filePath: string = path.join(directory, fileItem);
            let jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);
            let flowDefinition: Object = jsonObject[MdapiConfig.FlowDefinition];

            let activeVersionNumber: Object = flowDefinition[MdapiConfig.activeVersionNumber];
            if (!activeVersionNumber) {
                flowDefinition[MdapiConfig.activeVersionNumber] = { _text: 0 };
            }// end if

            flowDefinition[MdapiConfig.activeVersionNumber]._text = 0;
            MdapiCommon.jsonToXmlFile(jsonObject, filePath);

        }// end for

    }// end method

    protected updateFlowDefinitionFilesToActivate(): void {

        let directory: string = (this.targetDirectorySource + MdapiCommon.PATH_SEP + MdapiConfig.flowDefinitions);
        let fileItems: Array<string> = readdirSync(directory);

        for (let x: number = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x];
            let filePath: string = path.join(directory, fileItem);
            let developerName: string = fileItem.split(MdapiCommon.DOT)[0];

            // included means need to activate.
            if (this.includedFlows[developerName]) {

                let jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);

                let includedFlow: Flow = this.includedFlows[developerName];

                let flowDefinition: Object = jsonObject[MdapiConfig.FlowDefinition];

                let activeVersionNumber: Object = flowDefinition[MdapiConfig.activeVersionNumber];
                if (!activeVersionNumber) {
                    flowDefinition[MdapiConfig.activeVersionNumber] = { _text: 0 };
                }// end if

                flowDefinition[MdapiConfig.activeVersionNumber]._text = includedFlow.versionNumber;
                MdapiCommon.jsonToXmlFile(jsonObject, filePath);

            }// end if
            else if (this.ignoredFlows[developerName]) {
                if (existsSync(filePath)) {
                    unlinkSync(filePath);
                }// end if
            }// end if
            else {
                throw "Unexpected event could not resolve FlowDefinition developerName";
            }// end else

        }// end for

    }// end method

    protected updateIncludedPackageXml(): void {

        for (let x: number = 0; x < this.config.metadataTypes.length; x++) {

            let metaType: string = this.config.metadataTypes[x];

            if (this.config.metadataObjectMembersLookup[metaType].length === 0) { continue; }

            let metaItems: Array<FileProperties> = this.config.metadataObjectMembersLookup[metaType];

            for (let y: number = 0; y < metaItems.length; y++) {
                let fileProperties: FileProperties = metaItems[y];
                if (this.ignoredFlows[fileProperties.fullName]) { // exclude already active
                    metaItems.splice(y, 1);
                    break;
                }// end if

            }// end for

        }// end for

        let updatePackageXml: string = (this.targetDirectorySource + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);

        MdapiConfig.createPackageFile(this.config, this.settings, updatePackageXml);

    }// end method

    public async deploy(): Promise<void> {

        return new Promise((resolve, reject) => {

            let command: string = ('sfdx force:mdapi:deploy -g -w -1 -u ' + this.orgAlias + ' -d ' + this.targetDirectorySource);

            this.ux.log(command);

            MdapiCommon.command(command).then((result) => {
                this.ux.log(result);
                resolve();
            }, (error) => {
                console.log(error);
                // this.ux.error(error);
                reject(error);
            });

        });// end promise

    }// end if

    // cannot reactive previous version
    // the version of the flow you're updating was active and can't be overwritten
    protected async queryLatestAndActivateFlows(): Promise<void> {

        let result: QueryResult<Object> = await this.org.getConnection().tooling.query(
            "SELECT DeveloperName, LatestVersion.VersionNumber, LatestVersion.Status FROM FlowDefinition");
        let queryRecords: Array<Object> = MdapiCommon.objectToArray(result.records);

        for (let x: number = 0; x < queryRecords.length; x++) {

            let record: Object = queryRecords[x];

            let flowDefinitionId: string = MdapiCommon.isolateLeafNode(record[MdapiConfig.attributes].url, MdapiCommon.PATH_SEP);
            let developerName: string = record[MdapiConfig.DeveloperName];
            let latestVersion: Object = record[MdapiConfig.LatestVersion];
            let flowId: string = MdapiCommon.isolateLeafNode(latestVersion[MdapiConfig.attributes].url, MdapiCommon.PATH_SEP);
            let status: string = latestVersion[MdapiConfig.Status];
            let versionNumber: number = latestVersion[MdapiConfig.VersionNumber];

            if (status === MdapiConfig.Obsolete) { // exclude drafts and invalid draft and already active

                this.includedFlows[developerName] = <Flow>{
                    "flowId": flowId,
                    "flowDefinitionId": flowDefinitionId,
                    "developerName": developerName,
                    "versionNumber": versionNumber,
                    "status": status
                }// end if

            }// end method
            else {
                this.ignoredFlows[developerName] = <Flow>{
                    "flowId": flowId,
                    "flowDefinitionId": flowDefinitionId,
                    "developerName": developerName,
                    "versionNumber": versionNumber,
                    "status": status
                }// end else
            }

        }// end for

    }// end method

    public async process(): Promise<void> {

        // init
        this.ux.startSpinner('initialising');
        this.init();
        this.ux.stopSpinner();

        // async calls
        this.ux.startSpinner('describemetadata');
        await MdapiConfig.describeMetadata(this.org, this.config, this.settings);
        this.ux.stopSpinner();

        this.ux.startSpinner('listmetadata');
        await MdapiConfig.querylistMetadata(this.org, MdapiConfig.FlowDefinition, this.config, this.settings);
        this.ux.stopSpinner();

        // create package.xml
        this.ux.startSpinner('package.xml file');
        this.packageFile();
        this.ux.stopSpinner();

        // retrieve metadata files
        this.ux.startSpinner('retrieve metadata');
        await this.retrieveMetadata();
        this.ux.stopSpinner();

        // unzip retrieve and backup zip
        this.ux.startSpinner('unzipping');
        await this.unzip();
        this.ux.stopSpinner();

        // iterate FlowDefinitions files and update
        if (this.deactivate) {
            this.ux.startSpinner('updateFlowDefinitionFilesToDeactivate');
            this.updateFlowDefinitionFilesToDeactivate();
            this.ux.stopSpinner();
        }// end if 
        else {
            this.ux.startSpinner('queryLatestAndActivateFlows');
            await this.queryLatestAndActivateFlows();
            this.ux.stopSpinner();

            this.ux.startSpinner('updateFlowDefinitionFilesToActivate');
            this.updateFlowDefinitionFilesToActivate();
            this.ux.stopSpinner();

            this.ux.startSpinner('updateIncludedPackageXml');
            this.updateIncludedPackageXml();
            this.ux.stopSpinner();
        }// end else

        this.ux.startSpinner('deploy');
        await this.deploy();
        this.ux.stopSpinner();

    }// end process

}// end class
