import { exec } from "child_process";

export class Common {

    public static stageRoot: string = 'stage';
    public static backupRoot: string = 'backup';
    public static retrieveRoot: string = 'retrieve';

    public static PATH_SEP = '/';
    public static TWO_SPACE: string = '  ';
    public static FOUR_SPACE: string = '    ';

    private static bufferOptions: Object = { maxBuffer: 10 * 1024 * 1024 };

    public static command(cmd: string): Promise<any> {

        return new Promise((resolve, reject) => {
            exec(cmd, Common.bufferOptions, (error: any, stdout: any, stderr: any) => {
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

}// end class