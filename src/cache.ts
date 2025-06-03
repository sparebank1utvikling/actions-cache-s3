import * as core from "@actions/core";
import * as path from "path";
import * as utils from "./cache/internal/cacheUtils";
import * as cacheClient from "./cache/internal/cacheClient";
import { isGhes } from "./cache/internal/config";
import { DownloadOptions, UploadOptions } from "./cache/options";
import { createTar, extractTar, listTar } from "./cache/internal/tar";
import { downloadAndExtractCacheFromS3Stream } from "./cache/internal/downloadUtils";
import { S3ClientConfig } from "@aws-sdk/client-s3";
import { Timer } from "./cache/internal/timeUtils";

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ValidationError";
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}

export class ReserveCacheError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ReserveCacheError";
        Object.setPrototypeOf(this, ReserveCacheError.prototype);
    }
}

function checkPaths(paths: string[]): void {
    if (!paths || paths.length === 0) {
        throw new ValidationError(
            `Path Validation Error: At least one directory or file path is required`
        );
    }
}

function checkKey(key: string): void {
    if (key.length > 512) {
        throw new ValidationError(
            `Key Validation Error: ${key} cannot be larger than 512 characters.`
        );
    }
    const regex = /^[^,]*$/;
    if (!regex.test(key)) {
        throw new ValidationError(
            `Key Validation Error: ${key} cannot contain commas.`
        );
    }
}

/**
 * Restores cache from keys
 *
 * @param paths a list of file paths to restore from the cache
 * @param primaryKey an explicit key for restoring the cache. Lookup is done with prefix matching.
 * @param restoreKeys an optional ordered list of keys to use for restoring the cache if no cache hit occurred for primaryKey
 * @param downloadOptions cache download options
 * @param enableCrossOsArchive an optional boolean enabled to restore on windows any cache created on any platform
 * @returns string returns the key for the cache hit, otherwise returns undefined
 */
export async function restoreCache(
    paths: string[],
    primaryKey: string,
    s3Options: S3ClientConfig,
    s3BucketName: string,
    restoreKeys?: string[],
    options?: DownloadOptions
): Promise<string | undefined> {
    const timer = new Timer("Restore cache operation");
    core.debug(`Cache service version: s3`);

    checkPaths(paths);

    core.debug(`Using S3 bucket: ${s3BucketName}`);
    const result = await restoreCacheS3(
        paths,
        primaryKey,
        s3Options,
        s3BucketName,
        restoreKeys,
        options
    );

    timer.stop();
    return result;
}

/**
 * Restores cache using the legacy Cache Service
 *
 * @param paths a list of file paths to restore from the cache
 * @param primaryKey an explicit key for restoring the cache. Lookup is done with prefix matching.
 * @param restoreKeys an optional ordered list of keys to use for restoring the cache if no cache hit occurred for primaryKey
 * @param options cache download options
 * @param enableCrossOsArchive an optional boolean enabled to restore on Windows any cache created on any platform
 * @param s3Options upload options for AWS S3
 * @param s3BucketName a name of AWS S3 bucket
 * @returns string returns the key for the cache hit, otherwise returns undefined
 */
async function restoreCacheS3(
    paths: string[],
    primaryKey: string,
    s3Options: S3ClientConfig,
    s3BucketName: string,
    restoreKeys?: string[],
    options?: DownloadOptions
): Promise<string | undefined> {
    restoreKeys = restoreKeys || [];
    const keys = [primaryKey, ...restoreKeys];

    core.debug("Resolved Keys:" + JSON.stringify(keys));
    if (keys.length > 10) {
        throw new ValidationError(
            `Key Validation Error: Keys are limited to a maximum of 10.`
        );
    }
    for (const key of keys) {
        checkKey(key);
    }

    const compressionMethod = await utils.getCompressionMethod();
    let archivePath = "";
    try {
        // path are needed to compute version
        const cacheEntry = await cacheClient.getCacheEntry(
            keys,
            paths,
            s3Options,
            s3BucketName
        );
        if (!cacheEntry?.archiveLocation) {
            // Cache not found
            return undefined;
        }

        if (options?.lookupOnly) {
            core.info("Lookup only - skipping download");
            return cacheEntry.cacheKey;
        }

        archivePath = path.join(
            await utils.createTempDirectory(),
            utils.getCacheFileName(compressionMethod)
        );
        core.debug(`Archive Path: ${archivePath}`);
        if (!(options?.s3StreamDownload ?? true)) {
            // Download the cache from the cache entry
            await cacheClient.downloadCache(
                cacheEntry,
                archivePath,
                s3Options,
                s3BucketName
            );

            if (core.isDebug()) {
                await listTar(archivePath, compressionMethod);
            }

            const archiveFileSize =
                utils.getArchiveFileSizeInBytes(archivePath);
            core.info(
                `Cache Size: ~${Math.round(
                    archiveFileSize / (1024 * 1024)
                )} MB (${archiveFileSize} B)`
            );

            await extractTar(archivePath, compressionMethod);
            core.info("Cache restored successfully");
            return cacheEntry.cacheKey;
        } else {
            const info = await downloadAndExtractCacheFromS3Stream(
                primaryKey,
                s3Options,
                s3BucketName,
                compressionMethod
            );
            const size = Math.round((info.size ?? 0) / (1024 * 1024));
            core.info(
                `Cache restored successfully for key: ${info.key} of size: ${size} MB (${info.size} B) and last modified: ${info.lastModified?.toISOString()}`
            );
            return cacheEntry.cacheKey;
        }
    } catch (error) {
        const typedError = error as Error;
        if (typedError.name === ValidationError.name) {
            throw error;
        } else {
            // Supress all non-validation cache related errors because caching should be optional
            core.warning(`Failed to restore: ${(error as Error).message}`);
        }
    } finally {
        // Try to delete the archive to save space
        try {
            await utils.unlinkFile(archivePath);
        } catch (error) {
            core.debug(`Failed to delete archive: ${error}`);
        }
    }

    return undefined;
}

