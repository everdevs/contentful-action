import * as core from "@actions/core";
import * as github from "@actions/github";
import { runMigration } from "contentful-migration/built/bin/cli";
import { readdir } from "fs";
import path from "path";
import { promisify } from "util";
import {
  CONTENTFUL_ALIAS,
  DELETE_FEATURE,
  SET_ALIAS,
  MANAGEMENT_API_KEY,
  MAX_NUMBER_OF_TRIES,
  MIGRATIONS_DIR,
  SPACE_ID,
  VERSION_CONTENT_TYPE,
  VERSION_FIELD,
} from "./constants";
import {
  delay,
  filenameToVersion,
  getBranchNames,
  getEnvironment,
  Logger,
  versionToFilename,
} from "./utils";

export const readdirAsync = promisify(readdir);

/**
 *
 * @param space
 */
export const runAction = async (space): Promise<void> => {
  const branchNames = getBranchNames();
  const { environmentId, environment, environmentNames } = await getEnvironment(
    space,
    branchNames
  );
  Logger.log(
    JSON.stringify({ environmentId, environment, environmentNames }, null, 4)
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

  Logger.log(`Checking if we need to update ${CONTENTFUL_ALIAS} alias`);
  // If the environmentId starts with ${CONTENTFUL_ALIAS} ("master")
  // Then set the alias to the new environment
  // Else inform the user
  if (environmentId.startsWith(CONTENTFUL_ALIAS) && SET_ALIAS) {
    Logger.log(`Running on ${CONTENTFUL_ALIAS}.`);
    Logger.log(`Updating ${CONTENTFUL_ALIAS} alias.`);
    await space
      .getEnvironmentAlias(CONTENTFUL_ALIAS)
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
    DELETE_FEATURE &&
    branchNames.baseRef === branchNames.defaultBranch &&
    github.context.payload.pull_request?.merged
  ) {
    try {
      const { head: environmentIdToDelete } = environmentNames;
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
