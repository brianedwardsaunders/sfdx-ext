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

export class FlowsActivationUtility {

    constructor(
        protected org: Org,
        protected ux: UX,
        protected orgAlias: string,
        protected apiVersion: string,
        protected deactivate: boolean) {
        // noop
    }// end constructor

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

    protected updateFlowDefinitionFiles(): void {

        let directory: string = (this.targetDirectorySource + MdapiCommon.PATH_SEP + MdapiConfig.flowDefinitions);

        let fileItems: Array<string> = readdirSync(directory);

        for (let x: number = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x];
            let filePath: string = path.join(directory, fileItem);

            let jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);

            let flowDefinition = jsonObject[MdapiConfig.FlowDefinition];

            let activeVersionNumber: Object = flowDefinition[MdapiConfig.activeVersionNumber];
            if (!activeVersionNumber) {
                flowDefinition[MdapiConfig.activeVersionNumber] = { _text: 0 };
            }// end if

            flowDefinition[MdapiConfig.activeVersionNumber]._text = 0;
            MdapiCommon.jsonToXmlFile(jsonObject, filePath);

        }// end for

    }// end method

    protected updateFlowFiles(): void {

        let directory: string = (this.targetDirectorySource + MdapiCommon.PATH_SEP + MdapiConfig.flows);

        let fileItems: Array<string> = readdirSync(directory);

        for (let x: number = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x];
            let filePath: string = path.join(directory, fileItem);

            let jsonObject: Object = MdapiCommon.xmlFileToJson(filePath);

            let flow = jsonObject[MdapiConfig.Flow];

            flow[MdapiConfig.status]._text = 'Active';
            MdapiCommon.jsonToXmlFile(jsonObject, filePath);

        }// end for

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

    /* 
        // cannot reactive previous version
        // /The version of the flow you're updating was active and can't be overwritten
        protected async queryLatestFlowDefinitionVersions(): Promise<void> {

        let flowProperties: Array<FileProperties> = this.config.metadataObjectMembersLookup[MdapiConfig.Flow];

        // work on assumptio and principle latest version is king
        let result: QueryResult<Object> = await this.org.getConnection().tooling.query(
            "SELECT DeveloperName, LatestVersion.VersionNumber FROM FlowDefinition");
        let records: Array<Object> = MdapiCommon.objectToArray(result.records);

        for (let x: number = 0; x < records.length; x++) {
            let record: Object = records[x];
            for (let y: number = 0; y < flowProperties.length; y++) {
                let flow: Object = flowProperties[y];
                if (flow[MdapiConfig.fullName] === record[MdapiConfig.DeveloperName]) {
                    let latestVersion = record[MdapiConfig.LatestVersion];
                    flow[MdapiConfig.fullName] = (flow[MdapiConfig.fullName] + MdapiCommon.DASH + latestVersion[MdapiConfig.VersionNumber]);
                    console.log(flow[MdapiConfig.fullName]);
                    break;
                }// end if
            }// end for
        }// end for

    }// end method
    */

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
        if (this.deactivate) {
            //queryLatestFlowDefinitionVersions();
            await MdapiConfig.querylistMetadata(this.org, MdapiConfig.FlowDefinition, this.config, this.settings);
        }
        else {
            await MdapiConfig.querylistMetadata(this.org, MdapiConfig.Flow, this.config, this.settings);
        }// end else
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
            this.ux.startSpinner('updateFlowDefinitionFiles');
            this.updateFlowDefinitionFiles();
            this.ux.stopSpinner();
        }// end method
        else {
            this.ux.startSpinner('updateFlowFiles');
            // enhancement rather check if already active then exclude.
            this.updateFlowFiles();
            this.ux.stopSpinner();
        }// end else

        // deploy 
        this.ux.startSpinner('deploy');
        await this.deploy();
        this.ux.stopSpinner();

    }// end process

}// end class
