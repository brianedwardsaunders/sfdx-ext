/**
 * @name MdapiRetrieveUtility
 * @author brianewardsaunders
 * @date 2019-07-10
 * @acknowledgement amtrack/force-dev-tool (author acknowledgement)
 */

import {
  copyFileSync, copySync, createWriteStream, existsSync, mkdirSync, mkdirp, removeSync, rename, unlinkSync
} from "fs-extra";
import type {
  FileProperties, ListMetadataQuery
} from "jsforce/api/metadata";
import { QueryResult } from "jsforce";
import path = require("path");
import yauzl = require("yauzl");
import { Org } from "@salesforce/core";
import { UX } from "@salesforce/command";
import { IConfig, ISettings, MdapiConfig } from "./mdapi-config";
import { MdapiCommon } from "./mdapi-common";

export interface BatchCtrl {
  counter: number;
  resolve: Function;
  reject: Function;
}

export interface Params {
  metaType: string;
  folder?: string;
}

export class MdapiRetrieveUtility {

  constructor(
    protected org: Org,
    protected ux: UX,
    protected orgAlias: string,
    protected apiVersion: string,
    protected ignoreBackup: boolean,
    protected ignoreInstalled: boolean,
    protected ignoreNamespaces: boolean,
    protected ignoreHiddenOrNonEditable: boolean,
    protected ignoreFolders: boolean,
    protected ignoreStaticResources: boolean,
    protected manifestOnly: boolean,
    protected devMode: boolean,
    protected splitMode: boolean,
    protected createcsv: boolean,
    protected startsWithFilters: Array<string>,
    protected containsFilters: Array<string>,
    protected endsWithFilters: Array<string>,
    protected matchFilters: Array<string>,
    protected includeTypes: Array<string>,
    protected excludeStartsWithFilters: Array<string>,
    protected excludeContainsFilters: Array<string>,
    protected excludeEndsWithFilters: Array<string>,
    protected excludeMatchFilters: Array<string>,
    protected excludedTypes: Array<string>
  ) {
    // Noop
  }// End constructor

  // Define working folders
  protected stageOrgAliasDirectoryPath: string = (MdapiCommon.stageRoot + MdapiCommon.PATH_SEP + this.orgAlias);

  protected retrievedPath: string = (this.stageOrgAliasDirectoryPath + MdapiCommon.PATH_SEP + MdapiCommon.retrievedRoot);

  protected zipFilePath: string = (this.retrievedPath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip);

  protected targetDirectoryUnpackaged: string = (this.retrievedPath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedFolder);

  protected retrievedPath1: string = (this.retrievedPath + MdapiCommon.PATH_SEP + MdapiConfig.unpackaged1Folder);

  protected retrievedPath2: string = (this.retrievedPath + MdapiCommon.PATH_SEP + MdapiConfig.unpackaged2Folder);

  protected zipFilePath1: string = (this.retrievedPath1 + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip);

  protected zipFilePath2: string = (this.retrievedPath2 + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip);

  protected targetDirectoryUnpackaged1: string = (this.retrievedPath1 + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedFolder);

  protected targetDirectoryUnpackaged2: string = (this.retrievedPath2 + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedFolder);

  protected targetDirectorySource: string = (this.retrievedPath + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);

  protected targetDirectorySource1: string = (this.retrievedPath1 + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);

  protected targetDirectorySource2: string = (this.retrievedPath2 + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder);

  protected targetDirectorySourcePackageXml: string = (this.retrievedPath + MdapiCommon.PATH_SEP + MdapiConfig.srcFolder + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);

  protected manifestDirectory: string = (this.stageOrgAliasDirectoryPath + MdapiCommon.PATH_SEP + MdapiConfig.manifestFolder);

  protected filePackageXmlPath = (this.manifestDirectory + MdapiCommon.PATH_SEP + MdapiConfig.packageXml);

  protected filePackageCsvPath = (this.manifestDirectory + MdapiCommon.PATH_SEP + MdapiConfig.diffCsv);

