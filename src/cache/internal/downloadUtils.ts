import * as core from '@actions/core'
import * as fs from 'fs'
import * as stream from 'stream'
import * as util from 'util'
import {spawn} from 'child_process'

import {GetObjectCommand, S3Client, S3ClientConfig} from '@aws-sdk/client-s3'
import { Timer } from './timeUtils'
import { CompressionMethod } from './constants'

/**
 * Download the cache using the AWS S3.  Only call this method if the use S3.
 *
 * @param key the key for the cache in S3
 * @param archivePath the local path where the cache is saved
 * @param s3Options: the option for AWS S3 client
 * @param s3BucketName: the name of bucket in AWS S3
 */
export async function downloadCacheStorageS3(
  key: string,
  archivePath: string,
  s3Options: S3ClientConfig,
  s3BucketName: string
 ): Promise<void> {
   const timer = new Timer(`Download from S3 bucket ${s3BucketName}`)
   const s3client = new S3Client(s3Options)
   const param = {
     Bucket: s3BucketName,
     Key: key,
   }
 
   try {
     const response = await s3client.send(new GetObjectCommand(param))
     if (!response.Body) {
       timer.stop()
       throw new Error(
         `Incomplete download. response.Body is undefined from S3.`
       )
     }
    
     const fileStream = fs.createWriteStream(archivePath)
    
     const pipeline = util.promisify(stream.pipeline)
     await pipeline(response.Body as stream.Readable, fileStream)
     timer.stop()
   } catch (error) {
     timer.stop()
     throw error
   }
 
   return
 }


export type DownloadObject = {
  key: string
  size: number | undefined
  lastModified: Date | undefined
}
/**
 * Download and extract cache directly from S3 stream without saving to disk first.
 * This enables concurrent downloading and extraction for better performance.
 *
 * @param key the key for the cache in S3
 * @param s3Options: the option for AWS S3 client
 * @param s3BucketName: the name of bucket in AWS S3
 * @param compressionMethod: the compression method used for the cache
 */
export async function downloadAndExtractCacheFromS3Stream(
  key: string,
  s3Options: S3ClientConfig,
  s3BucketName: string,
  compressionMethod: CompressionMethod
): Promise<DownloadObject> {
  const timer = new Timer(`Download and extract from S3 bucket ${s3BucketName}`)
  const s3client = new S3Client(s3Options)
  const param = {
    Bucket: s3BucketName,
    Key: key,
  }

  let ret: DownloadObject = {
    key: key,
    size: undefined,
    lastModified: undefined
  };
  try {
    const response = await s3client.send(new GetObjectCommand(param))
    if (!response.Body) {
      timer.stop()
      throw new Error(
        `Incomplete download. response.Body is undefined from S3.`
      )
    }
    ret.key = key;
    ret.size = response.ContentLength;
    ret.lastModified = response.LastModified ? new Date(response.LastModified) : undefined;

    // Get the appropriate tar command for extraction
    const tarCommand = getTarExtractionCommand(compressionMethod)
    core.debug(`Using tar command: ${tarCommand.command} with args: ${tarCommand.args.join(' ')}`)
    // Spawn the tar process
    const tarProcess = spawn(tarCommand.command, tarCommand.args, {
      stdio: ['pipe', 'inherit', 'inherit'],
      cwd: process.env['GITHUB_WORKSPACE'] ?? process.cwd()
    })

    // Stream S3 response directly to tar stdin
    const pipeline = util.promisify(stream.pipeline)
    await pipeline(response.Body as stream.Readable, tarProcess.stdin!)

    // Wait for tar process to complete
    await new Promise<void>((resolve, reject) => {
      tarProcess.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Tar extraction failed with exit code ${code}`))
        }
      })
      tarProcess.on('error', reject)
    })

    timer.stop()
  } catch (error) {
    timer.stop()
    throw error
  }
  return ret
}

/**
 * Get the tar command and arguments for extracting from stdin
 */
function getTarExtractionCommand(compressionMethod: CompressionMethod): {command: string, args: string[]} {
  const workingDirectory = process.env['GITHUB_WORKSPACE'] ?? process.cwd()
  
  // Base tar arguments for extraction from stdin
  const baseArgs = [
    '-xf', '-',  // Extract from stdin
    '-P',        // Don't strip leading slashes
    '-C', workingDirectory  // Change to working directory
  ]

  switch (compressionMethod) {
    case CompressionMethod.Zstd:
      return {
        command: 'tar',
        args: [...baseArgs, '--use-compress-program', process.platform === 'win32' ? '"zstd -d --long=30"' : 'unzstd --long=30']
      }
    case CompressionMethod.ZstdWithoutLong:
      return {
        command: 'tar',
        args: [...baseArgs, '--use-compress-program', process.platform === 'win32' ? '"zstd -d"' : 'unzstd']
      }
    default: // Gzip
      return {
        command: 'tar',
        args: [...baseArgs, '-z']
      }
  }
}

