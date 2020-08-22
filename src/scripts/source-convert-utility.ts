/**
 * @name SourceConvertUtility (sfdx force-app to mdapi src)
 * @author brianewardsaunders
 * @date 2019-07-10
 */

import {Org} from "@salesforce/core";
import {UX} from "@salesforce/command";
import {MdapiCommon} from "./mdapi-common";
import {DiffRecord, IConfig, ISettings, MdapiConfig, RelativePosition} from "./mdapi-config";
import {copyFileSync, readdirSync, statSync, writeFileSync} from "fs";
import path = require("path");

export class SourceConvertUtility {

    constructor (
        protected org: Org,
        protected ux: UX,
        protected sourceDirectory: string,
        protected targetDirectory: string,
        protected apiVersion: string
    ) {
        // Noop
    }// End constructor

    protected config: IConfig;

    protected settings: ISettings;

    protected targetSrcPath: string = (this.targetDirectory + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);

    protected targetPackageXmlPath: string = (this.targetDirectory + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);

    protected targetSrcPackageXmlPath: string = (this.targetSrcPath + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);

    protected filePathDiffRecordRegister: Record<string, DiffRecord> = {};

    protected packageDiffRecords: Record<string, Array<DiffRecord>> = {};

    protected walkDir (position: RelativePosition, dir: string, metaRegister: Record<string, DiffRecord>, callback: any): void {

        let fileItems: Array<string> = readdirSync(dir);

        for (let x = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x],
                dirPath: string = path.join(
                    dir,
                    fileItem
                ),
                isDirectory: boolean = statSync(dirPath).isDirectory();

            if (isDirectory) {

                this.walkDir(
                    position,
                    dirPath,
                    metaRegister,
                    callback
                );

            }// End if
            else {

                callback(
                    position,
                    this.config,
                    path.join(
                        dir,
                        fileItem
                    ),
                    dir,
                    metaRegister
                );

            }// End else

        }// End for

    }// End method

    protected walkTargetSrc (): void {

        MdapiConfig.initDiffRecordsLookup(
            this.config,
            this.packageDiffRecords
        );

        this.walkDir(
            RelativePosition.Target,
            this.targetSrcPath,
            this.filePathDiffRecordRegister,
            MdapiConfig.inspectMdapiFile
        );

    }// End method

    protected preparePackageInspectMdapiChildren (): void {

        // Compare left to right
        for (let filePath in this.filePathDiffRecordRegister) {

            let diffItem: DiffRecord = this.filePathDiffRecordRegister[filePath];

            this.packageDiffRecords[diffItem.metadataName].push(diffItem);

            if (MdapiConfig.metadataObjectHasChildren(diffItem.metadataObject)) {

                MdapiConfig.inspectMetaChildren(
                    this.config,
                    this.packageDiffRecords,
                    diffItem
                );

            }// End if

        }// End for

    }// End method

    protected async convert (): Promise<void> {

        let command = `sfdx force:source:convert -r ${this.sourceDirectory} -d ${this.targetSrcPath}`;

        this.ux.log(command);
        await MdapiCommon.command(command);

    }// End method

    protected async init (): Promise<void> {

        this.config = MdapiConfig.createConfig();
        this.settings = MdapiConfig.createSettings();
        this.settings.apiVersion = this.apiVersion;

    }// End method

    protected updatePackageFile (packageFilePath: string, diffRecords: Record<string, Array<DiffRecord>>): void {

        let xmlContent: string = MdapiConfig.packageXmlHeader(),
            metadataObjectNames: Array<string> = MdapiConfig.sortDiffRecordTypes(diffRecords);

        for (let i = 0; i < metadataObjectNames.length; i++) {

            let metadataObjectName: string = metadataObjectNames[i];

            if (diffRecords[metadataObjectName].length === 0) {

                continue;

            }

            let rawMembers: Array<DiffRecord> = diffRecords[metadataObjectName],
                limitedMembers: Array<string> = [];

            for (let x = 0; x < rawMembers.length; x++) {

                let diffRecord: DiffRecord = rawMembers[x];

                limitedMembers.push(diffRecord.memberName);

            }// End for

            // Ensure only unique entries
            let members: Array<string> = [...new Set(limitedMembers)].sort();

            if (members.length > 0) {

                xmlContent += `${MdapiCommon.TWO_SPACE}<types>\n`;
                xmlContent += `${MdapiCommon.FOUR_SPACE}<name>${metadataObjectName}</name>\n`;

                for (let y = 0; y < members.length; y++) {

                    let member: string = members[y];

                    if (!member) {

                        throw "unexpected blank member";

                    }
                    xmlContent += `${MdapiCommon.FOUR_SPACE}<members>${member}</members>\n`;

                }// End for

                xmlContent += `${MdapiCommon.TWO_SPACE}</types>\n`;

            }// End if

        }// End for

        xmlContent += `${MdapiCommon.TWO_SPACE}<version>${this.apiVersion}</version>\n`;
        xmlContent += MdapiConfig.packageXmlFooter();

        writeFileSync(
            packageFilePath,
            xmlContent
        );

    }// End method

    public async process (): Promise<void> {

        this.ux.startSpinner("initialising");
        await this.init();
        this.ux.stopSpinner();

        // Async calls
        this.ux.startSpinner("describe metadata");
        await MdapiConfig.describeMetadata(
            this.org,
            this.config,
            this.settings
        );
        this.ux.stopSpinner();

        // Converting from sfdx to mdapi
        this.ux.startSpinner("converting");
        await this.convert();
        this.ux.stopSpinner();

        // WalkTargetSrc
        this.ux.startSpinner("walk target source");
        this.walkTargetSrc();
        this.ux.stopSpinner();

        // PreparePackageInspectMdapiChildren
        this.ux.startSpinner("prepare package elements and inspect children");
        this.preparePackageInspectMdapiChildren();
        this.ux.stopSpinner();

        // InspectMdapiChildren
        this.ux.startSpinner("update package.xml file");
        this.updatePackageFile(
            this.targetPackageXmlPath,
            this.packageDiffRecords
        );
        copyFileSync(
            this.targetPackageXmlPath,
            this.targetSrcPackageXmlPath
        );
        this.ux.stopSpinner();

    }// End process

}// End class
