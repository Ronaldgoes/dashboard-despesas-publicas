import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const dataDirectory = resolve(process.argv[2] ?? '.dados-empenho')
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucket = process.env.R2_BUCKET_NAME

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error('Defina CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET_NAME no .env.')
}
if (!existsSync(resolve(dataDirectory, 'manifest.json'))) {
  throw new Error('A base preparada não foi encontrada. Rode preparar:empenhos antes de publicar.')
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(fullPath))
    else if (entry.isFile()) files.push(fullPath)
  }
  return files
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})
const files = await listFiles(dataDirectory)
const manifestPath = resolve(dataDirectory, 'manifest.json')
const releaseFiles = files.filter((file) => file !== manifestPath)

async function upload(file, position, total) {
  const key = relative(dataDirectory, file).replaceAll('\\', '/')
  const fileStats = await stat(file)
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: await readFile(file),
        ContentType: 'application/json; charset=utf-8',
        CacheControl: key === 'manifest.json' ? 'public, max-age=60' : 'public, max-age=31536000, immutable',
      }))
      lastError = null
      break
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
    }
  }
  if (lastError) throw new Error(`${key}: ${lastError.message}`)
  if (position % 25 === 0 || position === total) console.log(`${position}/${total} arquivos enviados (${(fileStats.size / 1024).toFixed(0)} KB no último arquivo).`)
}

const concurrency = 12
let nextFile = 0
async function worker() {
  while (nextFile < releaseFiles.length) {
    const index = nextFile
    nextFile += 1
    await upload(releaseFiles[index], index + 1, releaseFiles.length)
  }
}

await Promise.all(Array.from({ length: concurrency }, worker))
await upload(manifestPath, releaseFiles.length + 1, releaseFiles.length + 1)
console.log(`Publicação concluída no Cloudflare R2: bucket "${bucket}".`)