/**
 * Saves a list of files with the specified key
 *
 * @param paths a list of file paths to be cached
 * @param key an explicit key for restoring the cache
 * @param options cache upload options
 * @returns number returns cacheId if the cache was saved successfully and throws an error if save fails
 */
export async function saveCache(
    paths: string[],
    key: string,
    s3Options: S3ClientConfig,
    s3BucketName: string,
    options?: UploadOptions
): Promise<number> {
    const timer = new Timer("Save cache operation");
    core.debug(`Cache service version: s3`);
    checkPaths(paths);
    checkKey(key);
    core.debug(`Using S3 bucket: ${s3BucketName}`);
    const result = await saveCacheS3(
        paths,
        key,
        s3Options,
        s3BucketName,
        options
    );
    timer.stop();
    return result;
}

/**
 * Save cache using the legacy Cache Service
 *
 * @param paths
 * @param key
 * @param options
 * @param enableCrossOsArchive
 * @returns
 */
async function saveCacheS3(
    paths: string[],
    key: string,
    s3Options: S3ClientConfig,
    s3BucketName: string,
    options?: UploadOptions
): Promise<number> {
    const compressionMethod = await utils.getCompressionMethod();
    const cacheId = -1;

    const cachePaths = await utils.resolvePaths(paths);
    core.debug("Cache Paths:");
    core.debug(`${JSON.stringify(cachePaths)}`);

    if (cachePaths.length === 0) {
        throw new Error(
            `Path Validation Error: Path(s) specified in the action for caching do(es) not exist, hence no cache is being saved.`
        );
    }

    const archiveFolder = await utils.createTempDirectory();
    const archivePath = path.join(
        archiveFolder,
        utils.getCacheFileName(compressionMethod)
    );

    core.debug(`Archive Path: ${archivePath}`);

    try {
        await createTar(archiveFolder, cachePaths, compressionMethod);
        if (core.isDebug()) {
            await listTar(archivePath, compressionMethod);
        }
        const fileSizeLimit = 10 * 1024 * 1024 * 1024; // 10GB per repo limit
        const archiveFileSize = utils.getArchiveFileSizeInBytes(archivePath);
        core.debug(`File Size: ${archiveFileSize}`);

        // For GHES, this check will take place in ReserveCache API with enterprise file size limit
        if (archiveFileSize > fileSizeLimit && !isGhes()) {
            throw new Error(
                `Cache size of ~${Math.round(
                    archiveFileSize / (1024 * 1024)
                )} MB (${archiveFileSize} B) is over the 10GB limit, not saving cache.`
            );
        }

        core.debug(`Saving Cache (ID: ${cacheId})`);
        await cacheClient.saveCache(
            archivePath,
            key,
            s3Options,
            s3BucketName,
            options
        );
    } catch (error) {
        const typedError = error as Error;
        if (typedError.name === ValidationError.name) {
            throw error;
        } else if (typedError.name === ReserveCacheError.name) {
            core.info(`Failed to save: ${typedError.message}`);
        } else {
            core.warning(`Failed to save: ${typedError.message}`);
        }
    } finally {
        // Try to delete the archive to save space
        try {
            await utils.unlinkFile(archivePath);
        } catch (error) {
            core.debug(`Failed to delete archive: ${error}`);
        }
    }

    return cacheId;
}