  protected filePackage1XmlPath = (this.manifestDirectory + MdapiCommon.PATH_SEP + MdapiConfig.package1Xml);

  protected filePackage2XmlPath = (this.manifestDirectory + MdapiCommon.PATH_SEP + MdapiConfig.package2Xml);

  protected config: IConfig;

  protected settings: ISettings;

  protected METADATA_LIST_CHUNK_SIZE = 3; // hard sf query limit 

  protected transientMetadataTypes: Array<string> = [];

  // Create backup of retrieve meta in-case needed later
  protected backup(): void {

    let iso: string = new Date().toISOString();

    iso = iso.replace(
      /:/g,
      MdapiCommon.DASH
    ).split(MdapiCommon.DOT)[0];

    let backupFolder: string = MdapiCommon.backupRoot + MdapiCommon.PATH_SEP + this.orgAlias, // E.g. backup/DevOrg
      backupOrgFolder: string = backupFolder + MdapiCommon.PATH_SEP + iso, // E.g. backup/DevOrg/2000-00-00T11-11-11

      backupProjectFile: string = backupOrgFolder + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip,
      backupProjectFile1: string = backupOrgFolder + MdapiCommon.PATH_SEP + MdapiConfig.unpackaged1Zip,
      backupProjectFile2: string = backupOrgFolder + MdapiCommon.PATH_SEP + MdapiConfig.unpackaged2Zip,
      sourceProjectFile: string = this.retrievedPath + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip,
      sourceProjectFile1: string = this.retrievedPath + MdapiCommon.PATH_SEP + MdapiConfig.unpackaged1Folder + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip,
      sourceProjectFile2: string = this.retrievedPath + MdapiCommon.PATH_SEP + MdapiConfig.unpackaged2Folder + MdapiCommon.PATH_SEP + MdapiConfig.unpackagedZip;

    if (!this.ignoreBackup) {

      if (!existsSync(MdapiCommon.backupRoot)) {

        mkdirSync(MdapiCommon.backupRoot);

      }// End if

      if (!existsSync(backupFolder)) {

        mkdirSync(backupFolder);

      }// End if

      if (!existsSync(backupOrgFolder)) {

        mkdirSync(backupOrgFolder);

      }// End if

      if (this.splitMode === false) {

        this.ux.log(`backing up from ${sourceProjectFile} to ${backupProjectFile}`);
        copyFileSync(
          sourceProjectFile,
          backupProjectFile
        );
        this.ux.log(`backup finished to file ${backupProjectFile}`);

      } else {

        this.ux.log(`backing up from ${sourceProjectFile1} to ${backupProjectFile1}`);
        copyFileSync(
          sourceProjectFile1,
          backupProjectFile1
        );
        this.ux.log(`backup finished to file ${backupProjectFile1}`);

        this.ux.log(`backing up from ${sourceProjectFile2} to ${backupProjectFile2}`);
        copyFileSync(
          sourceProjectFile2,
          backupProjectFile2
        );
        this.ux.log(`backup finished to file ${backupProjectFile2}`);
      }

    }// End if

    if (existsSync(sourceProjectFile)) {

      unlinkSync(sourceProjectFile);
      this.ux.log(`deleting file ${sourceProjectFile}`);

    }// End if

    if (this.splitMode === true) {
      removeSync(this.retrievedPath1);

      removeSync(this.retrievedPath2);
    }


  }// End method

