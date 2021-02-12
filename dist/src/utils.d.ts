import { Space } from "contentful-management/dist/typings/entities/space";
import { BranchNames, EnvironmentProps } from "./types";
export declare const Logger: {
    log(message: any): void;
    success(message: any): void;
    error(message: any): void;
    warn(message: any): void;
};
/**
 * Promise based delay
 * @param time
 */
export declare const delay: (time?: number) => Promise<unknown>;
/**
 * Convert fileNames to integers
 * @example
 * filenameToVersion("1.js") // 1
 */
export declare const filenameToVersion: (file: any) => number;
/**
 * Convert integers to filenames
 * @example
 * versionToFilename(1) // 1.js
 */
export declare const versionToFilename: (version: string) => string;
/**
 * Convert a branchName to a valid environmentName
 * @param branchName
 */
export declare const branchNameToEnvironmentName: (branchName: string) => string;
export declare enum Matcher {
    YY = "YY",
    YYYY = "YYYY",
    MM = "MM",
    DD = "DD",
    hh = "hh",
    mm = "mm",
    ss = "ss",
    branch = "branch"
}
export declare const matchers: {
    ss: (date: any) => string;
    hh: (date: any) => string;
    mm: (date: any) => string;
    YYYY: (date: any) => string;
    YY: (date: any) => string;
    MM: (date: any) => string;
    DD: (date: any) => string;
    branch: (branchName: any) => string;
};
export interface NameToPatternArgs {
    branchName?: string;
}
/**
 *
 * @param pattern
 * @param branchName
 */
export declare const getNameFromPattern: (pattern: string, { branchName }?: NameToPatternArgs) => string;
/**
 * Get the branchNames based on the eventName
 */
export declare const getBranchNames: () => BranchNames;
/**
 * Get the environment from a space
 * Checks if an environment already exists and then flushes it
 * @param space
 * @param branchNames
 */
export declare const getEnvironment: (space: Space, branchNames: BranchNames) => Promise<EnvironmentProps>;
