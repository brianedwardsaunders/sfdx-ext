/**
 * @name MdapiCommon
 * @author brianewardsaunders
 * @date 2019-07-10
 */

import {exec} from "child_process";
import {readFileSync, writeFileSync} from "fs-extra";
import {json2xml, xml2json} from "xml-js";
import path = require("path");

export class MdapiCommon {

    public static stageRoot = "stage";

    public static backupRoot = "backup";

    public static retrievedRoot = "retrieved";

    public static configRoot = "config";

    public static deployRoot = "deploy";

    public static backupExt = ".backup";

    public static _text = "_text";

    public static xml = "xml";

    public static UTF8 = "utf8";

    public static PATH_SEP = "/";

    public static DOT = ".";

    public static ASTERIX = "*";

    public static BLANK = "";

    public static DASH = "-";

    public static TWO_SPACE = "  ";

    public static FOUR_SPACE = "    ";

    public static bufferOptions: object = {"maxBuffer": 10 * 1024 * 1024};

    public static convertOptions: object = {"compact": true,
        "spaces": 4};

    public static jsonSpaces = 2;

    public static command (cmd: string): Promise<any> {

        return new Promise((resolve, reject) => {

            exec(
                cmd,
                MdapiCommon.bufferOptions,
                (error: any, stdout: any, stderr: any) => {

                    if (error) {

                        console.error(stderr);
                        reject(error);

                    }// End if
                    else {

                        resolve(stdout);

                    }// End else

                }
            );

        });// End promise

    }// End method

    public static hashCode (input: string): number {

        let hash = 0;

        if (!input || input.length === 0) {

            return hash;

        }
        for (let i = 0; i < input.length; i++) {

            let chr = input.charCodeAt(i);

            hash = (hash << 5) - hash + chr;
            hash |= 0;

        }// End for

        return hash;

    }// End method

    public static objectToArray<T> (objectOrArray: T | Array<T>): Array<T> {

        let returned: Array<T> = [];

        if (objectOrArray) {

            if (objectOrArray instanceof Array) {

                return objectOrArray;

            }
            returned.push(objectOrArray); // End else

        }// End if

        return returned;

    }// End method

    public static fileToJson<T> (filePath: string): T {

        return JSON.parse(readFileSync(
            filePath,
            MdapiCommon.UTF8
        ));

    }// End method

    public static xmlFileToJson<T> (filePath: string): T {

        let returned = null;

        try {
            returned = JSON.parse(xml2json(
                readFileSync(
                    filePath,
                    MdapiCommon.UTF8
                ),
                MdapiCommon.convertOptions
            ));
        }
        catch (e) {
            console.error(filePath + ' file could not be parsed to json');
        }

        return returned;

    }// End method

    public static jsonToXmlFile (jsonObject: object, filePath: string): void {

        writeFileSync(
            filePath,
            json2xml(
                JSON.stringify(jsonObject),
                MdapiCommon.convertOptions
            )
        );

    }// End method

    public static jsonToFile (jsonObject: object, filePath: string): void {

        writeFileSync(
            filePath,
            JSON.stringify(
                jsonObject,
                null,
                MdapiCommon.jsonSpaces
            ),
            MdapiCommon.convertOptions
        );

    }// End method

    public static isolateLeafNode (filePath: string, pathSeperator?: string): string {

        if (!pathSeperator) {

            pathSeperator = path.sep; // Default

        }// End if
        let items: Array<string> = filePath.split(pathSeperator);

        return items[items.length - 1];

    }// End method

    public static join (segments: Array<string>, joinChar: string): string {

        let returned: string = MdapiCommon.BLANK;

        for (let x = 0; segments && x < segments.length; x++) {

            returned += segments[x];
            if (x < segments.length - 1) {

                returned += joinChar;

            }// End if

        }// End for

        return returned;

    }// End method

}// End class
