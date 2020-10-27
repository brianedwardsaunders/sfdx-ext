/**
 * @name MdapiConvertUtility
 * @author brianewardsaunders
 * @date 2019-07-10
 */

import {
    copyFileSync, copySync, existsSync, mkdirSync, removeSync
} from "fs-extra";

import path = require("path");
import {Org} from "@salesforce/core";
import {chdir, cwd} from "process";
import {UX} from "@salesforce/command";
import {MdapiConfig} from "./mdapi-config";
import {MdapiCommon} from "./mdapi-common";
let {resolve} = require("path");

export class MdapiConvertUtility {

    constructor (
        protected org: Org,
        protected ux: UX,
        protected sourceDirectory: string,
        protected targetDirectory: string
    ) {
        // Noop
    }// End constructor

    protected targetStagePath: string = (this.targetDirectory + MdapiCommon.PATH_SEP + MdapiCommon.stageRoot);

    protected targetStageSrcPath: string = (this.targetStagePath + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);

    protected targetManifestPackageXmlPath: string;

    protected async init (): Promise<void> {

        if (!existsSync(this.targetDirectory)) { // First time

            let targetPathSegments: Array<string> = this.targetDirectory.split(path.sep),
                projectname: string = targetPathSegments[targetPathSegments.length - 1],

                command = `sfdx force:project:create --projectname ${projectname}`;

            this.ux.log(command);
            await MdapiCommon.command(command);

        }// End path
        else {

            let forceAppPath: string = this.targetDirectory + MdapiCommon.PATH_SEP + MdapiConfig.forceapp;

            if (existsSync(forceAppPath)) {

                this.ux.log(`cleaning ${forceAppPath}`);
                removeSync(forceAppPath);

            }// End if

            mkdirSync(forceAppPath);
            this.ux.log(`cleaned ${forceAppPath}`);

        }// End else

        let targetManifestDirectory: string = this.targetDirectory + MdapiCommon.PATH_SEP + MdapiConfig.manifestFolder;

        if (!existsSync(targetManifestDirectory)) {

            this.ux.log(`creating ${targetManifestDirectory}`);
            mkdirSync(targetManifestDirectory);

        }// End if

        // Create staging areas as don't want to delete svn src (repo)
        if (existsSync(this.targetStagePath)) {

            this.ux.log(`cleaning ${this.targetStagePath}`);
            removeSync(this.targetStagePath);

        }// End if

        mkdirSync(this.targetStagePath);
        mkdirSync(this.targetStageSrcPath);
        this.ux.log(`created ${this.targetStageSrcPath}`);

        copySync(
            this.sourceDirectory,
            this.targetStageSrcPath
        );
        this.ux.log(`${this.sourceDirectory} copied to ${this.targetStageSrcPath}`);

        let packageXmlPath = this.targetStageSrcPath + MdapiCommon.PATH_SEP + MdapiConfig.packageXml;

        this.targetManifestPackageXmlPath = targetManifestDirectory + MdapiCommon.PATH_SEP + MdapiConfig.packageXml;
        copyFileSync(
            packageXmlPath,
            this.targetManifestPackageXmlPath
        );
        this.ux.log(`${packageXmlPath} copied to ${this.targetManifestPackageXmlPath}`);

    }// End method

    protected removeUnsupportedMetaTypesFromManifestPackageXml (): void {

        let jsonObject: Object = MdapiCommon.xmlFileToJson(this.targetManifestPackageXmlPath),

            metaTypes: Array<Object> = MdapiCommon.objectToArray(jsonObject['types']);

        for (let x = 0; x < metaTypes.length; x++) {

            let metaType = metaTypes[x];

            for (let y = 0; y < MdapiConfig.nonSfdxSupportedMetaTypes.length; y++) {

                let metaName: string = MdapiConfig.nonSfdxSupportedMetaTypes[y];

                if (metaType[MdapiConfig._name]._text === metaName) {

                    this.ux.log(`removing unsupported metatype ${metaName} from package.xml...`);
                    metaTypes.splice(
                        x,
                        1
                    ); // Pop
                    break;

                }// End if

            }// End for

        }// End for

        MdapiCommon.jsonToXmlFile(
            jsonObject,
            this.targetManifestPackageXmlPath
        );

    }// End method

    /**
     * Delete directory which cause unhandled convert error
     * e.g. ERROR running force:mdapi:convert:  An error was encountered processing path:
     * animationRules\AW_Case_Path.animationRule
     */
    protected deleteUnsupportedDirectories (): void {

        MdapiConfig.nonSfdxSupportedDirectories.forEach((directory) => {

            let directoryPath = this.targetStageSrcPath + MdapiCommon.PATH_SEP + directory;

            this.ux.log(`deleting sfdx unsupported directory ${directoryPath} if exists...`);

            if (existsSync(directoryPath)) {

                removeSync(directoryPath);
                this.ux.log(`${directoryPath} deleted.`);

            }// End if

        });// End for each

    }// End method

    protected async convert (): Promise<void> {

        let sourcePath: string = resolve(this.targetStageSrcPath);

        chdir(this.targetDirectory);
        this.ux.log(cwd());

        let command = `sfdx force:mdapi:convert -r ${sourcePath}`;

        this.ux.log(command);
        await MdapiCommon.command(command);

    }// End convert

    protected cleanup (): void {

        removeSync(this.targetStagePath);
        this.ux.log(`${this.targetStagePath} deleted.`);

    }// End process

    public async process (): Promise<void> {

        let startDirectory: string = cwd();

        // Initialising
        this.ux.startSpinner("initialising");
        await this.init();
        this.ux.stopSpinner();

        // Clean unsupported meta types
        this.ux.log("deleting unsupported directories...");
        this.deleteUnsupportedDirectories();

        this.ux.log("removing unsupported metatypes from manifest package.xml...");
        this.removeUnsupportedMetaTypesFromManifestPackageXml();

        this.ux.startSpinner("converting");
        await this.convert();
        this.ux.stopSpinner();

        chdir(startDirectory);

        this.ux.log("cleanup stage...");
        this.cleanup();

    }// End process

}// End class