  protected async unzipUnpackaged(): Promise<void> {

    return new Promise((resolve, reject) => {

      this.ux.log(`unzipping ${this.zipFilePath}`);

      yauzl.open(
        this.zipFilePath,
        { "lazyEntries": true },
        (openErr, zipfile) => {

          if (openErr) {

            return reject(openErr);

          }// End if

          zipfile.readEntry();

          zipfile.once(
            "close",
            () => {

              this.ux.log("unzipping complete");
              resolve();

            }
          );// End close

          zipfile.on(
            "entry",
            (entry: any) => {

              zipfile.openReadStream(
                entry,
                (unzipErr, readStream) => {

                  if (unzipErr) {

                    return reject(unzipErr);

                  }// End if
                  else if ((/\/$/).test(entry.fileName)) { // Read directory

                    zipfile.readEntry();

                    return;

                  }// End else if
                  let outputDir = path.join(
                    this.targetDirectoryUnpackaged,
                    path.dirname(entry.fileName)
                  ),
                    outputFile = path.join(
                      this.targetDirectoryUnpackaged,
                      entry.fileName
                    );

                  mkdirp(
                    outputDir,
                    (mkdirErr: any) => {

                      if (mkdirErr) {

                        return reject(mkdirErr);

                      }// End if
                      readStream.pipe(createWriteStream(outputFile));
                      readStream.on(
                        "end",
                        () => {

                          zipfile.readEntry();

                        }
                      );

                    }
                  ); // End mkdirp

                }
              ); // End open stream

            }
          ); // End on

        }
      ); // End open

    }); // End promise

  }// End method

  protected async setupRetrieveDirectory(): Promise<void> {

    this.ux.log(`refreshing retrieve directory: ${this.retrievedPath}`);

    if (existsSync(this.retrievedPath)) {

      removeSync(this.retrievedPath);

    }// End if

    mkdirSync(this.retrievedPath);

    this.ux.log("retrieve directory created");

  }// End method.

  protected async retrieveMetadata(): Promise<void> {

    await this.setupRetrieveDirectory();

    if (this.splitMode === false) {
      // return this.retrieveMetadataCompletePackage();
      await this.retrieveMetadataCompletePackage();
    }
    else {
      await this.retrieveMetadataPackage1();

      // return this.retrieveMetadataPackage2();
      await this.retrieveMetadataPackage2();
    }

  }// End method

