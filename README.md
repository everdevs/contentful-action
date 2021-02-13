# Contentful Migration Automation

An action for automating contentful migrations.

To learn about making changes to a content model and entries on a Contentful Space using the Contentful CLI check out
the [tutorial on Scripting Migrations](https://www.contentful.com/developers/docs/tutorials/cli/scripting-migrations/).
You can read our [conceptual guide](https://www.contentful.com/developers/docs/concepts/deployment-pipeline/) on how to
utilize Contentful Environments inside your continuous delivery pipeline.


* [Usage](#usage)
* [Environment names](#environment-names)
    + [Examples](#examples)
* [Automations](#automations)
* [Versioning](#versioning)
* [Arguments](#arguments)
* [Workflow](#workflow)


## Usage

This action requires a folder labeled `migrations` *(configurable)* inside your repo. You should place all your migrations
in this directory.

For this action to know which migrations it should run, we’ll need to track which migrations have been run by adding a
version number into Contentful. We accomplish this in Contentful by creating a new content model with an ID of
`versionTracking` *(configurable)* that has a single short-text-field named `version` *(configurable)*.

![Screenshot of Contentful Version Tracking Entry](images/version-tracking.png)

You’ll also need to create one entry of your new content model with the value `1`. We’ll need to create an empty
migration file to represent the initial import. Create `1.js` inside your migration folder and include the following
code:

```js
module.exports = function () {};
```

Going forward you can create a JavaScript file with an increasing integer such as `2.js`, `3.js` and so on. The action
looks for a folder labeled `migrations` but it's configurable via the arg `migrations_dir`.

Lastly you'll need to update your workflow file to use this action and update the settings to include your `space_id`
and `management_api_key` from Contentful.

There are several options to allow customizing this action.

## Environment names
You can define the `master_pattern` and `feature_pattern` where the master is used as alias target while the feature is
used as a sandbox.

You can define the pattern by using these helpers:

- `[YYYY]`: full year (i.e. 2021)
- `[YY]`: short year (i.e. 21)
- `[MM]`: month (i.e. 05)
- `[DD]`: Day (i.e. 09)
- `[hh]`: hours (i.e. 03)
- `[mm]`: minutes (i.e. 00)
- `[ss]`: seconds (i.e. 50)
- `[branch]`: branchName (feat-my-feature) `/`, `.`, `_` are replaced to `-`

### Examples

- `main-[YY]-[MM]-[DD]-[hh]-[mm]-[ss]`: `main-21-02-11-21-20-32-19`
- `production-[YYYY][MM][DD][hh][mm]`: `production-20210211212032`
- `sandbox-[branch]` (`feat/my-feature`): `sandbox-feat-my-feature`
- `pr-[branch]` (`feat/add-something-1.2.3_2`): `pr-feat-add-something-1-2-3-2`

## Automations

> DANGER. Please make sure you know what you're doing when setting these to true.

`delete_feature`: Will delete the feature once it has been merged. While this is considered safe, you might want to keep
the sandbox environment.

`set_alias`: Will set the alias to the new master environment once the feature has been merged. You might want to
manually set the alias from the GUI. 

## Versioning

Please read the usage info above. The content-type and the field-id are configurable. 

## Arguments

Name | Type | Required | Default  | Description
--- | --- | --- | --- | ---
**space_id**             | `string`  | Yes | `undefined` | The id of the contentful space
**management_api_key**   | `string`  | Yes | `undefined` | The management-api key for contentful
delete_feature           | `boolean` | No  | `false` | Deletes sandbox environment if the head branch is merged
set_alias                | `boolean` | No  | `false` | Aliases master the new master environment
master_pattern           | `string`  | No  | `master-[YYYY]-[MM]-[DD]-[hh][mm]` | The pattern that should be used for the new master
feature_pattern          | `string`  | No  | `GH-[branch]` | The pattern that should be used for the new feature
version_content_type     | `string`  | No  | `versionTracking` | The content-type that tracks the version
version_field            | `string`  | No  | `version` | The field-id that carries the version number
migrations_dir           | `string`  | No  | `migrations` | The directory to look for migrations


## Workflow
```yml
- name: Contentful Migration
  id: migrate
  uses: contentful/contentful-migration-automation@1
  with:
    # delete_feature: true
    # set_alias: false
    # master_pattern: "main-[YY]-[MM]-[DD]-[hh]-[mm]"
    # feature_pattern: "sandbox-[branch]"
    # version_field: versionCounter
    # version_content_type: environmentVersion
    # migrations_dir: contentful/migrations
    space_id: ${{ secrets.SPACE_ID }}
    management_api_key: ${{ secrets.MANAGEMENT_API_KEY }}
```

# License

Copyright (c) 2021 Evernest GmbH. Code released under the MIT license. See [LICENSE](LICENSE) for further details.
