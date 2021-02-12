import * as core from "@actions/core";
import * as github from "@actions/github";
import { createClient } from "contentful-management";
import { Space } from "contentful-management/dist/typings/entities/space";
import { runMigration } from "contentful-migration/built/bin/cli";
import { readdir } from "fs";
import path from "path";
import { promisify } from "util";
import chalk from "chalk";

// Force colors on github
chalk.level = 3;

const Logger = {
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

import { BranchNames, EnvironmentProps, EventNames } from "./types";

const readdirAsync = promisify(readdir);

const {
  SPACE_ID,
  MANAGEMENT_API_KEY,
  GITHUB_WORKSPACE,
  INPUT_MIGRATIONS_DIR,
  INPUT_DELETE_FEATURE,
  INPUT_SET_ALIAS,
  INPUT_FEATURE_PATTERN,
  INPUT_MASTER_PATTERN,
  INPUT_VERSION_CONTENT_TYPE,
  INPUT_VERSION_FIELD,
} = process.env;

const DEFAULT_MIGRATIONS_DIR = "migrations";
const DEFAULT_MASTER_PATTERN = "master-[YYYY]-[MM]-[DD]-[mmss]";
const DEFAULT_FEATURE_PATTERN = "GH-[branch]";
const DEFAULT_VERSION_CONTENT_TYPE = "versionTracking";
const DEFAULT_VERSION_FIELD = "version";

const VERSION_CONTENT_TYPE =
  INPUT_VERSION_CONTENT_TYPE || DEFAULT_VERSION_CONTENT_TYPE;
const FEATURE_PATTERN = INPUT_FEATURE_PATTERN || DEFAULT_FEATURE_PATTERN;
const MASTER_PATTERN = INPUT_MASTER_PATTERN || DEFAULT_MASTER_PATTERN;
const VERSION_FIELD = INPUT_VERSION_FIELD || DEFAULT_VERSION_FIELD;
const MIGRATIONS_DIR = path.join(
  GITHUB_WORKSPACE,
  INPUT_MIGRATIONS_DIR || DEFAULT_MIGRATIONS_DIR
);

const CONTENTFUL_MASTER = "master";
const DELAY = 3000;
const MAX_NUMBER_OF_TRIES = 10;

/**
 * Promise based delay
 * @param time
 */
const delay = (time = DELAY) =>
  new Promise((resolve) => setTimeout(resolve, time));

/**
 * Convert fileNames to integers
 * @example
 * filenameToVersion("1.js") // 1
 */
const filenameToVersion = (file) =>
  parseInt(file.replace(/\.js$/, "").replace(/_/g, "."), 10);

/**
 * Convert integers to filenames
 * @example
 * versionToFilename(1) // 1.js
 */
const versionToFilename = (version: string) =>
  version.replace(/\./g, "_") + ".js";

/**
 * Convert a branchName to a valid environmentName
 * @param branchName
 */
const branchNameToEnvironmentName = (branchName: string) =>
  branchName.replace(/[\/_.]/g, "-");

enum Matcher {
  YY = "YY",
  YYYY = "YYYY",
  MM = "MM",
  DD = "DD",
  hh = "hh",
  mm = "mm",
  ss = "ss",
  branch = "branch",
}

const matchers = {
  [Matcher.ss]: (date) => `${date.getUTCSeconds()}`.padStart(2, "0"),
  [Matcher.hh]: (date) => `${date.getUTCHours()}`.padStart(2, "0"),
  [Matcher.mm]: (date) => `${date.getUTCMinutes()}`.padStart(2, "0"),
  [Matcher.YYYY]: (date) => `${date.getUTCFullYear()}`,
  [Matcher.YY]: (date) => `${date.getUTCFullYear()}`.substr(2, 2),
  [Matcher.MM]: (date) => `${date.getUTCMonth() + 1}`.padStart(2, "0"),
  [Matcher.DD]: (date) => `${date.getDate()}`.padStart(2, "0"),
  [Matcher.branch]: (branchName) => branchNameToEnvironmentName(branchName),
};

interface NameToPatternArgs {
  branchName?: string;
}
const getNameFromPattern = (
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
const getBranchNames = (): BranchNames => {
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
const getEnvironment = async (
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

/**
 *
 * @param space
 */
const runAction = async (space): Promise<void> => {
  const branchNames = getBranchNames();
  const { environmentId, environment, environmentNames } = await getEnvironment(
    space,
    branchNames
  );

  // Counter to limit retries
  let count = 0;

  Logger.log("Waiting for environment processing...");
  while (count < MAX_NUMBER_OF_TRIES) {
    const status = (await space.getEnvironment(environment.sys.id)).sys.status
      .sys.id;

    if (status === "ready") {
      Logger.success(
        `Successfully processed new environment: "${environmentId}"`
      );
      break;
    }

    if (status === "failed") {
      Logger.warn("Environment creation failed");
      break;
    }

    await delay();
    count++;
  }

  Logger.log("Update API Keys to allow access to new environment");
  const newEnv = {
    sys: {
      type: "Link",
      linkType: "Environment",
      id: environmentId,
    },
  };

  const { items: keys } = await space.getApiKeys();
  await Promise.all(
    keys.map((key) => {
      Logger.log(`Updating: "${key.sys.id}"`);
      key.environments.push(newEnv);
      return key.update();
    })
  );

  Logger.log("Set default locale to new environment");
  const defaultLocale = (await environment.getLocales()).items.find(
    (locale) => locale.default
  ).code;

  Logger.log("Read all the available migrations from the file system");
  // Check for available migrations
  // Migration scripts need to be sorted in order to run without conflicts
  const availableMigrations = (await readdirAsync(MIGRATIONS_DIR))
    .filter((file) => /^\d+?\.js$/.test(file))
    .map((file) => filenameToVersion(file))
    .sort((a, b) => a - b)
    .map((num) => `${num}`);

  Logger.log("Find current version of the contentful space");
  const { items: versions } = await environment.getEntries({
    content_type: VERSION_CONTENT_TYPE,
  });

  // If there is no entry or more than one of CONTENTFUL_VERSION_TRACKING
  // Then throw an Error and abort
  if (versions.length === 0) {
    throw new Error(
      `There should be exactly one entry of type "${VERSION_CONTENT_TYPE}"`
    );
  }

  if (versions.length > 1) {
    throw new Error(
      `There should only be one entry of type "${VERSION_CONTENT_TYPE}"`
    );
  }

  const [storedVersionEntry] = versions;
  const currentVersionString =
    storedVersionEntry.fields[VERSION_FIELD][defaultLocale];

  Logger.log("Evaluate which migrations to run");
  const currentMigrationIndex = availableMigrations.indexOf(
    currentVersionString
  );

  // If the migration can't be found
  // Then abort
  if (currentMigrationIndex === -1) {
    throw new Error(
      `Version ${currentVersionString} is not matching with any known migration`
    );
  }

  const migrationsToRun = availableMigrations.slice(currentMigrationIndex + 1);
  const migrationOptions = {
    spaceId: SPACE_ID,
    environmentId,
    accessToken: MANAGEMENT_API_KEY,
    yes: true,
  };

  Logger.log("Run migrations and update version entry");
  // Allow mutations
  let migrationToRun;
  let mutableStoredVersionEntry = storedVersionEntry;
  while ((migrationToRun = migrationsToRun.shift())) {
    const filePath = path.join(
      MIGRATIONS_DIR,
      versionToFilename(migrationToRun)
    );
    Logger.log(`Running ${filePath}`);
    await runMigration(
      Object.assign(migrationOptions, {
        filePath,
      })
    );
    Logger.success(`Migration script ${migrationToRun}.js succeeded`);

    mutableStoredVersionEntry.fields.version[defaultLocale] = migrationToRun;
    mutableStoredVersionEntry = await mutableStoredVersionEntry.update();
    mutableStoredVersionEntry = await mutableStoredVersionEntry.publish();

    Logger.success(
      `Updated field ${VERSION_FIELD} in ${VERSION_CONTENT_TYPE} entry to ${migrationToRun}`
    );
  }

  Logger.log("Checking if we need to update master alias");
  // If the environmentId starts with "master"
  // Then set the alias to the new environment
  // Else inform the user
  if (environmentId.startsWith(CONTENTFUL_MASTER) && INPUT_SET_ALIAS) {
    Logger.log(`Running on master.`);
    Logger.log(`Updating master alias.`);
    await space
      .getEnvironmentAlias("master")
      .then((alias) => {
        alias.environment.sys.id = environmentId;
        return alias.update();
      })
      .then((alias) => Logger.success(`alias ${alias.sys.id} updated.`))
      .catch(Logger.error);
  } else {
    Logger.log("Running on feature branch");
    Logger.log("No alias changes required");
  }

  // If the sandbox environment should be deleted
  // And the baseRef is the repository default_branch (master|main ...)
  // And the Pull Request has been merged
  // Then delete the sandbox environment
  if (
    INPUT_DELETE_FEATURE &&
    branchNames.baseRef === branchNames.defaultBranch &&
    github.context.payload.pull_request?.merged
  ) {
    try {
      const environmentIdToDelete = `GH-${environmentNames.head}`;
      Logger.log(`Delete the environment: ${environmentIdToDelete}`);
      const environment = await space.getEnvironment(environmentIdToDelete);
      await environment?.delete();
      Logger.success(`Deleted the environment: ${environmentIdToDelete}`);
    } catch (error) {
      Logger.error("Cannot delete the environment");
    }
  }

  // Set the outputs for further actions
  core.setOutput(
    "environment_url",
    `https://app.contentful.com/spaces/${space.sys.id}/environments/${environmentId}`
  );
  core.setOutput("environment_name", environmentId);
  Logger.success("🚀 All done 🚀");
};

(async () => {
  const client = createClient({
    accessToken: MANAGEMENT_API_KEY,
  });
  const space = await client.getSpace(SPACE_ID);
  try {
    await runAction(space);
  } catch (error) {
    Logger.error(error);
    core.setFailed(error.message);
  }
})();
