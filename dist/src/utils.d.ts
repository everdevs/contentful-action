import { Space } from "contentful-management/dist/typings/entities/space";
import { BranchNames, EnvironmentProps } from "./types";
export declare const Logger: {
    log(message: any): void;
    success(message: any): void;
    error(message: any): void;
    warn(message: any): void;
    verbose(message: any): void;
};
/**
 *
 * @param {string} v
 * @returns {string}
 */
export declare const getLabel: (v: string) => string;
/**
 *
 * @type {string[]}
 */
export declare const ratings: string[];
/**
 *
 * @param {string} s
 * @returns {number}
 */
export declare const getRatingWeight: (s: string) => number;
/**
 *
 * @param arr
 */
export declare const sortSemver: (arr: string[]) => string[];
/**
 * Promise based delay
 * @param time
 */
export declare const delay: (time?: number) => Promise<void>;
/**
 * Convert fileNames to integers
 * @example
 * filenameToVersion("1.js") // "1"
 * filenameToVersion("1.0.1.js") // "1.0.1"
 */
export declare const filenameToVersion: (file: string) => string;
/**
 * Convert integers to filenames
 * @example
 * versionToFilename("1") // "1.js"
 * versionToFilename("1.0.1") // "1.0.1.js"
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
    ss: (date: Date) => string;
    hh: (date: Date) => string;
    mm: (date: Date) => string;
    YYYY: (date: Date) => string;
    YY: (date: Date) => string;
    MM: (date: Date) => string;
    DD: (date: Date) => string;
    branch: (branchName: string) => string;
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
