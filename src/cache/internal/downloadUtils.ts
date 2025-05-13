import * as core from '@actions/core'
import * as fs from 'fs'
import * as stream from 'stream'
import * as util from 'util'

import {GetObjectCommand, S3Client, S3ClientConfig} from '@aws-sdk/client-s3'
import { Timer } from './timeUtils'

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

