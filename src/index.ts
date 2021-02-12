import * as core from "@actions/core";
import * as github from "@actions/github";
import { createClient } from "contentful-management";
import { Space } from "contentful-management/dist/typings/entities/space";
import { runMigration } from "contentful-migration/built/bin/cli";
import { readdir } from "fs";
import path from "path";
import { promisify } from "util";
import { BranchNames, EnvironmentProps, EventNames } from "./types";

const readdirAsync = promisify(readdir);

const {
  SPACE_ID,
  MANAGEMENT_API_KEY,
  GITHUB_WORKSPACE,
  VERSION_TRACKING: CONTENTFUL_VERSION_TRACKING = "versionTracking",
  MIGRATIONS_DIR: CUSTOM_MIGRATIONS_DIR,
  INPUT_DELETE_AFTER_MERGE,
} = process.env;

const DEFAULT_MIGRATIONS_DIR = "migrations";
const MIGRATIONS_DIR = path.join(
  GITHUB_WORKSPACE,
  CUSTOM_MIGRATIONS_DIR || DEFAULT_MIGRATIONS_DIR
);

const CONTENTFUL_MASTER = "master";
const DELAY = 3000;
const MAX_NUMBER_OF_TRIES = 10;

/**
 * Create a unified date string
 * YYYY-MM-DD-hhmm
 */
const getStringDate = () => {
  const date = new Date();
  const hh = `${date.getUTCHours()}`.padStart(2, "0");
  const mm = `${date.getUTCMinutes()}`.padStart(2, "0");
  const YMD = `${date.toISOString()}`.substring(0, 10);
  return `${YMD}-${hh}${mm}`;
};

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
const versionToFilename = (version: string | number) =>
  `${version}`.replace(/\./g, "_") + ".js";

/**
 * Convert a branchName to a valid environmentName
 * @param branch
 */
const branchNameToEnvironmentName = (branch: string) =>
  branch.replace(/[\/_.]/g, "-");

/**
 * Get the branchNames based on the eventName
 */
const getBranchNames = (): BranchNames => {
  const { eventName, payload } = github.context;
  const { default_branch: defaultBranch } = payload.repository;
  console.log(`TYPE: ${eventName}`);
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
  console.log(environmentNames);
  const environmentId =
    environmentNames.head === branchNames.defaultBranch
      ? `${CONTENTFUL_MASTER}-${getStringDate()}`
      : `GH-${environmentNames.head}`;
  console.log(`ENVIRONMENT_ID: "${environmentId}"`);

  // Check if the environment is master
  // If master we return it without further actions
  if (environmentId === CONTENTFUL_MASTER) {
    return {
      environmentNames,
      environmentId,
      environment: await space.getEnvironment(environmentId),
    };
  }

  // If not master we need to check for existing environments and flush them
  console.log(
    `Checking for existing versions of environment: "${environmentId}"`
  );
  try {
    const environment = await space.getEnvironment(environmentId);
    await environment?.delete();
    console.log(`Environment deleted: "${environmentId}"`);
  } catch (e) {
    console.log(`Environment not found: "${environmentId}"`);
  }

  console.log(`Creating environment ${environmentId}`);

  return {
    environmentNames,
    environmentId,
    environment: await space.createEnvironmentWithId(environmentId, {
      name: environmentId,
    }),
  };
};

