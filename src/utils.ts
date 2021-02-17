import * as github from "@actions/github";
import chalk from "chalk";
import { Space } from "contentful-management/dist/typings/entities/space";
import {
  CONTENTFUL_ALIAS,
  DELAY,
  FEATURE_PATTERN,
  MASTER_PATTERN,
  LOG_LEVEL,
} from "./constants";
import { BranchNames, EnvironmentProps, EventNames } from "./types";

// Force colors on github
chalk.level = 3;

export const Logger = {
  log(message) {
    console.log(chalk.white(message));
  },
  success(message) {
    console.log("✅", chalk.green(message));
  },
  error(message) {
    console.log("💩", chalk.red(message));
  },
  warn(message) {
    console.log("⚠️", chalk.yellow(message));
  },
  verbose(message) {
    if (LOG_LEVEL === "verbose") {
      console.log(chalk.white(message));
    }
  },
};

/**
 *
 * @param {string} v
 * @returns {string}
 */
export const getLabel = (v: string) => (/-(.*$)/.exec(v) ?? ["", ""])[1];

/**
 *
 * @type {string[]}
 */
export const ratings = ["alpha", "beta", "rc", ""];

/**
 *
 * @param {string} s
 * @returns {number}
 */
export const getRatingWeight = (s: string) => ratings.indexOf(s);

/**
 *
 * @param arr
 */
export const sortSemver = (arr: string[]): string[] => {
  return arr.sort((a, b) => {
    const cleanA = a.replace(/-.*$/, "");
    const cleanB = b.replace(/-.*$/, "");
    const [aMaj, aMin = "0", aPat = "0"] = cleanA.split(".").map((v) => parseInt(v, 10));
    const [bMaj, bMin = "0", bPat = "0"] = cleanB.split(".").map((v) => parseInt(v, 10));
    if (aMaj > bMaj) {
      return 1;
    }
    if (bMaj > aMaj) {
      return -1;
    }
    if (aMin > bMin) {
      return 1;
    }
    if (bMin > aMin) {
      return -1;
    }
    if (aPat > bPat) {
      return 1;
    }
    if (bPat > aPat) {
      return -1;
    }
    const labelA = getLabel(a);
    const labelB = getLabel(b);
    const [labelAName = "", labelAVersion = "0"] = labelA.split(".");
    const [labelBName = "", labelBVersion = "0"] = labelB.split(".");

    if (getRatingWeight(labelAName) > getRatingWeight(labelBName)) {
      return 1;
    }
    if (getRatingWeight(labelAName) < getRatingWeight(labelBName)) {
      return -1;
    }
    if (parseInt(labelAVersion, 10) > parseInt(labelBVersion, 10)) {
      return 1;
    }
    if (parseInt(labelAVersion, 10) < parseInt(labelBVersion, 10)) {
      return -1;
    }
    return 0;
  });
};

/**
 * Promise based delay
 * @param time
 */
export const delay = (time = DELAY): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, time));

/**
 * Convert fileNames to integers
 * @example
 * filenameToVersion("1.js") // "1"
 * filenameToVersion("1.0.1.js") // "1.0.1"
 */
export const filenameToVersion = (file: string): string =>
  file.replace(/\.js$/, "").replace(/_/g, ".");

/**
 * Convert integers to filenames
 * @example
 * versionToFilename("1") // "1.js"
 * versionToFilename("1.0.1") // "1.0.1.js"
 */
export const versionToFilename = (version: string): string =>
   `${version.replace(/\\./g, "_")}.js`;

/**
 * Convert a branchName to a valid environmentName
 * @param branchName
 */
export const branchNameToEnvironmentName = (branchName: string): string =>
  branchName.replace(/[\/_.]/g, "-");

export enum Matcher {
  YY = "YY",
  YYYY = "YYYY",
  MM = "MM",
  DD = "DD",
  hh = "hh",
  mm = "mm",
  ss = "ss",
  branch = "branch",
}

