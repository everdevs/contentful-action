/// <reference types="node" />
import { readdir } from "fs";
export declare const readdirAsync: typeof readdir.__promisify__;
/**
 *
 * @param space
 */
export declare const runAction: (space: any) => Promise<void>;