const runAction = async (space): Promise<void> => {
  const branchNames = getBranchNames();
  const { environmentId, environment, environmentNames } = await getEnvironment(
    space,
    branchNames
  );

  let count = 0;

  console.log("Waiting for environment processing...");
  while (count < MAX_NUMBER_OF_TRIES) {
    const status = (await space.getEnvironment(environment.sys.id)).sys.status
      .sys.id;

    if (status === "ready") {
      console.log(`Successfully processed new environment: "${environmentId}"`);
      break;
    }

    if (status === "failed") {
      console.log("Environment creation failed");
      break;
    }

    await delay();
    count++;
  }

  console.log("Update API Keys to allow access to new environment");
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
      console.log(`Updating: "${key.sys.id}"`);
      key.environments.push(newEnv);
      return key.update();
    })
  );

  console.log("Set default locale to new environment");
  const defaultLocale = (await environment.getLocales()).items.find(
    (locale) => locale.default
  ).code;

  console.log("Read all the available migrations from the file system");
  const availableMigrations = (await readdirAsync(MIGRATIONS_DIR))
    .filter((file) => /^\d+?\.js$/.test(file))
    .map((file) => filenameToVersion(file))
    .sort((a, b) => a - b)
    .map((num) => `${num}`);

  console.log("Figure out latest ran migration of the contentful space");
  const { items: versions } = await environment.getEntries({
    content_type: CONTENTFUL_VERSION_TRACKING,
  });

  if (versions.length < 1) {
    throw new Error(
      `There should only be one entry of type "${CONTENTFUL_VERSION_TRACKING}"`
    );
  }

  const [storedVersionEntry] = versions;
  const currentVersionString = storedVersionEntry.fields.version[defaultLocale];

  console.log("Evaluate which migrations to run");
  const currentMigrationIndex = availableMigrations.indexOf(
    currentVersionString
  );

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

  console.log(JSON.stringify(migrationsToRun, null, 2));

  console.log("Run migrations and update version entry");
  let migrationToRun;
  let mutableStoredVersionEntry = storedVersionEntry;
  while ((migrationToRun = migrationsToRun.shift())) {
    const filePath = path.join(
      MIGRATIONS_DIR,
      versionToFilename(migrationToRun)
    );
    console.log(`Running ${filePath}`);
    await runMigration(
      Object.assign(migrationOptions, {
        filePath,
      })
    );
    console.log(`${migrationToRun} succeeded`);

    mutableStoredVersionEntry.fields.version[defaultLocale] = migrationToRun;
    mutableStoredVersionEntry = await mutableStoredVersionEntry.update();
    mutableStoredVersionEntry = await mutableStoredVersionEntry.publish();

    console.log(`Updated version entry to ${migrationToRun}`);
  }

  console.log("Checking if we need to update master alias");
  if (environmentId.startsWith(CONTENTFUL_MASTER)) {
    console.log(`Running on master.`);
    console.log(`Updating master alias.`);
    await space
      .getEnvironmentAlias("master")
      .then((alias) => {
        alias.environment.sys.id = environmentId;
        return alias.update();
      })
      .then((alias) => console.log(`alias ${alias.sys.id} updated.`))
      .catch(console.error);
    console.log(`Master alias updated.`);
  } else {
    console.log("Running on feature branch");
    console.log("No alias changes required");
  }

  console.log(`HEAD: ${environmentNames.head}`);
  console.log("merged?", github.context.payload.pull_request?.merged);
  console.log("base.ref?", branchNames.baseRef, branchNames.defaultBranch);
  if (
    INPUT_DELETE_AFTER_MERGE &&
    branchNames.baseRef === branchNames.defaultBranch &&
    github.context.payload.pull_request?.merged
  ) {
    try {
      const environmentIdToDelete = `GH-${environmentNames.head}`;
      console.log(`Delete the environment: ${environmentIdToDelete}`);
      const environment = await space.getEnvironment(environmentIdToDelete);
      await environment?.delete();
      console.log(`Deleted the environment: ${environmentIdToDelete}`);
    } catch (error) {
      console.log("Cannot delete the environment");
    }
  } else {
    console.log("Nothing to delete");
  }

  const environmentUrl = `https://app.contentful.com/spaces/${space.sys.id}/environments/${environmentId}`;

  core.setOutput("environment_url", environmentUrl);
  core.setOutput("environment_name", environmentId);
  console.log("All done!!!");
};

(async () => {
  const client = createClient({
    accessToken: MANAGEMENT_API_KEY,
  });
  const space = await client.getSpace(SPACE_ID);
  try {
    await runAction(space);
  } catch (error) {
    console.error(error);
    core.setFailed(error.message);
  }
})();
