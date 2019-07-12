/**
 * @name MdapiCommon
 * @author brianewardsaunders 
 * @date 2019-07-10
 */
import { exec } from "child_process";

export class MdapiCommon {

    public static stageRoot: string = 'stage';
    public static backupRoot: string = 'backup';
    public static retrieveRoot: string = 'retrieve';

    public static UTF8 = 'utf8';
    public static PATH_SEP: string = '/';
    public static DOT: string = '.';
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

    public static objectToArray<T>(objectOrArray: T | Array<T>): Array<T> {
        let returned: Array<T> = [];
        if (objectOrArray) {
            if (objectOrArray instanceof Array) { return objectOrArray; }
            else { returned.push(objectOrArray); }// end else
        }// end if
        return returned;
    }// end method

}// end class