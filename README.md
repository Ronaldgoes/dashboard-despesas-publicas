# Dashboard de Despesas Públicas

## Notas de empenho: Vercel + Cloudflare R2, sem banco de dados

As 753 mil notas não são enviadas para Git, Vercel ou PostgreSQL. O projeto mantém o CSV original intocado e cria uma cópia estática segmentada por **órgão**, **ano** e **página**. Esses arquivos ficam no Cloudflare R2; o site baixa apenas o recorte que a pessoa abriu.

### Preparar a base

O arquivo de origem não é modificado:

```powershell
npm run preparar:empenhos -- "C:\Users\rgoes\Downloads\base de dados notas de empenho poder executivo 2022 a 2026 (1).csv"
```

O resultado é criado em `.dados-empenho/`, ignorado pelo Git.

### Publicar no Cloudflare R2

1. No Cloudflare, crie um bucket R2 chamado `notas-empenho`.
2. Crie uma **R2 API Token** com permissão de leitura/escrita para esse bucket.
3. No `.env` local, preencha as quatro variáveis abaixo. Nunca envie esse arquivo ao Git ou Vercel:

   ```text
   CLOUDFLARE_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET_NAME=notas-empenho
   ```

4. Habilite acesso público por um domínio customizado para o bucket e copie sua URL, por exemplo `https://dados.seudominio.com`.
5. Publique a base:

   ```powershell
   npm run publicar:empenhos
   ```

### Configurar Vercel

Em **Settings → Environment Variables**, crie para Production e Preview:

```text
VITE_EMPENHOS_STORAGE_URL=https://dados.seudominio.com
```

Depois faça um **Redeploy**. Essa é a única variável que o Vercel precisa para as notas; ela é pública e não dá acesso de escrita ao R2.

### Atualizar depois

Rode novamente os comandos de preparar e publicar com o CSV novo. O CSV original continua preservado; somente a cópia de publicação é substituída.
