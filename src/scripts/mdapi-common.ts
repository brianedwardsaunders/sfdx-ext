/**
 * @name MdapiCommon
 * @author brianewardsaunders 
 * @date 2019-07-10
 */

import { exec } from "child_process";
import { readFileSync, writeFileSync } from "fs-extra";
import { xml2json, json2xml } from "xml-js";
import path = require('path');

export class MdapiCommon {

    public static stageRoot: string = 'stage';
    public static backupRoot: string = 'backup';
    public static retrieveRoot: string = 'retrieve';
    public static deployRoot: string = 'deploy';
    public static backupExt: string = ".backup";

    public static _text: string = "_text";
    public static xml: string = 'xml';
    public static UTF8: string = 'utf8';
    public static PATH_SEP: string = '/';
    public static DOT: string = '.';
    public static BLANK: string = '';
    public static DASH: string = '-';
    public static TWO_SPACE: string = '  ';
    public static FOUR_SPACE: string = '    ';

    public static bufferOptions: Object = { maxBuffer: 10 * 1024 * 1024 };
    public static convertOptions: Object = { compact: true, spaces: 4 };

    public static command(cmd: string): Promise<any> {

        return new Promise((resolve, reject) => {
            exec(cmd, MdapiCommon.bufferOptions, (error: any, stdout: any, stderr: any) => {
                if (error) {
                    console.error(stderr);
                    reject(error);
                }// end if
                else {
                    resolve(stdout);
                }// end else
            });
        });

    }// end method

    public static hashCode(input: string): number {
        let hash: number = 0;
        if (input.length === 0) return hash;
        for (var i: number = 0; i < input.length; i++) {
            let chr = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }// end for
        return hash;
    }// end method

    public static objectToArray<T>(objectOrArray: T | Array<T>): Array<T> {
        let returned: Array<T> = [];
        if (objectOrArray) {
            if (objectOrArray instanceof Array) { return objectOrArray; }
            else { returned.push(objectOrArray); }// end else
        }// end if
        return returned;
    }// end method

    public static xmlFileToJson<T>(filePath: string): T {
        return JSON.parse(xml2json(readFileSync(filePath, MdapiCommon.UTF8), MdapiCommon.convertOptions));
    }// end method

    public static jsonToXmlFile(jsonObject: Object, filePath: string): void {
        writeFileSync(filePath, json2xml(JSON.stringify(jsonObject), MdapiCommon.convertOptions));
    }// end method

    public static isolateLeafNode(parentDir: string, pathSeperator?: string): string {
        if (!pathSeperator) {
            pathSeperator = path.sep;
        }
        let items: Array<string> = parentDir.split(pathSeperator);
        return items[items.length - 1];
    }// end method

    public static join(segments: Array<string>, joinChar: string): string {
        let returned: string = MdapiCommon.BLANK;
        for (var x: number = 0; (segments && x < segments.length); x++) {
            returned += segments[x];
            if (x < (segments.length - 1)) {
                returned += joinChar;
            }// end if
        }// end for
        return returned;
    }// end method 

}// end class