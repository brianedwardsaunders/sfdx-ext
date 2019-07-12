/**
 * @name MdapiConvertUtility
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

import {
    existsSync, mkdirSync, removeSync, copySync,
    copyFileSync, readFileSync, writeFileSync
} from 'fs-extra';

import path = require('path');
import convert = require('xml-js');
import { Org } from '@salesforce/core';
import { chdir, cwd } from 'process'; 
import { UX } from '@salesforce/command';
import { MdapiConfig } from './mdapi-config';
import { MdapiCommon } from './mdapi-common';
const resolve = require('path').resolve;

export class MdapiConvertUtility {

    constructor(
        protected org: Org,
        protected ux: UX,
        protected sourceDirectory: string,
        protected targetDirectory: string) {
        // noop
    }// end constructor

    protected targetStagePath: string = (this.targetDirectory + '/' + MdapiCommon.stageRoot);
    protected targetStageSrcPath: string = (this.targetStagePath + '/' + MdapiConfig.srcFolder);
    protected targetManifestPackageXmlPath: string;

    protected async init(): Promise<void> {

        if (!existsSync(this.targetDirectory)) { // first time

            let targetPathSegments: Array<string> = this.targetDirectory.split(path.sep);
            let projectname: string = targetPathSegments[targetPathSegments.length - 1];

            let command: string = 'sfdx force:project:create --projectname ' + projectname;
            this.ux.log(command);
            await MdapiCommon.command(command);

        }// end path
        else {

            let forceAppPath: string = (this.targetDirectory + '/' + MdapiConfig.forceapp);

            if (existsSync(forceAppPath)) {

                this.ux.log('cleaning ' + forceAppPath);
                removeSync(forceAppPath);

            }// end if

            mkdirSync(forceAppPath);
            this.ux.log('cleaned ' + forceAppPath);

        }// end else

        let targetManifestDirectory: string = (this.targetDirectory + '/' + MdapiConfig.manifestFolder);
        if (!existsSync(targetManifestDirectory)) {
            this.ux.log('creating ' + targetManifestDirectory);
            mkdirSync(targetManifestDirectory);
        }// end if

        // create staging areas as don't want to delete svn src (repo)
        if (existsSync(this.targetStagePath)) {
            this.ux.log('cleaning ' + this.targetStagePath);
            removeSync(this.targetStagePath);
        }// end if

        mkdirSync(this.targetStagePath);
        mkdirSync(this.targetStageSrcPath);
        this.ux.log('created ' + this.targetStageSrcPath);

        copySync(this.sourceDirectory, this.targetStageSrcPath);
        this.ux.log(this.sourceDirectory + ' copied to [' + this.targetStageSrcPath + '].');

        let packageXmlPath = (this.targetStageSrcPath + '/' + MdapiConfig.packageXml);
        this.targetManifestPackageXmlPath = (targetManifestDirectory + '/' + MdapiConfig.packageXml);
        copyFileSync(packageXmlPath, this.targetManifestPackageXmlPath);
        this.ux.log(packageXmlPath + ' copied to [' + this.targetManifestPackageXmlPath + '].');

    }// end method

    protected objectToArray(objectOrArray: any): Array<Object> {
        let returned: Array<Object> = [];
        if (objectOrArray) {
            if (objectOrArray instanceof Array) { return objectOrArray; }
            else { returned.push(objectOrArray); }// end else
        }// end if
        return returned;
    }// end method

    protected removeUnsupportedMetaTypesFromManifestPackageXml(): void {

        var jsonObject: Object = JSON.parse(convert.xml2json(
            readFileSync(this.targetManifestPackageXmlPath, MdapiCommon.UTF8), MdapiCommon.convertOptions));

        var metaTypes: Array<Object> = this.objectToArray(jsonObject["types"]);

        for (var x: number = 0; x < metaTypes.length; x++) {
            let metaType = metaTypes[x];
            for (var y: number = 0; y < MdapiConfig.nonSfdxSupportedMetaTypes.length; y++) {
                let metaName: string = MdapiConfig.nonSfdxSupportedMetaTypes[y];
                if (metaType["name"]._text === metaName) {
                    this.ux.log('removing unsupported metatype [' + metaName + '] from package.xml ...');
                    metaTypes.splice(x, 1); // pop
                    break;
                }// end if
            }// end for
        }// end for

        var reducedXmlString: string = convert.json2xml(JSON.stringify(jsonObject), MdapiCommon.convertOptions);
        this.ux.log(this.targetManifestPackageXmlPath + ' updated');
        writeFileSync(this.targetManifestPackageXmlPath, reducedXmlString);

    }// end method 

    /**  
     * Delete directory which cause unhandled convert error 
     * e.g. ERROR running force:mdapi:convert:  An error was encountered processing path: 
     * animationRules\AW_Case_Path.animationRule
     */
    protected deleteUnsupportedDirectories(): void {

        MdapiConfig.nonSfdxSupportedDirectories.forEach(folder => {

            let folderPath = this.targetStageSrcPath + folder;

            this.ux.log('deleting sfdx unsupported folder [' + folderPath + '] if exists ...');

            if (existsSync(folderPath)) {
                removeSync(folderPath);
                this.ux.log(folderPath + ' deleted.');
            }// end if

        });// end for each

    }// end method

    protected async convert(): Promise<any> {

        let sourcePath: string = resolve(this.targetStageSrcPath);

        chdir(this.targetDirectory);
        console.info(cwd());

        let command: string = ('sfdx force:mdapi:convert -r ' + sourcePath);
        this.ux.log(command);
        await MdapiCommon.command(command);

    }// end convert

    protected cleanup(): void {

        removeSync(this.targetStagePath);
        this.ux.log(this.targetStagePath + ' deleted.');

    }// end process 

    public async process(): Promise<any> {

        let startDirectory: string = cwd();

        // initialising
        this.ux.startSpinner('initialising');
        await this.init();
        this.ux.stopSpinner();

        // clean unsupported meta types
        this.ux.log('deleting unsupported directories...');
        this.deleteUnsupportedDirectories();

        this.ux.log('removing Unsupported MetaTypes from Manifest package.xml...');
        this.removeUnsupportedMetaTypesFromManifestPackageXml();

        this.ux.startSpinner('converting');
        await this.convert();
        this.ux.stopSpinner();

        chdir(startDirectory);

        this.ux.log('cleanup stage ...');
        this.cleanup();

    }// end process

}// end class