  protected async retrieveMetadataCompletePackage(): Promise<void> {
    return new Promise((resolve, reject) => {

      let retrieveCommand = `sfdx force:mdapi:retrieve -s -k ${this.filePackageXmlPath
        } -r ${this.retrievedPath} -w -1 -u ${this.orgAlias}`;

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

  protected async retrieveMetadataPackage1(): Promise<void> {
    return new Promise((resolve, reject) => {

      let retrieveCommand = `sfdx force:mdapi:retrieve -s -k ${this.filePackage1XmlPath
        } -r ${this.retrievedPath1} -w -1 -u ${this.orgAlias}`;

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

  protected async retrieveMetadataPackage2(): Promise<void> {
    return new Promise((resolve, reject) => {

      let retrieveCommand = `sfdx force:mdapi:retrieve -s -k ${this.filePackage2XmlPath
        } -r ${this.retrievedPath2} -w -1 -u ${this.orgAlias}`;

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


  protected packageFiles(): void {

    if (!existsSync(this.manifestDirectory)) {

      mkdirSync(this.manifestDirectory);
      this.ux.log(`created manifest directory: ${this.manifestDirectory}`);

    }// End if

    MdapiConfig.createPackageFile(
      this.config,
      this.settings,
      this.filePackageXmlPath
    );

    if (this.splitMode) {
      this.ux.log(`splitting package.xml files`);

      MdapiConfig.createPackageFile(
        this.config,
        this.settings,
        this.filePackage1XmlPath
      );

      MdapiConfig.createPackageFile(
        this.config,
        this.settings,
        this.filePackage2XmlPath
      );
    }// End if

    if (this.createcsv) {
      //create csv file
      MdapiConfig.createCsvFile(
        this.config,
        this.filePackageCsvPath,
        this.orgAlias
      );
    }

  }// End method

  protected async init(): Promise<void> {

    // Setup config and setting properties
    this.config = MdapiConfig.createConfig();
    this.settings = MdapiConfig.createSettings();

    this.settings.ignoreHiddenOrNonEditable = this.ignoreHiddenOrNonEditable;
    this.settings.ignoreInstalled = this.ignoreInstalled;
    this.settings.ignoreNamespaces = this.ignoreNamespaces;
    this.settings.ignoreStaticResources = this.ignoreStaticResources;
    this.settings.ignoreFolders = this.ignoreFolders;
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

  protected async unzip(): Promise<void> {

    if (existsSync(this.targetDirectorySource)) {

      removeSync(this.targetDirectorySource);

    }// End if

    if (this.splitMode === false) {

      await MdapiConfig.unzipUnpackaged(
        this.zipFilePath,
        this.targetDirectoryUnpackaged
      );

      // Rename unmanaged to src
      await rename(
        this.targetDirectoryUnpackaged,
        this.targetDirectorySource
      );
    }// End if
    else {

      await MdapiConfig.unzipUnpackaged(
        this.zipFilePath1,
        this.targetDirectoryUnpackaged1
      );

      await rename(
        this.targetDirectoryUnpackaged1,
        this.targetDirectorySource1
      );

      copySync(this.targetDirectorySource1, this.targetDirectorySource);

      await MdapiConfig.unzipUnpackaged(
        this.zipFilePath2,
        this.targetDirectoryUnpackaged2
      );

      await rename(
        this.targetDirectoryUnpackaged2,
        this.targetDirectorySource2
      );

      copySync(this.targetDirectorySource2, this.targetDirectorySource);

      removeSync(this.targetDirectorySourcePackageXml);

      copyFileSync(this.filePackageXmlPath, this.targetDirectorySourcePackageXml);

    } // End else

  }// End method

  protected doesMetaItemStartWithFilter(metaItem: FileProperties): boolean {
    //starts with check
    let foundFlag: boolean = false;
    if (this.startsWithFilters !== null) {
      try {
        this.startsWithFilters.forEach(filter => {
          if (metaItem.fullName.startsWith(filter)) {
            foundFlag = true;
            throw 'Break';
          }
        });
      } catch (e) {
        if (e !== 'Break') throw e;
      }
    }// End if
    return foundFlag;
  }// End method

  protected doesMetaItemContainFilter(metaItem: FileProperties): boolean {
    //contains check
    let foundFlag: boolean = false;
    if (this.containsFilters !== null) {
      try {
        this.containsFilters.forEach(filter => {
          if (metaItem.fullName.includes(filter)) {
            foundFlag = true;
            throw 'Break';
          }
        });
      } catch (e) {
        if (e !== 'Break') throw e;
      }
      return foundFlag;
    }// End if
  }// End method

  protected doesMetaItemEndWithFilter(metaItem: FileProperties): boolean {
    //ends with check
    let foundFlag: boolean = false;
    if (this.endsWithFilters !== null) {
      try {
        this.endsWithFilters.forEach(filter => {
          if (metaItem.fullName.endsWith(filter)) {
            foundFlag = true;
            throw 'Break';
          }
        });
      } catch (e) {
        if (e !== 'Break') throw e;
      }
    }// End if
    return foundFlag;
  }// End method

  protected doesMetaItemMatchFilter(metaItem: FileProperties): boolean {
    //extact match check 
    let foundFlag: boolean = false;
    if (this.matchFilters !== null) {
      try {
        this.matchFilters.forEach(filter => {
          if (metaItem.fullName === filter) {
            foundFlag = true;
            throw 'Break';
          }
        });
      } catch (e) {
        if (e !== 'Break') throw e;
      }
    }// End if
    return foundFlag;
  }// End method

  protected doesMetaItemIncludeType(metaItem: FileProperties): boolean {
    //contains type not already previously found
    let foundFlag: boolean = false;
    if (this.includeTypes !== null && !foundFlag) {
      try {
        this.includeTypes.forEach(filter => {
          if (metaItem.type === filter) {
            foundFlag = true;
            throw 'Break';
          }
        });
      } catch (e) {
        if (e !== 'Break') throw e;
      }
    }// End if
    return foundFlag;
  }

  protected excludeMetaItemStartWithFilter(metaItem: FileProperties): boolean {
    //exclude starts with check
    let foundFlag: boolean = false;
    if (this.excludeStartsWithFilters !== null) {
      try {
        this.excludeStartsWithFilters.forEach(filter => {
          if (metaItem.fullName.startsWith(filter)) {
            foundFlag = true;
            throw 'Break';
          }
        });
      } catch (e) {
        if (e !== 'Break') throw e;
      }
    }// End if
    return foundFlag;
  }// End method

  protected excludeMetaItemContainFilter(metaItem: FileProperties): boolean {
    //exclude contains check
    let foundFlag: boolean = false;
    if (this.excludeContainsFilters !== null) {
      try {
        this.excludeContainsFilters.forEach(filter => {
          if (metaItem.fullName.includes(filter)) {
            foundFlag = true;
            throw 'Break';
          }
        });
      } catch (e) {
        if (e !== 'Break') throw e;
      }
      return foundFlag;
    }// End if
  }// End method

  protected excludeMetaItemEndWithFilter(metaItem: FileProperties): boolean {
    //exclude ends with check
    let foundFlag: boolean = false;
    if (this.excludeEndsWithFilters !== null) {
      try {
        this.excludeEndsWithFilters.forEach(filter => {
          if (metaItem.fullName.endsWith(filter)) {
            foundFlag = true;
            throw 'Break';
          }
        });
      } catch (e) {
        if (e !== 'Break') throw e;
      }
    }// End if
    return foundFlag;
  }// End method

  protected excludeMetaItemMatchFilter(metaItem: FileProperties): boolean {
    //exclude extact match check 
    let foundFlag: boolean = false;
    if (this.excludeMatchFilters !== null) {
      try {
        this.excludeMatchFilters.forEach(filter => {
          if (metaItem.fullName === filter) {
            foundFlag = true;
            throw 'Break';
          }
        });
      } catch (e) {
        if (e !== 'Break') throw e;
      }
    }// End if
    return foundFlag;
  }// End method

  protected isMetaItemInIncludeFilters(metaItem: FileProperties): boolean {
    return this.isMetaItemFiltersEmpty() ||
      this.doesMetaItemIncludeType(metaItem) ||
      this.doesMetaItemStartWithFilter(metaItem) ||
      this.doesMetaItemContainFilter(metaItem) ||
      this.doesMetaItemEndWithFilter(metaItem) ||
      this.doesMetaItemMatchFilter(metaItem);
  }

  protected isMetaItemFiltersEmpty(): boolean {
    return (this.containsFilters === null) &&
      (this.startsWithFilters === null) &&
      (this.endsWithFilters === null) &&
      (this.matchFilters === null);
  }

  protected isMetaItemInExcludeFilters(metaItem: FileProperties): boolean {
    return !this.isMetaItemExcludeFiltersEmpty() &&
      (this.excludeMetaItemStartWithFilter(metaItem) ||
        this.excludeMetaItemContainFilter(metaItem) ||
        this.excludeMetaItemEndWithFilter(metaItem) ||
        this.excludeMetaItemMatchFilter(metaItem));
  }

  protected isMetaItemExcludeFiltersEmpty(): boolean {
    return (this.excludeContainsFilters === null) &&
      (this.excludeStartsWithFilters === null) &&
      (this.excludeEndsWithFilters === null) &&
      (this.excludeMatchFilters === null);
  }

  protected async queryListMetadata(params: Array<Params>): Promise<void> {

    return new Promise((resolve, reject) => {

      let metaQueries: Array<ListMetadataQuery> = [];

      for (let x = 0; x < params.length; x++) {
        let param: Params = params[x];
        if (param.folder) {
          metaQueries.push(
            {
              "type": param.metaType,
              "folder": param.folder
            });
        } else {
          metaQueries.push({ "type": param.metaType });
        }// End else
      }// End for

      this.org.getConnection().metadata.list(metaQueries, this.apiVersion)
        .then((result: Array<FileProperties>) => {

          result = MdapiCommon.objectToArray(result);

          for (let x = 0; x < result.length; x++) {

            let metaItem: FileProperties = result[x];

            this.patchMetaItem(metaItem);

            if (metaItem.manageableState === MdapiConfig.deleted ||
              metaItem.manageableState === MdapiConfig.deprecated) {

              this.ux.log(`ignoring ${JSON.stringify(metaItem)}`);
              continue;

            }// End if

            if (!MdapiConfig.ignoreInstalled(this.settings, metaItem) &&
              !MdapiConfig.ignoreNamespaces(this.settings, metaItem) &&
              !MdapiConfig.ignoreHiddenOrNonEditable(this.settings, metaItem)) {

              //meta item name filters check
              if (!this.isMetaItemInExcludeFilters(metaItem) && this.isMetaItemInIncludeFilters(metaItem)) {
                this.config.metadataObjectMembersLookup[metaItem.type].push(metaItem);
              }

            }// End if

          }// End for

          resolve();

        }, (error: any) => {
          this.ux.error(error);
          reject();
        });// End promise
    });
  }// End method

  protected patchMetaItem(metaItem: FileProperties): void {
    if (!metaItem.type) {
      if (metaItem.fileName.startsWith(MdapiConfig.globalValueSetTranslations)) {
        metaItem.type = MdapiConfig.GlobalValueSetTranslation;
      }
      else if (metaItem.fileName.startsWith(MdapiConfig.standardValueSetTranslations)) {
        metaItem.type = MdapiConfig.StandardValueSetTranslation;
      }
      else {
        throw "Unexpected no type value for metadata item: " + JSON.stringify(metaItem);
      }
    }// End if
  }

  protected async listMetadataBatch(metaTypes: Array<string>): Promise<void> {

    let params: Array<Params> = [];

    for (let x = 0; x < metaTypes.length; x++) {
      params.push({ "metaType": metaTypes[x] });
    }

    await this.queryListMetadata(params);

  }// End method

  protected isExcludedType(metaType: string) {
    if (this.excludedTypes) {
      for (let x = 0; x < this.excludedTypes.length; x++) {
        if (this.excludedTypes[x] === metaType) {
          return true;
        }
      }
    }
    return false;
  }

  protected async listMetadata(): Promise<void> {

    // this.transientMetadataTypes = [...this.config.metadataTypes];
    this.transientMetadataTypes = [];

    for (let z = 0; z < this.config.metadataTypes.length; z++) {
      const metaType = this.config.metadataTypes[z];
      if (!this.isExcludedType(metaType)) {
        this.transientMetadataTypes.push(metaType);
      }
      else {
        this.ux.warn(`excluding type ${metaType}`);
      }
    }

    let chunks: Array<Array<string>> = [];

    for (let i = 0; i < this.transientMetadataTypes.length; i += this.METADATA_LIST_CHUNK_SIZE) {
      const chunk: Array<string> = this.transientMetadataTypes.slice(i, i + this.METADATA_LIST_CHUNK_SIZE);
      chunks.push(chunk);
    }

    for (let x = 0; x < chunks.length; x++) {
      this.ux.setSpinnerStatus(`chunk ${x + 1} of ${chunks.length}`);
      await this.listMetadataBatch(chunks[x]);
    }

  }// End method

  protected async listMetadataFolderBatch(config: IConfig, metaType: string): Promise<void> {

    let folderType: string = MdapiConfig.metadataTypeFolderLookup[metaType],
      folderArray: Array<FileProperties> = config.metadataObjectMembersLookup[folderType];

    if (this.isExcludedType(metaType)) {
      this.ux.warn(`excluding type ${metaType}`);
    }
    else if (folderArray && folderArray.length > 0) {

      for (let x = 0; x < folderArray.length; x++) {

        let metaItem: FileProperties = folderArray[x];

        let folderName: string = metaItem.fullName,
          param = <Params>{
            metaType,
            "folder": folderName
          };

        // need to ensure both the folder and the report are include in the filter criteria
        if (!this.isMetaItemInExcludeFilters(metaItem) && this.isMetaItemInIncludeFilters(metaItem)) {
          // Inject the folder before
          this.config.metadataObjectMembersLookup[metaType].push(metaItem);
        }

        //config.metadataObjectMembersLookup[metaType].push(folderArray[x]);
        await this.queryListMetadata([param]);

      }// End for
    }

  }// End method

  protected async listMetadataFolders(): Promise<void> {

    if (!this.ignoreFolders) {

      this.ux.setSpinnerStatus(`retrieving dashboard folders`);
      await this.listMetadataFolderBatch(
        this.config,
        MdapiConfig.Dashboard
      );
      this.ux.setSpinnerStatus(`retrieving document folders`);
      await this.listMetadataFolderBatch(
        this.config,
        MdapiConfig.Document
      );
      this.ux.setSpinnerStatus(`retrieving email template folders`);
      await this.listMetadataFolderBatch(
        this.config,
        MdapiConfig.EmailTemplate
      );
      this.ux.setSpinnerStatus(`retrieving report folders`);
      await this.listMetadataFolderBatch(
        this.config,
        MdapiConfig.Report
      );

    }// End if

  }// End method

  protected checkStageOrDevModePackageXml(): void {

    if (this.devMode) {

      copySync(
        this.filePackageXmlPath,
        MdapiConfig.packageXml
      );
      this.ux.log(`copied ${MdapiConfig.packageXml} file`);

    }// End if

  }// End method

  protected checkStageOrDevModeFiles(): void {

    if (this.devMode) {

      if (existsSync(MdapiConfig.srcFolder)) {

        removeSync(MdapiConfig.srcFolder);

      }// End if

      mkdirSync(MdapiConfig.srcFolder);

      copySync(
        this.targetDirectorySource,
        MdapiConfig.srcFolder
      );
      this.ux.log(`copied to ${MdapiConfig.srcFolder}`);

      if (existsSync(MdapiCommon.stageRoot)) {

        removeSync(MdapiCommon.stageRoot);
        this.ux.log(`deleted ${MdapiCommon.stageRoot}`);

      }// End if

      removeSync(MdapiCommon.stageRoot);

      if (existsSync(MdapiCommon.backupRoot)) {

        removeSync(MdapiCommon.backupRoot);
        this.ux.log(`deleted ${MdapiCommon.backupRoot}`);

      }// End if

    }// End if

  }// End method

  protected async describeMetadata(): Promise<void> {
    await MdapiConfig.describeMetadata(
      this.org,
      this.config,
      this.settings
    );
  }

  /**
   * Queries and includes ommitted RecordTypes into config
   * @param org
   * @param config
   */
  protected async resolvePersonAccountRecordTypesQuery(org: Org, config: IConfig): Promise<void> {

    return new Promise((resolve, reject) => {

      org.getConnection().query("SELECT DeveloperName, SobjectType, IsPersonType FROM RecordType " +
        " WHERE SobjectType = 'Account' AND IsPersonType = true").
        then(
          (result: QueryResult<any>) => {

            if (result.records) {

              for (let x = 0; x < result.records.length; x++) {

                let record: object = result.records[x],
                  personRecordType: string = MdapiConfig.PersonAccount + MdapiCommon.DOT + record[MdapiConfig.DeveloperName];

                const metaItem: FileProperties = <FileProperties>{
                  "type": MdapiConfig.RecordType,
                  "createdById": null,
                  "createdByName": null,
                  "createdDate": null,
                  "fileName": null,
                  "fullName": personRecordType,
                  "id": null,
                  "lastModifiedById": null,
                  "lastModifiedByName": null,
                  "lastModifiedDate": null,
                  "manageableState": null,
                  "namespacePrefix": null
                }// End push

                //meta item name filters check
                if (!this.isMetaItemInExcludeFilters(metaItem) && this.isMetaItemInIncludeFilters(metaItem)) {
                  config.metadataObjectMembersLookup[MdapiConfig.RecordType].push(metaItem);
                }
              }// End for

            }// End if
            resolve();
          },
          (error: any) => {
            if (error && error instanceof Object) {
              let errorString: string = JSON.stringify(error);
              if (errorString.includes(MdapiConfig.INVALID_FIELD)) {
                console.log("ignoring person accounts not activated in org");
                resolve();
                return;
              }// End if
            }// End if
            reject(error);
          }
        );
    });// End promise

  }// End method

  /**
    * Set StandardValueSets names list not queryable
    * https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/standardvalueset_names.htm
    * @param config
    */
  protected setStandardValueSetsMetaItems(config: IConfig): void {

    for (let x = 0; x < MdapiConfig.standardValueSets.length; x++) {

      let metaItem: FileProperties = <FileProperties>
        {
          "type": MdapiConfig.StandardValueSet,
          "createdById": null,
          "createdByName": null,
          "createdDate": null,
          "fileName": null,
          "fullName": MdapiConfig.standardValueSets[x],
          "id": null,
          "lastModifiedById": null,
          "lastModifiedByName": null,
          "lastModifiedDate": null,
          "manageableState": null,
          "namespacePrefix": null
        }

      if (!this.isMetaItemInExcludeFilters(metaItem) && this.isMetaItemInIncludeFilters(metaItem)) {
        config.metadataObjectMembersLookup[MdapiConfig.StandardValueSet].push(metaItem);
      }

    }// End for

  }// End method

  protected async resolvePersonAccountRecordTypes(): Promise<void> {
    if (!this.isExcludedType(MdapiConfig.RecordType)) {
      await this.resolvePersonAccountRecordTypesQuery(
        this.org,
        this.config
      );
    }
    else {
      this.ux.warn(`excluding type PersonAccount RecordTypes`);
    }
  }

  protected async setStandardValueSets(): Promise<void> {
    if (!this.isExcludedType(MdapiConfig.StandardValueSet)) {
      this.setStandardValueSetsMetaItems(this.config);
    }
    else {
      this.ux.warn(`excluding type StandardValueSet`);
    }
  }

  public async process(): Promise<void> {

    try {

      // Init
      this.ux.startSpinner("initialising");
      await this.init();
      this.ux.stopSpinner();

      // Async calls
      this.ux.startSpinner("describe metadata");
      await this.describeMetadata();
      this.ux.stopSpinner();

      this.ux.startSpinner("list metadata");
      await this.listMetadata();
      this.ux.stopSpinner();

      this.ux.startSpinner("list folders");
      await this.listMetadataFolders();
      this.ux.stopSpinner();

      this.ux.startSpinner("resolve personaccount recordtypes");
      await this.resolvePersonAccountRecordTypes();
      this.ux.stopSpinner();

      // Sync calls
      this.setStandardValueSets();

      // Create package.xml
      this.ux.startSpinner("create manifest file(s)");
      this.packageFiles();
      this.ux.stopSpinner();

      this.checkStageOrDevModePackageXml();

      if (!this.manifestOnly) {

        // Retrieve metadata files
        this.ux.startSpinner("retrieve metadata (please standby)");
        await this.retrieveMetadata();
        this.ux.stopSpinner();

        // Unzip retrieved zip
        this.ux.startSpinner("unzipping package");
        await this.unzip();
        this.ux.stopSpinner();

        // Backup zip
        this.ux.startSpinner("backup zip");
        this.backup();
        this.ux.stopSpinner();

        // Check if staging only or clean for src dev only
        this.ux.startSpinner("finishing up");
        this.checkStageOrDevModeFiles();
        this.ux.stopSpinner();

      }// End client

    } catch (exception) {

      this.ux.error('process() exception: ' + exception);

    }// End catch

  }// End process

}// End class
