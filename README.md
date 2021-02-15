# Contentful Migration Automation

An action for automating contentful migrations.

> To learn about making changes to a content model and entries on a Contentful Space using the Contentful CLI check out
> our [tutorial on Scripting Migrations](https://www.contentful.com/developers/docs/tutorials/cli/scripting-migrations/).
> You can read our [conceptual guide](https://www.contentful.com/developers/docs/concepts/deployment-pipeline/) on how to
> utilize Contentful Environments inside your continuous delivery pipeline.
> 
> - via [contentful/contentful-action](https://github.com/contentful/contentful-action)

* [Usage](#usage)
* [Environment names](#environment-names)
    + [Examples](#examples)
* [Automations](#automations)
* [Versioning](#versioning)
* [Arguments](#arguments)
* [Workflow](#workflow)


## Usage

This action runs migrations on your contentful space. Please add your migration scripts to a directory called
`migrations` *(configurable)* and name them `[n].js` where `[n]` is the current version of your content-model.
Versions are integers (`1.js`, `2.js`, ...)

![Screenshot of Contentful Version Tracking Entry](images/version-tracking.png)

You can choose the initial version. For simplicity, we recommend to start with `1`. Please create `1.js` inside your
migrations folder and include the following code:

```js
module.exports = function () {};
```

For every new version we can now increase the version (`2.js`, `3.js`, ...). Per default, this action looks for a
directory labeled `migrations` but it's configurable via the arg `migrations_dir`.

Next we can adjust our workflow file to use this action. You have to include your `space_id` and `management_api_key`
from your Contentful space.

There are several options to allow customizing this action.

## Environment names

You can define the `master_pattern` and `feature_pattern`.
**Master** is used as alias target.
**Feature** is used as a sandbox during development.

These helpers are available:

- `[YYYY]` - Full year (i.e. 2021)
- `[YY]` - Short year (i.e. 21)
- `[MM]` - Month (i.e. 05)
- `[DD]` - Day (i.e. 09)
- `[hh]` - Hours (i.e. 03)
- `[mm]` - Minutes (i.e. 00)
- `[ss]` - Seconds (i.e. 50)
- `[branch]` - BranchName (`/`, `.`, `_` are replaced to `-`)

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
set_alias                | `boolean` | No  | `false` | Aliases master to the new master environment
master_pattern           | `string`  | No  | `master-[YYYY]-[MM]-[DD]-[hh][mm]` | The pattern that should be used for the new master
feature_pattern          | `string`  | No  | `GH-[branch]` | The pattern that should be used for the new feature
version_content_type     | `string`  | No  | `versionTracking` | The content-type that tracks the version
version_field            | `string`  | No  | `version` | The field-id that carries the version number
migrations_dir           | `string`  | No  | `migrations` | The directory to look for migrations


## Workflow

Please look at the [demo file](.github/workflows/main.yml).

```yml
- name: Contentful Migration
  id: migrate
  uses: contentful/contentful-migration-automation@1
  with:
    # delete_feature: true
    # set_alias: true
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
