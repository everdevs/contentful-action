import { Environment } from "contentful-management/dist/typings/entities/environment";
export declare enum EventNames {
    pullRequest = "pull_request"
}
export interface BranchNames {
    headRef: null | string;
    baseRef: string;
    defaultBranch: string;
}
export interface EnvironmentNames {
    base: string;
    head: string | null;
}
declare type EnvironmentType = "master" | "feature";
export interface EnvironmentProps {
    environmentType: EnvironmentType;
    environmentNames: EnvironmentNames;
    environmentId: string;
    environment: Environment;
}
export interface NameFromPatternArgs {
    branchName?: string;
}
export {};
