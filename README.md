# BOBOBO Creature AI Worker

BOBOBOの行動候補をCloudflare Workers AIで低頻度に選ぶバックエンドです。
ブラウザへCloudflareの認証情報を置く必要はありません。

## 開発

```bash
npm install
npx wrangler dev
```

ローカルのGitHub Pages相当から接続する場合だけ、`wrangler.jsonc`の
`ALLOW_LOCALHOST`を`"true"`にします。本番では必ず`"false"`へ戻してください。

## デプロイ

```bash
npx wrangler deploy
```

デプロイ後のURLを`../src/config.js`に設定するか、ページを`?debug=1`で開き、
開発パネルへ入力します。アカウントID、APIトークン、実URLはコミットしません。

Workers AIはローカル開発を含め、利用量に応じて課金または利用制限が発生する
可能性があります。Cloudflareダッシュボードで利用量を確認してください。

簡易レート制限はWorkerインスタンス内メモリを使うPoC用です。厳密な分散制限が
必要になった場合はCloudflare Rate Limiting bindingまたはDurable Objectsへ
置き換えてください。
