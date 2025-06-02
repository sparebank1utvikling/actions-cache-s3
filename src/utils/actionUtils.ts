import * as core from "@actions/core";
import { S3ClientConfig } from "@aws-sdk/client-s3";
import "@aws-sdk/crc64-nvme-crt"

import { Inputs, RefKey } from "../constants";

export function isExactKeyMatch(key: string, cacheKey?: string): boolean {
    return !!(
        cacheKey &&
        cacheKey.localeCompare(key, undefined, {
            sensitivity: "accent"
        }) === 0
    );
}

export function logWarning(message: string): void {
    const warningPrefix = "[warning]";
    core.info(`${warningPrefix}${message}`);
}

// Cache token authorized for all events that are tied to a ref
// See GitHub Context https://help.github.com/actions/automating-your-workflow-with-github-actions/contexts-and-expression-syntax-for-github-actions#github-context
export function isValidEvent(): boolean {
    return RefKey in process.env && Boolean(process.env[RefKey]);
}

export function getInputAsArray(
    name: string,
    options?: core.InputOptions
): string[] {
    return core
        .getInput(name, options)
        .split("\n")
        .map(s => s.replace(/^!\s+/, "!").trim())
        .filter(x => x !== "");
}

export function getInputAsInt(
    name: string,
    options?: core.InputOptions
): number | undefined {
    const value = parseInt(core.getInput(name, options));
    if (isNaN(value) || value < 0) {
        return undefined;
    }
    return value;
}

export function getInputAsBool(
    name: string,
    options?: core.InputOptions
): boolean {
    const result = core.getInput(name, options);
    return result.toLowerCase() === "true";
}

export function isCacheFeatureAvailable(): boolean {
    return true;
}

export function getInputS3ClientConfig(): S3ClientConfig {
    const s3BucketName = core.getInput(Inputs.AWSS3Bucket);
    if (!s3BucketName) {
        throw new Error("S3 bucket name is required.");
    }


    const credentials = core.getInput(Inputs.AWSAccessKeyId)
        ? {
              credentials: {
                  accessKeyId:
                      core.getInput(Inputs.AWSAccessKeyId) ||
                      process.env["AWS_ACCESS_KEY_ID"],
                  secretAccessKey:
                      core.getInput(Inputs.AWSSecretAccessKey) ||
                      process.env["AWS_SECRET_ACCESS_KEY"],
                  sessionToken:
                      core.getInput(Inputs.AWSSessionToken) ||
                      process.env["AWS_SESSION_TOKEN"]
              }
          }
        : null;

    let logger = {
        log: () => {},
        debug: () => {},
        info: () => {},
        trace: () => {},
        warn: console.warn,
        error: console.error,
    };
    if (core.isDebug()) {
        logger = console;
    }

    const s3config = {
        ...credentials,
        region: core.getInput(Inputs.AWSRegion) || process.env["AWS_REGION"],
        endpoint: core.getInput(Inputs.AWSEndpoint) || undefined,
        bucketEndpoint: core.getInput(Inputs.AWSEndpoint)
            ? core.getBooleanInput(Inputs.AWSS3BucketEndpoint)
            : false,
        forcePathStyle: core.getBooleanInput(Inputs.AWSS3ForcePathStyle),
        logger: logger,
    } as S3ClientConfig;
    core.debug("Enable S3 backend mode.");
    return s3config;
}
