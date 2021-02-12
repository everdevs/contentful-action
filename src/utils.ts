import * as github from "@actions/github";
import chalk from "chalk";
import { Space } from "contentful-management/dist/typings/entities/space";
import {
  CONTENTFUL_MASTER,
  DELAY,
  FEATURE_PATTERN,
  MASTER_PATTERN,
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
};

/**
 * Promise based delay
 * @param time
 */
export const delay = (time = DELAY) =>
  new Promise((resolve) => setTimeout(resolve, time));

/**
 * Convert fileNames to integers
 * @example
 * filenameToVersion("1.js") // 1
 */
export const filenameToVersion = (file) =>
  parseInt(file.replace(/\.js$/, "").replace(/_/g, "."), 10);

/**
 * Convert integers to filenames
 * @example
 * versionToFilename(1) // 1.js
 */
export const versionToFilename = (version: string) =>
  version.replace(/\./g, "_") + ".js";

/**
 * Convert a branchName to a valid environmentName
 * @param branchName
 */
export const branchNameToEnvironmentName = (branchName: string) =>
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
  [Matcher.ss]: (date) => `${date.getUTCSeconds()}`.padStart(2, "0"),
  [Matcher.hh]: (date) => `${date.getUTCHours()}`.padStart(2, "0"),
  [Matcher.mm]: (date) => `${date.getUTCMinutes()}`.padStart(2, "0"),
  [Matcher.YYYY]: (date) => `${date.getUTCFullYear()}`,
  [Matcher.YY]: (date) => `${date.getUTCFullYear()}`.substr(2, 2),
  [Matcher.MM]: (date) => `${date.getUTCMonth() + 1}`.padStart(2, "0"),
  [Matcher.DD]: (date) => `${date.getDate()}`.padStart(2, "0"),
  [Matcher.branch]: (branchName) => branchNameToEnvironmentName(branchName),
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
) => {
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
  // Then create a master environment name
  // Else prefix the branch with GH-*
  const environmentId =
    branchNames.baseRef === branchNames.defaultBranch &&
    github.context.payload.pull_request?.merged
      ? getNameFromPattern(MASTER_PATTERN)
      : getNameFromPattern(FEATURE_PATTERN, {
          branchName: branchNames.headRef,
        });
  Logger.log(`environmentId: "${environmentId}"`);

  // If environment is master
  // Then return it without further actions
  if (environmentId === CONTENTFUL_MASTER) {
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
