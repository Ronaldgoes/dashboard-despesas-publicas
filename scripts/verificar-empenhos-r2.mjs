import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucket = process.env.R2_BUCKET_NAME

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})

let token
let count = 0
let size = 0
do {
  const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }))
  count += page.Contents?.length ?? 0
  size += (page.Contents ?? []).reduce((sum, item) => sum + (item.Size ?? 0), 0)
  token = page.IsTruncated ? page.NextContinuationToken : undefined
} while (token)

console.log(JSON.stringify({ count, size }))
