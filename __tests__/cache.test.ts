import { jest } from "@jest/globals";
import type { S3ClientConfig } from "@aws-sdk/client-s3";

import { CompressionMethod } from "../src/cache/internal/constants";
import { automock, callThrough, resetCallThrough } from "./mockModules";

const actualCacheUtils = await import("../src/cache/internal/cacheUtils");
jest.unstable_mockModule("../src/cache/internal/cacheUtils", () =>
    automock(actualCacheUtils)
);
const actualDownloadUtils = await import("../src/cache/internal/downloadUtils");
jest.unstable_mockModule("../src/cache/internal/downloadUtils", () =>
    automock(actualDownloadUtils)
);
const actualCacheClient = await import("../src/cache/internal/cacheClient");
jest.unstable_mockModule("../src/cache/internal/cacheClient", () =>
    automock(actualCacheClient)
);
const actualTar = await import("../src/cache/internal/tar");
jest.unstable_mockModule("../src/cache/internal/tar", () =>
    callThrough(actualTar)
);

const cacheClient = await import("../src/cache/internal/cacheClient");
const downloadUtils = await import("../src/cache/internal/downloadUtils");
const cacheUtils = await import("../src/cache/internal/cacheUtils");
const tar = await import("../src/cache/internal/tar");
const { restoreCache } = await import("../src/cache");

const s3Options: S3ClientConfig = {
    region: "eu-north-1",
    credentials: {
        accessKeyId: "test",
        secretAccessKey: "test"
    }
};
const s3BucketName = "test-bucket";

beforeEach(() => {
    jest.mocked(cacheUtils.getCompressionMethod).mockResolvedValue(
        CompressionMethod.Zstd
    );
    jest.mocked(cacheUtils.createTempDirectory).mockResolvedValue("/tmp/test");
    jest.mocked(cacheUtils.getCacheFileName).mockReturnValue("cache.tzst");
    jest.mocked(cacheUtils.unlinkFile).mockResolvedValue();
});

afterEach(() => {
    resetCallThrough();
});

test("streaming restore with fallback key uses matched key, not primary key", async () => {
    const primaryKey = "repo/project/abc123";
    const fallbackKey = "repo/project/older-hash";
    const restoreKeys = ["repo/project"];

    jest.mocked(cacheClient.getCacheEntry).mockResolvedValue({
        cacheKey: fallbackKey,
        creationTime: new Date().toString(),
        archiveLocation: "https://s3.amazonaws.com/"
    });

    jest.mocked(
        downloadUtils.downloadAndExtractCacheFromS3Stream
    ).mockResolvedValue({
        key: fallbackKey,
        size: 1024,
        lastModified: new Date()
    });

    const result = await restoreCache(
        ["node_modules"],
        primaryKey,
        s3Options,
        s3BucketName,
        restoreKeys,
        { s3StreamDownload: true }
    );

    expect(result).toBe(fallbackKey);
    expect(
        downloadUtils.downloadAndExtractCacheFromS3Stream
    ).toHaveBeenCalledWith(
        fallbackKey,
        s3Options,
        s3BucketName,
        CompressionMethod.Zstd
    );
    // Ensure it was NOT called with the primary key
    expect(
        downloadUtils.downloadAndExtractCacheFromS3Stream
    ).not.toHaveBeenCalledWith(
        primaryKey,
        expect.anything(),
        expect.anything(),
        expect.anything()
    );
});

test("streaming restore with exact primary key match uses primary key", async () => {
    const primaryKey = "repo/project/abc123";

    jest.mocked(cacheClient.getCacheEntry).mockResolvedValue({
        cacheKey: primaryKey,
        creationTime: new Date().toString(),
        archiveLocation: "https://s3.amazonaws.com/"
    });

    jest.mocked(
        downloadUtils.downloadAndExtractCacheFromS3Stream
    ).mockResolvedValue({
        key: primaryKey,
        size: 2048,
        lastModified: new Date()
    });

    const result = await restoreCache(
        ["node_modules"],
        primaryKey,
        s3Options,
        s3BucketName,
        [],
        { s3StreamDownload: true }
    );

    expect(result).toBe(primaryKey);
    expect(
        downloadUtils.downloadAndExtractCacheFromS3Stream
    ).toHaveBeenCalledWith(
        primaryKey,
        s3Options,
        s3BucketName,
        CompressionMethod.Zstd
    );
});

test("non-streaming restore with fallback key uses matched key", async () => {
    const primaryKey = "repo/project/abc123";
    const fallbackKey = "repo/project/older-hash";
    const restoreKeys = ["repo/project"];

    jest.mocked(cacheClient.getCacheEntry).mockResolvedValue({
        cacheKey: fallbackKey,
        creationTime: new Date().toString(),
        archiveLocation: "https://s3.amazonaws.com/"
    });

    jest.mocked(cacheClient.downloadCache).mockResolvedValue();
    jest.mocked(cacheUtils.getArchiveFileSizeInBytes).mockReturnValue(1024);

    jest.mocked(tar.extractTar).mockResolvedValue(undefined as never);
    jest.mocked(tar.listTar).mockResolvedValue(undefined as never);

    const result = await restoreCache(
        ["node_modules"],
        primaryKey,
        s3Options,
        s3BucketName,
        restoreKeys,
        { s3StreamDownload: false }
    );

    expect(result).toBe(fallbackKey);
    expect(cacheClient.downloadCache).toHaveBeenCalledWith(
        expect.objectContaining({ cacheKey: fallbackKey }),
        expect.any(String),
        s3Options,
        s3BucketName
    );
});
