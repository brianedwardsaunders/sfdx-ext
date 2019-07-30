/**
 * @name SourceConvertUtility (sfdx force-app to mdapi src)
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

import { Org } from '@salesforce/core';
import { UX } from '@salesforce/command';
import { MdapiCommon } from './mdapi-common';
import { MdapiConfig, IConfig, ISettings, DiffRecord, RelativePosition } from './mdapi-config';
import { readdirSync, statSync, writeFileSync, copyFileSync } from 'fs';
import path = require('path');

export class SourceConvertUtility {

    constructor(
        protected org: Org,
        protected ux: UX,
        protected sourceDirectory: string,
        protected targetDirectory: string,
        protected apiVersion: string) {
        // noop
    }// end constructor

    protected config: IConfig;
    protected settings: ISettings;

    protected targetSrcPath: string = (this.targetDirectory + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);
    protected targetPackageXmlPath: string = (this.targetDirectory + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);
    protected targetSrcPackageXmlPath: string = (this.targetSrcPath + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);

    protected filePathDiffRecordRegister: Record<string, DiffRecord> = {};
    protected packageDiffRecords: Record<string, Array<DiffRecord>> = {};

    protected walkDir(position: RelativePosition, dir: string, metaRegister: Record<string, DiffRecord>, callback: any): void {

        let fileItems: Array<string> = readdirSync(dir);

        for (let x: number = 0; x < fileItems.length; x++) {

            let fileItem: string = fileItems[x];
            let dirPath: string = path.join(dir, fileItem);
            let isDirectory: boolean = statSync(dirPath).isDirectory();

            if (isDirectory) {
                this.walkDir(position, dirPath, metaRegister, callback);
            }// end if
            else {
                callback(position, this.config, path.join(dir, fileItem), dir, metaRegister);
            }// end else

        }// end for

    }// end method

    protected walkTargetSrc(): void {

        MdapiConfig.initDiffRecordsLookup(this.config, this.packageDiffRecords);

        this.walkDir(RelativePosition.Target, this.targetSrcPath, this.filePathDiffRecordRegister, MdapiConfig.inspectMdapiFile);

    }// end method

    protected preparePackageInspectMdapiChildren(): void {

        //compare left to right
        for (let filePath in this.filePathDiffRecordRegister) {

            let diffItem: DiffRecord = this.filePathDiffRecordRegister[filePath];

            this.packageDiffRecords[diffItem.metadataName].push(diffItem);

            if (MdapiConfig.metadataObjectHasChildren(diffItem.metadataObject)) {
                MdapiConfig.inspectMetaChildren(this.config, this.packageDiffRecords, diffItem);
            }// end if

        }// end for

    }// end method

    protected async convert(): Promise<void> {

        let command: string = ('sfdx force:source:convert -r ' + this.sourceDirectory + ' -d ' + this.targetSrcPath);
        this.ux.log(command);
        await MdapiCommon.command(command);

    }// end method

    protected async init(): Promise<void> {

        this.config = MdapiConfig.createConfig();
        this.settings = MdapiConfig.createSettings();
        this.settings.apiVersion = this.apiVersion;

    }// end method

    protected updatePackageFile(packageFilePath: string, diffRecords: Record<string, Array<DiffRecord>>): void {

        let xmlContent: string = MdapiConfig.packageXmlHeader();
        let metadataObjectNames: Array<string> = MdapiConfig.sortDiffRecordTypes(diffRecords);

        for (let i: number = 0; i < metadataObjectNames.length; i++) {

            let metadataObjectName: string = metadataObjectNames[i];
            if (diffRecords[metadataObjectName].length === 0) { continue; }

            let rawMembers: Array<DiffRecord> = diffRecords[metadataObjectName];
            let limitedMembers: Array<string> = [];

            for (let x: number = 0; x < rawMembers.length; x++) {
                let diffRecord: DiffRecord = rawMembers[x];
                limitedMembers.push(diffRecord.memberName);
            }//end for

            // ensure only unique entries
            let members: Array<string> = [...new Set(limitedMembers)].sort();

            if (members.length > 0) {

                xmlContent += MdapiCommon.TWO_SPACE + '<types>\n';
                xmlContent += MdapiCommon.FOUR_SPACE + '<name>' + metadataObjectName + '</name>\n';

                for (let y = 0; y < members.length; y++) {
                    let member: string = members[y];
                    if (!member) { throw "unexpected blank member"; }
                    xmlContent += MdapiCommon.FOUR_SPACE + '<members>' + member + '</members>\n';
                }// end for

                xmlContent += (MdapiCommon.TWO_SPACE + '</types>\n');

            }// end if

        }// end for

        xmlContent += (MdapiCommon.TWO_SPACE + '<version>' + this.apiVersion + '</version>\n');
        xmlContent += MdapiConfig.packageXmlFooter();

        writeFileSync(packageFilePath, xmlContent);

    }// end method

    public async process(): Promise<void> {

        this.ux.startSpinner('initialising');
        await this.init();
        this.ux.stopSpinner();

        // async calls
        this.ux.startSpinner('describe metadata');
        await MdapiConfig.describeMetadata(this.org, this.config, this.settings);
        this.ux.stopSpinner();

        // converting from sfdx to mdapi
        this.ux.startSpinner('converting');
        await this.convert();
        this.ux.stopSpinner();

        //walkTargetSrc
        this.ux.startSpinner('walk target source');
        this.walkTargetSrc();
        this.ux.stopSpinner();

        //preparePackageInspectMdapiChildren
        this.ux.startSpinner('prepare package elements and inspect children');
        this.preparePackageInspectMdapiChildren();
        this.ux.stopSpinner();

        //inspectMdapiChildren
        this.ux.startSpinner('update package.xml file');
        this.updatePackageFile(this.targetPackageXmlPath, this.packageDiffRecords);
        copyFileSync(this.targetPackageXmlPath, this.targetSrcPackageXmlPath);
        this.ux.stopSpinner();

    }// end process

}// end class