export const matchers = {
  [Matcher.ss]: (date: Date): string =>
    `${date.getUTCSeconds()}`.padStart(2, "0"),
  [Matcher.hh]: (date: Date): string =>
    `${date.getUTCHours()}`.padStart(2, "0"),
  [Matcher.mm]: (date: Date): string =>
    `${date.getUTCMinutes()}`.padStart(2, "0"),
  [Matcher.YYYY]: (date: Date): string => `${date.getUTCFullYear()}`,
  [Matcher.YY]: (date: Date): string => `${date.getUTCFullYear()}`.substr(2, 2),
  [Matcher.MM]: (date: Date): string =>
    `${date.getUTCMonth() + 1}`.padStart(2, "0"),
  [Matcher.DD]: (date: Date): string => `${date.getDate()}`.padStart(2, "0"),
  [Matcher.branch]: (branchName: string): string =>
    branchNameToEnvironmentName(branchName),
};

export interface NameToPatternArgs {
  branchName?: string;
}

/**
 *
 * @param pattern
 * @param branchName
 */
export const getNameFromPattern = (
  pattern: string,
  { branchName }: NameToPatternArgs = {}
): string => {
  const date = new Date();
  return pattern.replace(
    /\[(YYYY|YY|MM|DD|hh|mm|ss|branch)]/g,
    (substring, match: Matcher) => {
      switch (match) {
        case Matcher.branch:
          return matchers[Matcher.branch](branchName);
        case Matcher.YYYY:
        case Matcher.YY:
        case Matcher.MM:
        case Matcher.DD:
        case Matcher.hh:
        case Matcher.mm:
        case Matcher.ss:
          return matchers[match](date);
        default:
          return substring;
      }
    }
  );
};

/**
 * Get the branchNames based on the eventName
 */
export const getBranchNames = (): BranchNames => {
  const { eventName, payload } = github.context;
  const { default_branch: defaultBranch } = payload.repository;

  // Check the eventName
  switch (eventName) {
    // If pullRequest we need to get the head and base
    case EventNames.pullRequest:
      return {
        baseRef: payload.pull_request.base.ref,
        headRef: payload.pull_request.head.ref,
        defaultBranch,
      };
    // If not pullRequest we need work on the baseRef therefore head is null
    default:
      return {
        headRef: null,
        baseRef: payload.ref.replace(/^refs\/heads\//, ""),
        defaultBranch,
      };
  }
};

/**
 * Get the environment from a space
 * Checks if an environment already exists and then flushes it
 * @param space
 * @param branchNames
 */
export const getEnvironment = async (
  space: Space,
  branchNames: BranchNames
): Promise<EnvironmentProps> => {
  const environmentNames = {
    base: branchNameToEnvironmentName(branchNames.baseRef),
    head: branchNames.headRef
      ? branchNameToEnvironmentName(branchNames.headRef)
      : null,
  };
  // If the Pull Request is merged and the base is the repository default_name (master|main, ...)
  // Then create an environment name for the given master_pattern
  // Else create an environment name for the given feature_pattern
  Logger.verbose(
    `MASTER_PATTERN: ${MASTER_PATTERN} | FEATURE_PATTERN: ${FEATURE_PATTERN}`
  );
  const environmentId =
    branchNames.baseRef === branchNames.defaultBranch &&
    github.context.payload.pull_request?.merged
      ? getNameFromPattern(MASTER_PATTERN)
      : getNameFromPattern(FEATURE_PATTERN, {
          branchName: branchNames.headRef,
        });
  Logger.verbose(`environmentId: "${environmentId}"`);

  // If environment matches ${CONTENTFUL_ALIAS} ("master")
  // Then return it without further actions
  if (environmentId === CONTENTFUL_ALIAS) {
    return {
      environmentNames,
      environmentId,
      environment: await space.getEnvironment(environmentId),
    };
  }
  // Else we need to check for an existing environment and flush it
  Logger.log(
    `Checking for existing versions of environment: "${environmentId}"`
  );

  try {
    const environment = await space.getEnvironment(environmentId);
    await environment?.delete();
    Logger.success(`Environment deleted: "${environmentId}"`);
  } catch (e) {
    Logger.log(`Environment not found: "${environmentId}"`);
  }

  Logger.log(`Creating environment ${environmentId}`);

  return {
    environmentNames,
    environmentId,
    environment: await space.createEnvironmentWithId(environmentId, {
      name: environmentId,
    }),
  };
};
