import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { empenhoFields } from '../shared/empenhoFields.js'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucket = process.env.R2_BUCKET_NAME
const publicUrl = String(process.env.VITE_EMPENHOS_STORAGE_URL ?? '').replace(/\/$/, '')

if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
  throw new Error('Defina as credenciais do R2 e VITE_EMPENHOS_STORAGE_URL no .env.')
}

const response = await fetch(`${publicUrl}/manifest.json`)
if (!response.ok) throw new Error('Não foi possível baixar o catálogo atual de notas.')

const manifest = await response.json()
manifest.fields = empenhoFields.map(([key, label, section]) => ({ key, label, section }))
manifest.updatedAt = new Date().toISOString()

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})

await client.send(new PutObjectCommand({
  Bucket: bucket,
  Key: 'manifest.json',
  Body: JSON.stringify(manifest),
  ContentType: 'application/json; charset=utf-8',
  CacheControl: 'public, max-age=60',
}))

console.log('Catálogo de notas atualizado no Cloudflare R2.')
