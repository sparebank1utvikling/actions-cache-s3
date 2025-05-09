import * as core from '@actions/core'
import * as utils from './cacheUtils'

import { downloadCacheStorageS3 } from './downloadUtils'
import { uploadFileS3 } from './uploadUtils'
import { UploadOptions } from '../options'
import { Timer } from './timeUtils'

import {
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  ListObjectsV2CommandOutput,
  S3Client,
  S3ClientConfig,
  _Object
} from '@aws-sdk/client-s3'


interface _content {
  Key?: string
  LastModified?: Date
}

export interface ArtifactCacheEntry {
  cacheKey?: string
  scope?: string
  cacheVersion?: string
  creationTime?: string
  archiveLocation?: string
}

function searchRestoreKeyEntry(
  notPrimaryKey: string[],
  entries: _content[]
): _content | null {
  for (const k of notPrimaryKey) {
    const found = _searchRestoreKeyEntry(k, entries)
    if (found != null) {
      return found
    }
  }

  return null
}

function _searchRestoreKeyEntry(
  notPrimaryKey: string,
  entries: _content[]
): _content | null {
  let matchPrefix: _content[] = new Array()

  for (const entry of entries) {
    if (entry.Key === notPrimaryKey) {
      // extractly match, Use this entry
      return entry
    }

    if (entry.Key?.startsWith(notPrimaryKey)) {
      matchPrefix.push(entry)
    }
  }

  if (matchPrefix.length === 0) {
    // not found, go to next key
    return null
  }

  matchPrefix.sort(function (i, j) {
    if (i.LastModified == undefined || j.LastModified == undefined) {
      return 0
    }
    if (i.LastModified?.getTime() === j.LastModified?.getTime()) {
      return 0
    }
    if (i.LastModified?.getTime() > j.LastModified?.getTime()) {
      return -1
    }
    if (i.LastModified?.getTime() < j.LastModified?.getTime()) {
      return 1
    }

    return 0
  })

  // return newest entry
  return matchPrefix[0]
}


export async function getCacheEntry(
  keys: string[],
  paths: string[],
  s3Options: S3ClientConfig,
  s3BucketName: string
): Promise<ArtifactCacheEntry | null> {
  const timer = new Timer(`List objects in S3 bucket ${s3BucketName}`)
  const primaryKey = keys[0]

  const s3client = new S3Client(s3Options)

  let contents: _content[] = new Array()
  let s3ContinuationToken: string | undefined = undefined
  let count = 0

  const param = {
    Bucket: s3BucketName
  } as ListObjectsV2CommandInput

  for (;;) {
    core.debug(`ListObjects Count: ${count}`)
    if (s3ContinuationToken != undefined) {
      param.ContinuationToken = s3ContinuationToken
    }

    let response: ListObjectsV2CommandOutput
    try {
      //core.debug(`ListObjectsV2CommandInput: ${JSON.stringify(param)}`)
      response = await s3client.send(new ListObjectsV2Command(param))
    } catch (e) {
      timer.stop()
      throw new Error(`Error from S3: ${e}`)
    }
    if (!response.Contents) {
      if (contents.length != 0) {
        break
      }
      timer.stop()
      throw new Error(`Cannot find objects in bucket ${s3BucketName}`)
    }
    core.debug(`Found objects ${response.Contents.length}`)

    const found = response.Contents.find(
      (content: _Object) => content.Key === primaryKey
    )
    if (found && found.LastModified) {
      timer.stop()
      return {
        cacheKey: primaryKey,
        creationTime: found.LastModified.toString(),
        archiveLocation: "https://s3.amazonaws.com/" // dummy
      }
    }

    response.Contents.map((obj: _Object) =>
      contents.push({
        Key: obj.Key,
        LastModified: obj.LastModified
      })
    )
    core.debug(`Total objects ${contents.length}`)

    if (response.IsTruncated) {
      s3ContinuationToken = response.NextContinuationToken
    } else {
      break
    }

    count++
  }

  core.debug('Not found in primary key, will fallback to restore keys')
  const notPrimaryKey = keys.slice(1)
  const found = searchRestoreKeyEntry(notPrimaryKey, contents)
  if (found != null && found.LastModified) {
    timer.stop()
    return {
      cacheKey: found.Key,
      creationTime: found.LastModified.toString(),
      archiveLocation: "https://s3.amazonaws.com/" // dummy
    }
  }

  timer.stop()
  return null
}

export async function downloadCache(
  cacheEntry: ArtifactCacheEntry,
  archivePath: string,
  s3Options?: S3ClientConfig,
  s3BucketName?: string
): Promise<void> {
  if (s3Options && s3BucketName && cacheEntry.cacheKey) {
    await downloadCacheStorageS3(
      cacheEntry.cacheKey,
      archivePath,
      s3Options,
      s3BucketName
    )
  } 
  return
}

export async function saveCache(
  archivePath: string,
  key: string,
  s3options: S3ClientConfig,
  s3BucketName: string,
  options?: UploadOptions
): Promise<void> {
    core.debug('Upload cache')
    const concurrency = utils.assertDefined('uploadConcurrency', 4)
    const maxChunkSize = utils.assertDefined('uploadChunkSize', 32 * 1024 * 1024)
    await uploadFileS3(
      s3options,
      s3BucketName,
      archivePath,
      key,
      concurrency,
      maxChunkSize
    )
  
  
    // Commit Cache
    core.debug('Commiting cache')
    const cacheSize = utils.getArchiveFileSizeInBytes(archivePath)
    core.info(
      `Cache Size: ~${Math.round(
        cacheSize / (1024 * 1024)
      )} MB (${cacheSize} B)`
    )

    core.info('Cache saved successfully')
}
