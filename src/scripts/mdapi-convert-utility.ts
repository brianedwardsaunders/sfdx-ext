/**
 * @name MdapiConvertUtility
 * @author brianewardsaunders 
 * @date 2019-07-10
 */
import {
    existsSync, mkdirSync, removeSync, copySync, copyFileSync, readFileSync, writeFileSync
} from 'fs-extra';

import path = require('path');
import { Org } from '@salesforce/core';
import { chdir, cwd } from 'process';
import convert = require('xml-js');
const exec = require('child_process').exec;
const resolve = require('path').resolve;

export class MdapiConvertUtility {

    constructor(
        protected org: Org,
        protected sourceDirectory: string,
        protected targetDirectory: string) {
        // noop
    }// end constructor

    protected UTF8 = 'utf8';
    protected convertOptions: Object = { compact: true, spaces: 4 };
    protected bufferOptions: Object = { maxBuffer: 10 * 1024 * 1024 };

    // defaults
    protected stageRoot: string = 'stage';
    protected srcFolder: string = 'src';
    protected manifest: string = 'manifest';
    protected packageXml: string = 'package.xml';
    protected forceapp: string = 'force-app';

    protected targetStagePath: string = (this.targetDirectory + '/' + this.stageRoot);
    protected targetStageSrcPath: string = (this.targetStagePath + '/' + this.srcFolder);
    protected targetManifestPackageXmlPath: string;

    // CHECK THIS WITH SALESFORCE RELEASE NOTE THE FOLLOWING IS NOT SUPPORTED WITH SFDX AS PART OF API VERSION 46.0
    // FUTURE ENHANCEMENT MAKE THIS A PARAM TO INPUT JSON FILE.
    protected nonSfdxSupportedDirectories = [
        '/animationRules',
        '/audience',
        '/bots'
    ];

    // this must match above directory
    protected nonSfdxSupportedMetaTypes = [
        'AnimationRule',
        'Audience',
        'Bot'
    ];

    protected command(cmd: string): Promise<any> {

        return new Promise((resolve, reject) => {
            exec(cmd, this.bufferOptions, (error: any, stdout: any, stderr: any) => {
                if (error) {
                    console.debug(stderr);
                    reject(error);
                }// end if
                else {
                    resolve(stdout);
                }// end else
            });
        });// end promise

    }// end method

    protected async init(): Promise<void> {

        if (!existsSync(this.targetDirectory)) { // first time

            let targetPathSegments: Array<string> = this.targetDirectory.split(path.sep);
            let projectname: string = targetPathSegments[targetPathSegments.length - 1];

            let command: string = 'sfdx force:project:create --projectname ' + projectname;
            console.log(command);
            await this.command(command);

        }// end path
        else {

            let forceAppPath: string = (this.targetDirectory + '/' + this.forceapp);

            if (existsSync(forceAppPath)) {

                console.log('cleaning ' + forceAppPath);
                removeSync(forceAppPath);

            }// end if

            mkdirSync(forceAppPath);
            console.log('cleaned ' + forceAppPath);

        }// end else

        let targetManifestDirectory: string = (this.targetDirectory + '/' + this.manifest);
        if (!existsSync(targetManifestDirectory)) {
            console.log('creating ' + targetManifestDirectory);
            mkdirSync(targetManifestDirectory);
        }// end if

        // create staging areas as don't want to delete svn src (repo)
        if (existsSync(this.targetStagePath)) {
            console.log('cleaning ' + this.targetStagePath);
            removeSync(this.targetStagePath);
        }// end if

        mkdirSync(this.targetStagePath);
        mkdirSync(this.targetStageSrcPath);
        console.log('created ' + this.targetStageSrcPath);

        copySync(this.sourceDirectory, this.targetStageSrcPath);
        console.log(this.sourceDirectory + ' copied to [' + this.targetStageSrcPath + '].');

        let packageXmlPath = (this.targetStageSrcPath + '/' + this.packageXml);
        this.targetManifestPackageXmlPath = (targetManifestDirectory + '/' + this.packageXml);
        copyFileSync(packageXmlPath, this.targetManifestPackageXmlPath);
        console.log(packageXmlPath + ' copied to [' + this.targetManifestPackageXmlPath + '].');

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
            readFileSync(this.targetManifestPackageXmlPath, this.UTF8), this.convertOptions));

        var metaTypes: Array<Object> = this.objectToArray(jsonObject["types"]);

        for (var x: number = 0; x < metaTypes.length; x++) {
            let metaType = metaTypes[x];
            for (var y: number = 0; y < this.nonSfdxSupportedMetaTypes.length; y++) {
                let metaName: string = this.nonSfdxSupportedMetaTypes[y];
                if (metaType["name"]._text === metaName) {
                    console.log('removing unsupported metatype [' + metaName + '] from package.xml ...');
                    metaTypes.splice(x, 1); // pop
                    break;
                }// end if
            }// end for
        }// end for

        var reducedXmlString = convert.json2xml(JSON.stringify(jsonObject), this.convertOptions);
        console.log(this.targetManifestPackageXmlPath + ' updated');
        writeFileSync(this.targetManifestPackageXmlPath, reducedXmlString);

    }// end method 

    /**  
     * Delete directory which cause unhandled convert error 
     * e.g. ERROR running force:mdapi:convert:  An error was encountered processing path: 
     * animationRules\AW_Case_Path.animationRule
     */
    protected deleteUnsupportedDirectories(): void {

        this.nonSfdxSupportedDirectories.forEach(folder => {

            let folderPath = this.targetStageSrcPath + folder;

            console.log('deleting sfdx unsupported folder [' + folderPath + '] if exists ...');

            if (existsSync(folderPath)) {
                removeSync(folderPath);
                console.log(folderPath + ' deleted.');
            }// end if

        });// end for each

    }// end method

    protected async convert(): Promise<any> {

        let sourcePath: string = resolve(this.targetStageSrcPath);

        chdir(this.targetDirectory);
        console.info(cwd());

        let command: string = ('sfdx force:mdapi:convert -r ' + sourcePath);
        console.log(command);
        await this.command(command);

    }// end convert

    protected cleanup(): void {

        removeSync(this.targetStagePath);
        console.log(this.targetStagePath + ' deleted.');

    }// end process 

    public async process(): Promise<any> {

        let startDirectory: string = cwd();

        // init
        console.log('initialising ...');
        await this.init();

        // clean unsupported meta types
        console.log('delete unsupported directories ...');
        this.deleteUnsupportedDirectories();

        console.log('remove Unsupported MetaTypes from Manifest package.xml ...');
        this.removeUnsupportedMetaTypesFromManifestPackageXml();

        console.log('converting ...');
        await this.convert();

        chdir(startDirectory);

        console.log('cleanup stage ...');
        this.cleanup();

    }// end process

}// end class
